import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateAd } from '@/lib/ads/creative'
import { CPL_TARGETS, GUARDRAILS, daysRunning } from '@/lib/optimizer/config'
import {
  assignVariants,
  recordAllAssignments,
  ensureBaselineExperiments,
} from '@/lib/experiments/growthbook'
import { isCronRequest } from '@/lib/auth/cron'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Weekly creative refresh — Hyper's cadence, but narrowed deliberately.
//
// We only regenerate creative for ad types that are ALREADY WORKING. A losing
// ad type doesn't need a fresh coat of paint; it needs a strategy change, and
// that's a human decision surfaced through the restructure queue. Refreshing
// winners is what fights creative fatigue (rising frequency, falling CTR) on
// the campaigns actually earning their spend.
//
// Output is a pending ad, same as any other generation — nothing goes live
// without approval.

// Was 6 — industry guidance (Insurance_FB_IG_Advertising_Strategy.docx, Aug
// 2026) recommends refreshing winning creative every 2–3 weeks to stay ahead
// of fatigue without resetting Meta's delivery optimization too often. This
// route's own cron only runs weekly anyway, so 6 days didn't actually change
// the real refresh cadence — it just meant every single weekly run refreshed
// every eligible winner, which is more frequent than the recommended window.
const REFRESH_COOLDOWN_DAYS = 14

interface WinnerCampaign {
  id: string
  ad_id: string | null
  ad_type: string
  latest_score: number | null
  avg_cpl: number | null
  total_leads: number | null
  total_spend: number | null
  image_style: string | null
  is_template: boolean | null
  template_notes: string | null
  started_at: string | null
  paused_at: string | null
  days_running: number | null
}

/** A campaign qualifies its ad type for refresh only if it's genuinely winning. */
function isWinner(c: WinnerCampaign): boolean {
  if (daysRunning(c) < GUARDRAILS.MIN_DAYS_RUNNING) return false

  const score = c.latest_score ?? 0
  const cpl = c.avg_cpl == null ? null : Number(c.avg_cpl)
  const target = CPL_TARGETS[c.ad_type]
  const leads = c.total_leads ?? 0

  // Needs real lead volume to call it a winner at all.
  if (leads < 10) return false

  // Either the AI rates it highly, or the economics speak for themselves.
  const scoreQualifies = score >= GUARDRAILS.SCALE_SCORE_THRESHOLD
  const cplQualifies = cpl != null && target != null && cpl <= target

  return scoreQualifies || cplQualifies
}

async function refreshedRecently(adType: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - REFRESH_COOLDOWN_DAYS * 86_400_000).toISOString()
  const { data } = await supabase
    .from('creative_refresh_log')
    .select('id')
    .eq('ad_type', adType)
    .eq('status', 'generated')
    .gte('created_at', cutoff)
    .limit(1)
  return (data?.length ?? 0) > 0
}

/** Pull together what made this ad type win, so the new creative builds on it. */
async function buildWinningContext(c: WinnerCampaign): Promise<string> {
  const parts: string[] = []

  const cpl = c.avg_cpl == null ? null : Number(c.avg_cpl)
  parts.push(
    `Current best performer for ${c.ad_type}: AI score ${c.latest_score ?? '—'}/100, ` +
    `${c.total_leads ?? 0} leads at ${cpl != null ? `$${cpl.toFixed(2)}` : '—'} cost per lead ` +
    `(target $${CPL_TARGETS[c.ad_type] ?? '—'}).`
  )
  if (c.image_style) parts.push(`Winning image style: ${c.image_style}.`)
  if (c.is_template && c.template_notes) parts.push(`Template notes: ${c.template_notes}`)

  if (c.ad_id) {
    const { data: sourceAd } = await supabase
      .from('ads')
      .select('headline, body_copy, call_to_action')
      .eq('id', c.ad_id)
      .maybeSingle()
    if (sourceAd) {
      parts.push(
        `The ad that achieved this used headline "${sourceAd.headline}" with body copy ` +
        `"${sourceAd.body_copy}" and CTA "${sourceAd.call_to_action ?? '—'}".`
      )
    }
  }

  return parts.join(' ')
}

