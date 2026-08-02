import { GrowthBook, type FeatureDefinition } from '@growthbook/growthbook'
import { createClient } from '@supabase/supabase-js'
import { AD_TYPES } from '@/lib/optimizer/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Albert's core mechanism is continuous multivariate testing: vary one axis at
// a time, measure, promote the winner. GrowthBook gives us deterministic,
// hash-based variant assignment so the same ad always resolves to the same arm
// — which is what makes the attribution in ad_performance trustworthy.
//
// Runs without a GrowthBook cloud account: with no API host configured, the SDK
// falls back to local feature definitions we build from the experiments table.
// If GROWTHBOOK_CLIENT_KEY is set later, remote config takes over transparently.

export type Dimension = 'image_style' | 'headline_style' | 'audience_type' | 'cta'

export const DIMENSION_VARIANTS: Record<Dimension, string[]> = {
  // Lifestyle vs informational is the highest-signal axis for insurance —
  // cartoon is deliberately excluded for Medicare (see system prompt).
  image_style: ['lifestyle', 'informational'],
  headline_style: ['direct_question', 'announcement', 'problem_solution'],
  audience_type: ['broad', 'interest'],
  cta: ['GET_QUOTE', 'LEARN_MORE'],
}

export interface ExperimentRow {
  id: string
  experiment_key: string
  ad_type: string
  dimension: Dimension
  variants: string[]
  status: string
  winner: string | null
  results: Record<string, VariantResult>
}

export interface VariantResult {
  impressions: number
  clicks: number
  leads: number
  spend: number
  cpl: number | null
  score: number | null
  n: number
}

export function experimentKey(adType: string, dimension: Dimension): string {
  return `${adType.toLowerCase().replace(/\s+/g, '_')}__${dimension}`
}

/**
 * Build a GrowthBook instance whose features are the currently-running
 * experiments. Attributes key off the ad type so assignment is stable per
 * product line rather than per request.
 */
export function buildGrowthBook(
  experiments: ExperimentRow[],
  attributes: Record<string, unknown>
): GrowthBook {
  const features: Record<string, FeatureDefinition<string>> = {}

  for (const exp of experiments) {
    if (exp.status !== 'running') continue
    const variants = exp.variants ?? DIMENSION_VARIANTS[exp.dimension] ?? []
    if (variants.length < 2) continue

    features[exp.experiment_key] = {
      defaultValue: variants[0],
      rules: [
        {
          key: exp.experiment_key,
          // Even split across arms — we're measuring, not exploiting yet.
          variations: variants,
          weights: variants.map(() => 1 / variants.length),
          hashAttribute: 'experimentUnit',
        },
      ],
    }
  }

  // A concluded experiment pins to its winner so downstream generation keeps
  // using what won without needing a code change.
  for (const exp of experiments) {
    if (exp.status === 'concluded' && exp.winner) {
      features[exp.experiment_key] = { defaultValue: exp.winner }
    }
  }

  const gb = new GrowthBook({ attributes, features })
  return gb
}

/** Load every experiment we know about, running or concluded. */
export async function loadExperiments(adType?: string): Promise<ExperimentRow[]> {
  let query = supabase.from('experiments').select('*')
  if (adType) query = query.eq('ad_type', adType)
  const { data } = await query
  return (data ?? []) as ExperimentRow[]
}

/**
 * Resolve which variant a new ad should use on each dimension.
 * `unit` is the hash input — use the ad type plus a rotation counter so
 * successive ads for the same product spread across arms instead of all
 * landing on one.
 */
export async function assignVariants(
  adType: string,
  unit: string
): Promise<{ assignments: Record<string, string>; keys: Record<string, string> }> {
  const experiments = await loadExperiments(adType)
  const gb = buildGrowthBook(experiments, { experimentUnit: unit, adType })

  const assignments: Record<string, string> = {}
  const keys: Record<string, string> = {}

  for (const exp of experiments) {
    if (exp.status === 'abandoned') continue
    const value = gb.getFeatureValue(exp.experiment_key, exp.variants?.[0] ?? '')
    if (typeof value === 'string' && value) {
      assignments[exp.dimension] = value
      keys[exp.dimension] = exp.experiment_key
    }
  }

  gb.destroy()
  return { assignments, keys }
}

/**
 * Ensure a baseline experiment exists per ad type on the image_style axis.
 * Called by the refresh job so testing starts automatically once an ad type
 * has enough history to be worth testing.
 */
