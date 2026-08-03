import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { generateAd } from '@/lib/ads/creative'
import { publishAdToMeta } from '@/lib/ads/meta-publish'
import { planBudget } from '@/lib/optimizer/budget'
import { AUTO_ELIGIBLE_TYPES, isInLearningPhase, daysRunning, GUARDRAILS } from '@/lib/optimizer/config'
import { assignVariants, recordAllAssignments, ensureBaselineExperiments } from '@/lib/experiments/growthbook'

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
//
// Pacing is self-calibrating, not a fixed clock: rather than "launch the next
// line every N hours" regardless of how the last one is doing, this checks
// whether the most recently auto-launched campaign has actually cleared
// Meta's learning phase (GUARDRAILS.MIN_DAYS_RUNNING days AND
// MIN_LEADS_FOR_SIGNAL leads — the same signal the daily optimizer uses
// before it will touch a campaign's budget) before adding another. A slow
// starter naturally pushes the next launch back; a fast one lets the next
// line go out sooner. There used to be a user-facing cadence dropdown here —
// removed, because a blind timer was strictly worse than reading the
// campaign's own data.

async function runAutoAds(authHeader: string | null) {
  const isCron = isCronRequest(authHeader)
  if (!isCron) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: settings } = await supabase
    .from('budget_settings')
    .select('auto_ads_enabled, auto_ads_rotation_index, monthly_cap')
    .eq('id', 1)
    .single()

  if (!settings?.auto_ads_enabled) {
    return NextResponse.json({ ran: false, note: 'Auto-ads is disabled — turn it on in Settings when you\'re ready to move past organic posting.' })
  }

  // Self-calibrated pacing: don't add another line while the most recently
  // auto-launched one is still proving itself.
  const { data: autoAdsAds } = await supabase.from('ads').select('id').eq('generated_by', 'auto_ads')
  const autoAdsAdIds = (autoAdsAds ?? []).map(a => a.id)

  if (autoAdsAdIds.length > 0) {
    const { data: recentCampaigns } = await supabase
      .from('campaigns')
      .select('ad_type, started_at, paused_at, total_leads, status')
      .in('ad_id', autoAdsAdIds)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)

    const mostRecent = recentCampaigns?.[0]
    if (mostRecent && isInLearningPhase(mostRecent)) {
      const days = daysRunning(mostRecent)
      const leads = mostRecent.total_leads ?? 0
      const note =
        `Waiting for ${mostRecent.ad_type}'s campaign to clear learning phase before launching another ` +
        `(${days}d of ${GUARDRAILS.MIN_DAYS_RUNNING} minimum, ${leads} of ${GUARDRAILS.MIN_LEADS_FOR_SIGNAL} leads).`
      await supabase.from('budget_settings').update({ last_auto_ads_at: new Date().toISOString() }).eq('id', 1)
      await supabase.from('auto_action_log').insert({ kind: 'ad', ad_type: 'n/a', status: 'skipped', reason: note })
      return NextResponse.json({ ran: true, status: 'skipped', reason: note })
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

  // Paid ads test both image_style and audience_type (the targeting-language
  // calibration) — audience_type has no meaning for organic posts, so this
  // route is the only auto-generation path that seeds it.
  let style = 'lifestyle'
  let assignments: Record<string, string> = {}
  let assignmentKeys: Record<string, string> = {}
  try {
    await ensureBaselineExperiments([adType], ['image_style', 'audience_type'])
    const result = await assignVariants(adType, `${adType}-autoads-${Date.now()}`)
    assignments = result.assignments
    assignmentKeys = result.keys
    if (assignments.image_style) style = assignments.image_style
  } catch {
    // Non-fatal.
  }

  try {
    const { ad, draft } = await generateAd({
      adType,
      mode: 'ad',
      imageStyle: style,
      generatedBy: 'auto_ads',
      experimentKey: assignmentKeys.image_style,
      experimentVariant: assignments.image_style,
    })
    const adId = ad.id as string

    await recordAllAssignments(adId, assignments, assignmentKeys).catch(() => {})

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
