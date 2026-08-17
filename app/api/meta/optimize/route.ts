import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  GUARDRAILS,
  hasReliableSignal,
  inBudgetCooldown,
  clampBudget,
  daysRunning,
  seasonalCplTarget,
} from '@/lib/optimizer/config'
import { rollUpExperimentResults } from '@/lib/experiments/growthbook'
import { isCronRequest } from '@/lib/auth/cron'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH = 'https://graph.facebook.com/v20.0'

interface CampaignRow {
  id: string
  meta_campaign_id: string
  meta_adset_id: string | null
  ad_type: string
  campaign_name: string | null
  status: string
  started_at: string | null
  paused_at: string | null
  days_running: number | null
  total_spend: number | null
  total_leads: number | null
  avg_cpl: number | null
  latest_score: number | null
  in_learning_phase: boolean | null
  daily_budget_cents: number | null
  last_budget_change_at: string | null
}

interface Proposal {
  campaign_id: string
  meta_campaign_id: string
  ad_type: string
  direction: 'increase' | 'decrease'
  current_budget_cents: number
  proposed_budget_cents: number
  change_percent: number
  reason: string
  ai_score: number | null
  cost_per_lead: number | null
  cpl_target: number | null
}

/**
 * Read the campaign's live daily budget from Meta rather than trusting our
 * cached copy — Bruce may have changed it by hand in Ads Manager, and
 * proposing a change off a stale number would be worse than proposing nothing.
 */
async function fetchLiveBudgetCents(
  metaCampaignId: string,
  token: string
): Promise<{ cents: number; adsetId: string } | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${metaCampaignId}/adsets?fields=id,daily_budget,status&access_token=${token}`
    )
    const json = await res.json()
    if (!res.ok || json.error) return null
    const active = (json.data ?? []).find(
      (a: { daily_budget?: string; status?: string }) =>
        a.daily_budget && parseInt(a.daily_budget) > 0
    )
    if (!active) return null
    return { cents: parseInt(active.daily_budget), adsetId: active.id }
  } catch {
    return null
  }
}

/**
 * Decide what to do with one campaign. Pure function over the campaign's
 * numbers — no side effects, no API calls, so the logic is easy to reason
 * about and the guardrails are all visible in one place.
 */
function evaluate(
  c: CampaignRow,
  liveBudgetCents: number
): Omit<Proposal, 'campaign_id' | 'meta_campaign_id' | 'ad_type'> | null {
  // Widened automatically during Medicare AEP / Covered CA Open Enrollment —
  // see seasonalCplTarget's own comment for why a flat target is wrong here.
  const target = seasonalCplTarget(c.ad_type)
  const cpl = c.avg_cpl == null ? null : Number(c.avg_cpl)
  const score = c.latest_score == null ? null : Number(c.latest_score)
  const leads = c.total_leads ?? 0
  const spend = Number(c.total_spend ?? 0)

  const cplRatio = cpl != null && target ? cpl / target : null

  let direction: 'increase' | 'decrease' | null = null
  let rawPercent = 0
  let reason = ''

  // ── Cut first. Losing money is more urgent than winning more of it. ──
  if (cplRatio != null && cplRatio >= GUARDRAILS.CPL_CUT_MULTIPLE) {
    direction = 'decrease'
    // The worse the overshoot, the harder the cut — capped by the guardrail.
    rawPercent = Math.min(GUARDRAILS.MAX_DECREASE_PERCENT, Math.round((cplRatio - 1) * 20))
    reason =
      `Cost per lead is $${cpl!.toFixed(2)} against a $${target} target ` +
      `(${cplRatio.toFixed(1)}× over) across ${leads} leads and $${spend.toFixed(2)} spent. ` +
      `Pulling budget back rather than pausing preserves the learning history.`
  } else if (leads === 0 && spend >= GUARDRAILS.MIN_SPEND_FOR_SIGNAL * 2) {
    direction = 'decrease'
    rawPercent = GUARDRAILS.MAX_DECREASE_PERCENT
    reason =
      `$${spend.toFixed(2)} spent with zero leads over ${daysRunning(c)} days. ` +
      `Cutting budget to the floor while the creative gets refreshed.`
  } else if (score != null && score < GUARDRAILS.CUT_SCORE_THRESHOLD) {
    direction = 'decrease'
    rawPercent = 20
    reason =
      `AI score is ${score}/100 — below the ${GUARDRAILS.CUT_SCORE_THRESHOLD} floor. ` +
      `${cpl != null ? `CPL $${cpl.toFixed(2)}. ` : ''}Reducing exposure until the score recovers.`
  }
  // ── Then scale winners. Both signals must agree. ──
  else if (
    score != null &&
    score >= GUARDRAILS.SCALE_SCORE_THRESHOLD &&
    cplRatio != null &&
    cplRatio <= 1
  ) {
    direction = 'increase'
    // Stronger performance earns a bigger step, still capped at 25%.
    const headroom = 1 - cplRatio
    rawPercent = Math.min(
      GUARDRAILS.MAX_INCREASE_PERCENT,
      Math.round(20 + headroom * 20)
    )
    reason =
      `Score ${score}/100 with cost per lead at $${cpl!.toFixed(2)} against a $${target} target ` +
      `(${Math.round((1 - cplRatio) * 100)}% under) across ${leads} leads. ` +
      `This is a winner — scaling within Meta's safe-increase band.`
  }

  if (!direction || rawPercent <= 0) return null

  const signed = direction === 'increase' ? 1 + rawPercent / 100 : 1 - rawPercent / 100
  const proposed = clampBudget(liveBudgetCents, Math.round(liveBudgetCents * signed))

  // Clamping may have flattened the change to nothing — don't propose a no-op.
  if (proposed === liveBudgetCents) return null

  const actualPercent = Number(
    (((proposed - liveBudgetCents) / liveBudgetCents) * 100).toFixed(2)
  )

  return {
    direction,
    current_budget_cents: liveBudgetCents,
    proposed_budget_cents: proposed,
    change_percent: actualPercent,
    reason,
    ai_score: score,
    cost_per_lead: cpl,
    cpl_target: target,
  }
}

