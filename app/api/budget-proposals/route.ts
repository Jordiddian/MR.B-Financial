import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH = 'https://graph.facebook.com/v20.0'

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET — pending proposals for the approval banner (or ?status=… for history)
export async function GET(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'pending'
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '25')
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 25

  const { data, error } = await supabase
    .from('budget_proposals')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — approve a proposal. This is the ONLY path that moves real money;
// the optimizer itself never calls Meta. Mirrors the publish-as-PAUSED gate.
export async function POST(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Meta token not configured' }, { status: 500 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: proposal } = await supabase
    .from('budget_proposals')
    .select('*')
    .eq('id', id)
    .single()

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: 'Proposal already reviewed' }, { status: 400 })
  }

  try {
    // Re-read the live budget at approval time. If Bruce changed it manually
    // since the proposal was written, the stored "current" is stale and
    // applying the absolute target would produce a bigger swing than reviewed.
    const adsetRes = await fetch(
      `${GRAPH}/${proposal.meta_campaign_id}/adsets?fields=id,daily_budget&access_token=${token}`
    )
    const adsetJson = await adsetRes.json()
    if (!adsetRes.ok || adsetJson.error) {
      throw new Error(adsetJson.error?.message ?? 'Could not read ad sets from Meta')
    }

    const adsets = (adsetJson.data ?? []).filter(
      (a: { daily_budget?: string }) => a.daily_budget && parseInt(a.daily_budget) > 0
    )
    if (adsets.length === 0) throw new Error('No ad set with a daily budget found on this campaign')

    const liveCents = parseInt(adsets[0].daily_budget)
    const driftPercent = Math.abs((liveCents - proposal.current_budget_cents) / proposal.current_budget_cents) * 100

    if (driftPercent > 10) {
      return NextResponse.json({
        error:
          `The live budget ($${(liveCents / 100).toFixed(2)}/day) no longer matches what this ` +
          `proposal was calculated against ($${(proposal.current_budget_cents / 100).toFixed(2)}/day). ` +
          `It was changed in Meta directly. Dismiss this proposal — the optimizer will write a fresh one on its next run.`,
        stale: true,
      }, { status: 409 })
    }

    // Apply the same percentage the proposal was reviewed at, against the live
    // number — so what actually happens matches what was approved.
    const multiplier = 1 + Number(proposal.change_percent) / 100
    const newCents = Math.max(100, Math.round(liveCents * multiplier))

    const applied: { adset_id: string; from: number; to: number }[] = []
    for (const adset of adsets) {
      const from = parseInt(adset.daily_budget)
      const to = Math.max(100, Math.round(from * multiplier))
      const res = await fetch(`${GRAPH}/${adset.id}`, {
        method: 'POST',
        body: new URLSearchParams({ daily_budget: String(to), access_token: token }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        throw new Error(json.error?.error_user_msg || json.error?.message || 'Meta rejected the budget change')
      }
      applied.push({ adset_id: adset.id, from, to })
    }

    const now = new Date().toISOString()

    await supabase.from('budget_proposals').update({
      status: 'approved',
      reviewed_at: now,
      reviewed_by: user.email,
      result: { applied, new_budget_cents: newCents },
    }).eq('id', id)

    // Stamp the cooldown so the optimizer won't propose again for 5 days.
    await supabase.from('campaigns').update({
      daily_budget_cents: newCents,
      last_budget_change_at: now,
      updated_at: now,
    }).eq('meta_campaign_id', proposal.meta_campaign_id)

    // Keep the existing action log as the single audit trail for anything
    // that touched Meta, so the Campaigns page history stays complete.
    await supabase.from('restructure_log').insert({
      campaign_id: proposal.campaign_id,
      meta_campaign_id: proposal.meta_campaign_id,
      ad_type: proposal.ad_type,
      action: 'scale_budget',
      reason: proposal.reason,
      urgency: 'next_cycle',
      params: { scale_percent: Number(proposal.change_percent), source: 'optimizer' },
      status: 'executed',
      executed_at: now,
      executed_by: user.email,
      result: { applied },
    })

    return NextResponse.json({
      success: true,
      applied,
      new_daily_budget: `$${(newCents / 100).toFixed(2)}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Budget change failed'
    await supabase.from('budget_proposals')
      .update({ result: { error: message } })
      .eq('id', id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// DELETE — dismiss a proposal without touching Meta.
export async function DELETE(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('budget_proposals').update({
    status: 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.email,
  }).eq('id', id).eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
