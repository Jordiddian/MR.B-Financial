import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { generateAd } from '@/lib/ads/creative'
import { publishAdToMeta } from '@/lib/ads/meta-publish'
import { planBudget } from '@/lib/optimizer/budget'
import { AUTO_ELIGIBLE_TYPES } from '@/lib/optimizer/config'
import { assignVariants, recordAssignment } from '@/lib/experiments/growthbook'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fully automatic paid campaigns: generate → approve → publish → ACTIVATE,
// no human step. This is the one pipeline in the whole system that makes a
// campaign spend real money without a person looking at it first — it exists
// because Jordan asked for it explicitly, and it defaults to OFF
// (auto_ads_enabled) until switched on in Settings.
//
// Two guardrails that hold regardless of the auto_ads_enabled switch:
//   1. Never launch a paid campaign the budget can't afford — planBudget is
//      the same code path publish uses, so it can't spend past the monthly
//      cap here either.
//   2. Never auto-launch anything the AI flagged for CMS filing or human
//      review. Those go to Approvals for a person to decide, same as manual
//      generation. This is not configurable — CMS violations carry real
//      penalties (see the system prompt), and no automation setting should
//      be able to skip that check.
//
// Ramp strategy: give every eligible product line one active campaign before
// creating a second for any of them. Once a line has one running, further
// scaling is the optimizer's job (app/api/meta/optimize), not this route's —
// this route is for coverage, not scaling.