async function runOptimize(authHeader: string | null) {
  if (!isCronRequest(authHeader)) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.META_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Meta token not configured' }, { status: 500 })
  }

  // Expire stale proposals before writing new ones — a three-day-old
  // recommendation was computed against data that has since moved.
  const expiryCutoff = new Date(
    Date.now() - GUARDRAILS.PROPOSAL_EXPIRY_HOURS * 3_600_000
  ).toISOString()
  const { data: expired } = await supabase
    .from('budget_proposals')
    .update({ status: 'expired', reviewed_at: new Date().toISOString(), reviewed_by: 'system' })
    .eq('status', 'pending')
    .lt('created_at', expiryCutoff)
    .select('id')

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'active')

  const active = (campaigns ?? []) as CampaignRow[]

  const proposals: Proposal[] = []
  const skipped: { campaign: string; why: string }[] = []

  for (const c of active) {
    if (!c.meta_campaign_id) continue

    if (!hasReliableSignal(c)) {
      skipped.push({
        campaign: c.campaign_name ?? c.ad_type,
        why: `insufficient signal (${daysRunning(c)}d, ${c.total_leads ?? 0} leads, $${Number(c.total_spend ?? 0).toFixed(2)})`,
      })
      continue
    }

    if (inBudgetCooldown(c.last_budget_change_at)) {
      skipped.push({
        campaign: c.campaign_name ?? c.ad_type,
        why: `budget changed within the last ${GUARDRAILS.BUDGET_CHANGE_COOLDOWN_DAYS} days`,
      })
      continue
    }

    const live = await fetchLiveBudgetCents(c.meta_campaign_id, token)
    const budgetCents = live?.cents ?? c.daily_budget_cents ?? 0
    if (budgetCents <= 0) {
      skipped.push({ campaign: c.campaign_name ?? c.ad_type, why: 'no daily budget found on Meta' })
      continue
    }

    const decision = evaluate(c, budgetCents)
    if (!decision) {
      skipped.push({ campaign: c.campaign_name ?? c.ad_type, why: 'performing within tolerance — no change' })
      continue
    }

    proposals.push({
      campaign_id: c.id,
      meta_campaign_id: c.meta_campaign_id,
      ad_type: c.ad_type,
      ...decision,
    })
  }

  // Replace any existing pending proposal for these campaigns — one live
  // recommendation per campaign, always reflecting the newest data.
  let written = 0
  for (const p of proposals) {
    await supabase
      .from('budget_proposals')
      .update({
        status: 'expired',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'system',
      })
      .eq('meta_campaign_id', p.meta_campaign_id)
      .eq('status', 'pending')

    const { error } = await supabase.from('budget_proposals').insert({ ...p, status: 'pending' })
    if (!error) written++
  }

  // Fold the latest performance into any running experiments while we're here.
  let experimentSummary = { updated: 0, concluded: 0 }
  try {
    experimentSummary = await rollUpExperimentResults()
  } catch {
    // Non-fatal — experiment roll-up must never block budget proposals.
  }

  return NextResponse.json({
    evaluated: active.length,
    proposed: written,
    expired: expired?.length ?? 0,
    skipped,
    experiments: experimentSummary,
    note: written > 0
      ? 'Proposals staged for approval. No budget has changed — approve them in the portal.'
      : 'No budget changes recommended this cycle.',
  })
}

export async function GET(request: Request) {
  return runOptimize(request.headers.get('authorization'))
}
export async function POST(request: Request) {
  return runOptimize(request.headers.get('authorization'))
}