async function runRefresh(authHeader: string | null) {
  if (!isCronRequest(authHeader)) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 })
  }

  // Respect the kill switch — Posting Mode means no paid creative at all.
  const { data: settings } = await supabase
    .from('budget_settings')
    .select('posting_mode, monthly_cap')
    .eq('id', 1)
    .single()

  const mode: 'ad' | 'post' = settings?.posting_mode ? 'post' : 'ad'

  // Don't burn generation budget if the monthly cap is already exhausted.
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: spendRows } = await supabase
    .from('spending_log')
    .select('amount')
    .gte('created_at', startOfMonth)
  const spent = (spendRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const cap = settings?.monthly_cap == null ? null : Number(settings.monthly_cap)

  if (cap != null && spent >= cap) {
    return NextResponse.json({
      refreshed: 0,
      skipped: [{ ad_type: 'all', why: `monthly cap of $${cap} already reached ($${spent.toFixed(2)} spent)` }],
    })
  }

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('status', 'active')

  const active = (campaigns ?? []) as WinnerCampaign[]

  // Best winning campaign per ad type — one refresh per product line per week.
  const bestByType = new Map<string, WinnerCampaign>()
  for (const c of active) {
    if (!isWinner(c)) continue
    const existing = bestByType.get(c.ad_type)
    if (!existing || (c.latest_score ?? 0) > (existing.latest_score ?? 0)) {
      bestByType.set(c.ad_type, c)
    }
  }

  // Make sure there's an experiment to assign against before generating.
  // audience_type only applies in ad mode — organic posts have no Meta
  // targeting to vary.
  const refreshDimensions = mode === 'ad' ? (['image_style', 'audience_type'] as const) : (['image_style'] as const)
  await ensureBaselineExperiments([...bestByType.keys()], [...refreshDimensions]).catch(() => {})

  const refreshed: { ad_type: string; ad_id: string; variant: string | null }[] = []
  const skipped: { ad_type: string; why: string }[] = []

  for (const [adType, winner] of bestByType) {
    if (await refreshedRecently(adType)) {
      skipped.push({ ad_type: adType, why: `already refreshed within ${REFRESH_COOLDOWN_DAYS} days` })
      continue
    }

    // Let the running experiment pick the style; fall back to what won before.
    let style = winner.image_style ?? 'lifestyle'
    let assignments: Record<string, string> = {}
    let assignmentKeys: Record<string, string> = {}
    try {
      const result = await assignVariants(adType, `${adType}-refresh-${Date.now()}`)
      assignments = result.assignments
      assignmentKeys = result.keys
      if (assignments.image_style) style = assignments.image_style
    } catch {
      // Fall through with the previous winner's style.
    }

    try {
      const winningContext = await buildWinningContext(winner)
      const { ad } = await generateAd({
        adType,
        imageStyle: style,
        mode,
        winningContext,
        generatedBy: 'refresh_job',
        experimentKey: assignmentKeys.image_style,
        experimentVariant: assignments.image_style,
      })

      const adId = ad.id as string

      await supabase.from('creative_refresh_log').insert({
        ad_type: adType,
        source_campaign_id: winner.id,
        source_ad_id: winner.ad_id,
        generated_ad_id: adId,
        trigger_score: winner.latest_score,
        trigger_cpl: winner.avg_cpl,
        template_used: winner.is_template ? winner.template_notes : null,
        status: 'generated',
        notes: `Refreshed from winning campaign (score ${winner.latest_score ?? '—'}, ${winner.total_leads ?? 0} leads). Style: ${style}.`,
      })

      await recordAllAssignments(adId, assignments, assignmentKeys).catch(() => {})

      refreshed.push({ ad_type: adType, ad_id: adId, variant: assignments.image_style ?? null })
    } catch (err) {
      const why = err instanceof Error ? err.message : 'generation failed'
      skipped.push({ ad_type: adType, why })
      await supabase.from('creative_refresh_log').insert({
        ad_type: adType,
        source_campaign_id: winner.id,
        source_ad_id: winner.ad_id,
        trigger_score: winner.latest_score,
        trigger_cpl: winner.avg_cpl,
        status: 'failed',
        notes: why,
      })
    }
  }

  // Ad types with no winning campaign are intentionally left alone.
  for (const c of active) {
    if (!bestByType.has(c.ad_type) && !skipped.some(s => s.ad_type === c.ad_type)) {
      skipped.push({
        ad_type: c.ad_type,
        why: 'no campaign currently meets the winning threshold — refresh is for winners only',
      })
    }
  }

  return NextResponse.json({
    refreshed: refreshed.length,
    details: refreshed,
    skipped,
    mode,
    note: refreshed.length > 0
      ? 'New creative generated as pending. Review and approve in the Approvals tab.'
      : 'No ad types qualified for a creative refresh this week.',
  })
}

export async function GET(request: Request) {
  return runRefresh(request.headers.get('authorization'))
}
export async function POST(request: Request) {
  return runRefresh(request.headers.get('authorization'))
}