async function runAutoAds(authHeader: string | null) {
  const isCron = isCronRequest(authHeader)
  if (!isCron) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: settings } = await supabase
    .from('budget_settings')
    .select('auto_ads_enabled, auto_ads_cadence_hours, last_auto_ads_at, auto_ads_rotation_index, monthly_cap')
    .eq('id', 1)
    .single()

  if (!settings?.auto_ads_enabled) {
    return NextResponse.json({ ran: false, note: 'Auto-ads is disabled — turn it on in Settings when you\'re ready to move past organic posting.' })
  }

  const cadenceHours = settings.auto_ads_cadence_hours ?? 168
  if (settings.last_auto_ads_at) {
    const elapsedHours = (Date.now() - new Date(settings.last_auto_ads_at).getTime()) / 3_600_000
    if (elapsedHours < cadenceHours) {
      return NextResponse.json({
        ran: false,
        note: `Last auto-ads run was ${elapsedHours.toFixed(1)}h ago — next one due at ${cadenceHours}h.`,
      })
    }
  }

  // Budget check up front — no point generating creative for a campaign that
  // can't launch.
  const monthlyCapCents = Math.round((settings.monthly_cap ?? 0) * 100)
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: spendRows } = await supabase.from('spending_log').select('amount').gte('created_at', startOfMonth)
  const spentCents = (spendRows ?? []).reduce((s, r) => s + Math.round((r.amount ?? 0) * 100), 0)
  const plan = planBudget({ monthlyCapCents, spentCents })

  if (!plan.viable) {
    await supabase.from('budget_settings').update({ last_auto_ads_at: new Date().toISOString() }).eq('id', 1)
    await supabase.from('auto_action_log').insert({
      kind: 'ad', ad_type: 'n/a', status: 'skipped', reason: plan.note,
    })
    return NextResponse.json({ ran: true, status: 'skipped', reason: plan.note })
  }

  // Which eligible product lines already have an active campaign?
  const { data: activeCampaigns } = await supabase
    .from('campaigns')
    .select('ad_type')
    .eq('status', 'active')
    .in('ad_type', AUTO_ELIGIBLE_TYPES)

  const covered = new Set((activeCampaigns ?? []).map(c => c.ad_type))
  const uncovered = AUTO_ELIGIBLE_TYPES.filter(t => !covered.has(t))

  if (uncovered.length === 0) {
    await supabase.from('budget_settings').update({ last_auto_ads_at: new Date().toISOString() }).eq('id', 1)
    await supabase.from('auto_action_log').insert({
      kind: 'ad', ad_type: 'n/a', status: 'skipped',
      reason: 'Every eligible product line already has an active campaign — further scaling is the optimizer\'s job, not auto-ads.',
    })
    return NextResponse.json({
      ran: true, status: 'skipped',
      reason: 'All product lines covered. Scaling winners happens automatically via the daily optimizer.',
    })
  }

  const rotationIndex = settings.auto_ads_rotation_index ?? 0
  const adType = uncovered[rotationIndex % uncovered.length]

  const now = new Date().toISOString()
  await supabase.from('budget_settings').update({
    last_auto_ads_at: now,
    auto_ads_rotation_index: rotationIndex + 1,
  }).eq('id', 1)

  let style = 'lifestyle'
  let experimentKey: string | undefined
  let experimentVariant: string | undefined
  try {
    const { assignments, keys } = await assignVariants(adType, `${adType}-autoads-${Date.now()}`)
    if (assignments.image_style) {
      style = assignments.image_style
      experimentVariant = assignments.image_style
      experimentKey = keys.image_style
    }
  } catch {
    // Non-fatal.
  }

  try {
    const { ad, draft } = await generateAd({
      adType,
      mode: 'ad',
      imageStyle: style,
      generatedBy: 'auto_ads',
      experimentKey,
      experimentVariant,
    })
    const adId = ad.id as string

    if (experimentKey && experimentVariant) {
      await recordAssignment({ experimentKey, adId, variant: experimentVariant }).catch(() => {})
    }

    // Hard compliance carve-out — see file header. Not gated by any setting.
    if (draft.requires_cms_filing || draft.requires_human_review) {
      await supabase.from('auto_action_log').insert({
        kind: 'ad', ad_type: adType, ad_id: adId,
        status: 'held_for_review',
        reason: draft.requires_cms_filing
          ? 'AI flagged this ad as requiring CMS filing — held for manual review, never auto-launched.'
          : 'AI flagged this ad as requiring human review — held for manual review.',
      })
      return NextResponse.json({
        ran: true, ad_type: adType, ad_id: adId, status: 'held_for_review',
        note: 'Generated but held for manual review — check Approvals.',
      })
    }

    await supabase.from('ads').update({ status: 'approved' }).eq('id', adId)
    const result = await publishAdToMeta(adId, { activate: true })

    if (!result.success) {
      await supabase.from('auto_action_log').insert({
        kind: 'ad', ad_type: adType, ad_id: adId, status: 'failed', reason: result.error,
      })
      return NextResponse.json({ ran: true, ad_type: adType, ad_id: adId, status: 'failed', error: result.error })
    }

    await supabase.from('auto_action_log').insert({
      kind: 'ad', ad_type: adType, ad_id: adId, meta_campaign_id: result.campaign_id,
      status: 'published',
      result: { meta_ad_id: result.meta_ad_id, budget_strategy: result.budgetPlan.strategy, daily_budget: result.budgetPlan.dailyBudgetCents },
    })

    return NextResponse.json({
      ran: true, ad_type: adType, ad_id: adId, status: 'published', activated: result.activated,
      meta_campaign_id: result.campaign_id,
      daily_budget: `$${(result.budgetPlan.dailyBudgetCents / 100).toFixed(2)}`,
      budget_strategy: result.budgetPlan.strategy,
      note: result.budgetPlan.note,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-ads failed'
    await supabase.from('auto_action_log').insert({
      kind: 'ad', ad_type: adType, status: 'failed', reason: message,
    })
    return NextResponse.json({ ran: true, ad_type: adType, status: 'failed', error: message }, { status: 502 })
  }
}

export async function GET(request: Request) {
  return runAutoAds(request.headers.get('authorization'))
}
export async function POST(request: Request) {
  return runAutoAds(request.headers.get('authorization'))
}
