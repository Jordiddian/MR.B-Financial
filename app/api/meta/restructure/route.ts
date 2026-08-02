import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const GRAPH = 'https://graph.facebook.com/v20.0'

async function metaPatch(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params)
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Meta API error')
  return json
}

export async function POST(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.META_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Meta token not configured' }, { status: 500 })

  const body = await request.json()
  const { log_id, action: directAction, meta_campaign_id: directCampaignId, params: directParams } = body

  // Support two call patterns:
  // 1. { log_id, approve: true } — approve a pending restructure_log entry
  // 2. { action, meta_campaign_id, params } — direct action (e.g. from campaigns page buttons)

  let action: string
  let meta_campaign_id: string
  let params: Record<string, unknown>
  let logEntry: Record<string, unknown> | null = null

  if (log_id) {
    const { data } = await supabase.from('restructure_log').select('*').eq('id', log_id).single()
    if (!data) return NextResponse.json({ error: 'Action not found' }, { status: 404 })
    if ((data as Record<string, unknown>).status !== 'pending') {
      return NextResponse.json({ error: 'Action already processed' }, { status: 400 })
    }
    logEntry = data as Record<string, unknown>
    action = logEntry.action as string
    meta_campaign_id = logEntry.meta_campaign_id as string
    params = (logEntry.params as Record<string, unknown>) ?? {}
  } else {
    action = directAction
    meta_campaign_id = directCampaignId
    params = directParams ?? {}
  }

  if (!action || !meta_campaign_id) {
    return NextResponse.json({ error: 'action and meta_campaign_id required' }, { status: 400 })
  }

  let result: Record<string, unknown> = {}

  try {
    if (action === 'pause') {
      // Pause the campaign in Meta
      result = await metaPatch(meta_campaign_id, { status: 'PAUSED', access_token: token })
      // Update our campaigns table
      await supabase.from('campaigns')
        .update({ status: 'paused', paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('meta_campaign_id', meta_campaign_id)

    } else if (action === 'scale_budget') {
      // Get the campaign's ad sets to find current budgets
      const adsetRes = await fetch(`${GRAPH}/${meta_campaign_id}/adsets?fields=id,daily_budget&access_token=${token}`)
      const adsetData = await adsetRes.json()
      const scalePercent = (params.scale_percent as number) ?? 25
      const results: unknown[] = []

      for (const adset of adsetData.data ?? []) {
        const currentBudget = parseInt(adset.daily_budget ?? '0')
        if (currentBudget === 0) continue
        const newBudget = Math.round(currentBudget * (1 + scalePercent / 100))
        const r = await metaPatch(adset.id, {
          daily_budget: String(newBudget),
          access_token: token,
        })
        results.push(r)
      }
      result = { scaled: results.length, scale_percent: scalePercent }
      // Update campaigns table with new budget
      const { data: campaign } = await supabase.from('campaigns').select('daily_budget_cents').eq('meta_campaign_id', meta_campaign_id).single()
      if (campaign) {
        const newBudget = Math.round(((campaign as Record<string, unknown>).daily_budget_cents as number ?? 0) * (1 + scalePercent / 100))
        await supabase.from('campaigns')
          .update({ daily_budget_cents: newBudget, updated_at: new Date().toISOString() })
          .eq('meta_campaign_id', meta_campaign_id)
      }

    } else if (action === 'mark_template') {
      // No Meta API call — just mark in our DB
      const notes = params.template_notes as string ?? `Marked as template by ${user.email}`
      await supabase.from('campaigns')
        .update({ is_template: true, template_notes: notes, updated_at: new Date().toISOString() })
        .eq('meta_campaign_id', meta_campaign_id)
      result = { marked: true }

    } else if (action === 'refresh_creative' || action === 'duplicate') {
      // These require generating a new creative and publishing — surface for human action
      result = {
        requires_manual_action: true,
        instructions: action === 'duplicate'
          ? 'Go to Meta Ads Manager → find this campaign → Duplicate it → keep identical targeting → swap to a new creative from the Approvals tab.'
          : 'Go to Approvals → Generate a new ad for this product type → Approve it → Push to Meta with the same daily budget. Do not edit the existing campaign.',
      }
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    // Mark log entry as executed if this came from the log
    if (log_id) {
      await supabase.from('restructure_log').update({
        status: 'executed',
        executed_at: new Date().toISOString(),
        executed_by: user.email,
        result,
      }).eq('id', log_id)
    } else {
      // Log the direct action
      const { data: campaign } = await supabase.from('campaigns').select('id, ad_type').eq('meta_campaign_id', meta_campaign_id).single()
      await supabase.from('restructure_log').insert({
        campaign_id: (campaign as Record<string, unknown> | null)?.id ?? null,
        meta_campaign_id,
        ad_type: (campaign as Record<string, unknown> | null)?.ad_type ?? null,
        action, reason: 'Manual action by user',
        status: 'executed',
        executed_at: new Date().toISOString(),
        executed_by: user.email,
        result,
        params,
      })
    }

    return NextResponse.json({ success: true, action, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Action failed'
    if (log_id) {
      await supabase.from('restructure_log').update({ status: 'pending', result: { error: msg } }).eq('id', log_id)
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

// Dismiss a pending action without executing it
export async function DELETE(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { log_id } = await request.json()
  if (!log_id) return NextResponse.json({ error: 'log_id required' }, { status: 400 })

  await supabase.from('restructure_log').update({
    status: 'dismissed',
    executed_at: new Date().toISOString(),
    executed_by: user.email,
  }).eq('id', log_id).eq('status', 'pending')

  return NextResponse.json({ success: true })
}