export async function ensureBaselineExperiments(adTypes: string[] = AD_TYPES): Promise<number> {
  let created = 0
  for (const adType of adTypes) {
    const dimension: Dimension = 'image_style'
    const key = experimentKey(adType, dimension)

    const { data: existing } = await supabase
      .from('experiments')
      .select('id')
      .eq('experiment_key', key)
      .maybeSingle()

    if (existing) continue

    const { error } = await supabase.from('experiments').insert({
      experiment_key: key,
      ad_type: adType,
      dimension,
      variants: DIMENSION_VARIANTS[dimension],
      status: 'running',
    })
    if (!error) created++
  }
  return created
}

/**
 * Roll performance data up into each experiment's results blob and conclude
 * any arm that has a clear winner. "Clear" is deliberately strict: both arms
 * need real volume, and the winner needs a materially better CPL.
 */
export async function rollUpExperimentResults(): Promise<{ updated: number; concluded: number }> {
  const experiments = await loadExperiments()
  const running = experiments.filter(e => e.status === 'running')
  if (running.length === 0) return { updated: 0, concluded: 0 }

  let updated = 0
  let concluded = 0

  for (const exp of running) {
    // Every campaign that was published under one of this experiment's arms
    const { data: assignments } = await supabase
      .from('experiment_assignments')
      .select('variant, meta_campaign_id')
      .eq('experiment_key', exp.experiment_key)
      .not('meta_campaign_id', 'is', null)

    if (!assignments?.length) continue

    const campaignIds = assignments.map(a => a.meta_campaign_id as string)
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('meta_campaign_id, total_impressions, total_clicks, total_leads, total_spend, avg_cpl, latest_score')
      .in('meta_campaign_id', campaignIds)

    const byCampaign = new Map(
      (campaigns ?? []).map(c => [c.meta_campaign_id as string, c])
    )

    const results: Record<string, VariantResult> = {}
    for (const a of assignments) {
      const c = byCampaign.get(a.meta_campaign_id as string)
      if (!c) continue
      const variant = a.variant as string
      const acc = results[variant] ?? {
        impressions: 0, clicks: 0, leads: 0, spend: 0, cpl: null, score: null, n: 0,
      }
      acc.impressions += Number(c.total_impressions ?? 0)
      acc.clicks += Number(c.total_clicks ?? 0)
      acc.leads += Number(c.total_leads ?? 0)
      acc.spend += Number(c.total_spend ?? 0)
      // Running mean of score across campaigns in this arm
      const score = c.latest_score == null ? null : Number(c.latest_score)
      if (score != null) {
        acc.score = acc.score == null ? score : (acc.score * acc.n + score) / (acc.n + 1)
      }
      acc.n += 1
      acc.cpl = acc.leads > 0 ? Number((acc.spend / acc.leads).toFixed(2)) : null
      results[variant] = acc
    }

    const patch: Record<string, unknown> = {
      results,
      updated_at: new Date().toISOString(),
    }

    // Conclude when both arms have volume and one is clearly cheaper per lead.
    const arms = Object.entries(results).filter(([, r]) => r.leads >= 10)
    if (arms.length >= 2) {
      const ranked = arms
        .filter(([, r]) => r.cpl != null)
        .sort((a, b) => (a[1].cpl as number) - (b[1].cpl as number))
      if (ranked.length >= 2) {
        const [bestName, best] = ranked[0]
        const [, runnerUp] = ranked[1]
        const improvement = ((runnerUp.cpl as number) - (best.cpl as number)) / (runnerUp.cpl as number)
        // 15% cheaper per lead is the bar for calling it.
        if (improvement >= 0.15) {
          patch.status = 'concluded'
          patch.winner = bestName
          patch.concluded_at = new Date().toISOString()
          patch.conclusion_notes =
            `"${bestName}" won on cost per lead ($${best.cpl} vs $${runnerUp.cpl}, ` +
            `${(improvement * 100).toFixed(0)}% cheaper) across ${best.leads} vs ${runnerUp.leads} leads.`
          concluded++
        }
      }
    }

    const { error } = await supabase.from('experiments').update(patch).eq('id', exp.id)
    if (!error) updated++
  }

  return { updated, concluded }
}

/** Record which arm a freshly-generated ad landed in. */
export async function recordAssignment(params: {
  experimentKey: string
  adId: string
  variant: string
  metaCampaignId?: string | null
}): Promise<void> {
  const { data: exp } = await supabase
    .from('experiments')
    .select('id')
    .eq('experiment_key', params.experimentKey)
    .maybeSingle()

  await supabase.from('experiment_assignments').insert({
    experiment_id: exp?.id ?? null,
    experiment_key: params.experimentKey,
    ad_id: params.adId,
    variant: params.variant,
    meta_campaign_id: params.metaCampaignId ?? null,
  })
}
