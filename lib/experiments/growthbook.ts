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
  // Organic (non-ad) side of the same arm — separate because "winning" means
  // something different for a post (engagement) than a paid ad (cost per
  // lead), so these are never blended into cpl/score above.
  organicImpressions: number
  organicEngagements: number
  organicN: number
  engagementRate: number | null
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
 * Ensure a baseline experiment exists per ad type on each requested
 * dimension. Called by the routes that generate creative so testing starts
 * automatically once an ad type has enough history to be worth testing.
 *
 * Defaults to image_style only — audience_type only makes sense for paid
 * ads (organic posts have no Meta targeting to vary), so callers that
 * generate posts should never pass it.
 */
export async function ensureBaselineExperiments(
  adTypes: string[] = AD_TYPES,
  dimensions: Dimension[] = ['image_style']
): Promise<number> {
  let created = 0
  for (const adType of adTypes) {
    for (const dimension of dimensions) {
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
    // Every ad generated under one of this experiment's arms — paid ads carry
    // a meta_campaign_id, organic posts never do (publishPostToMeta never
    // touches the campaigns table), so both need to flow through here for
    // organic-only ad types (Medicare in Posting Mode, e.g.) to ever get a
    // winner called at all.
    const { data: assignments } = await supabase
      .from('experiment_assignments')
      .select('variant, meta_campaign_id, ad_id')
      .eq('experiment_key', exp.experiment_key)

    if (!assignments?.length) continue

    const paidAssignments = assignments.filter(a => a.meta_campaign_id)
    const organicAssignments = assignments.filter(a => !a.meta_campaign_id && a.ad_id)

    const campaignIds = paidAssignments.map(a => a.meta_campaign_id as string)
    const { data: campaigns } = campaignIds.length
      ? await supabase
          .from('campaigns')
          .select('meta_campaign_id, total_impressions, total_clicks, total_leads, total_spend, avg_cpl, latest_score')
          .in('meta_campaign_id', campaignIds)
      : { data: [] }

    const byCampaign = new Map(
      (campaigns ?? []).map(c => [c.meta_campaign_id as string, c])
    )

    const blank = (): VariantResult => ({
      impressions: 0, clicks: 0, leads: 0, spend: 0, cpl: null, score: null, n: 0,
      organicImpressions: 0, organicEngagements: 0, organicN: 0, engagementRate: null,
    })

    const results: Record<string, VariantResult> = {}
    for (const a of paidAssignments) {
      const c = byCampaign.get(a.meta_campaign_id as string)
      if (!c) continue
      const variant = a.variant as string
      const acc = results[variant] ?? blank()
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

    if (organicAssignments.length > 0) {
      const postAdIds = organicAssignments.map(a => a.ad_id as string)
      const { data: posts } = await supabase
        .from('post_performance')
        .select('ad_id, impressions, engaged_users, reactions, comments, shares')
        .in('ad_id', postAdIds)

      const byAd = new Map<string, { impressions: number; engagements: number }>()
      for (const p of posts ?? []) {
        const acc = byAd.get(p.ad_id as string) ?? { impressions: 0, engagements: 0 }
        acc.impressions += Number(p.impressions ?? 0)
        acc.engagements += Number(p.engaged_users ?? 0) + Number(p.reactions ?? 0) + Number(p.comments ?? 0) + Number(p.shares ?? 0)
        byAd.set(p.ad_id as string, acc)
      }

      for (const a of organicAssignments) {
        const post = byAd.get(a.ad_id as string)
        if (!post) continue
        const variant = a.variant as string
        const acc = results[variant] ?? blank()
        acc.organicImpressions += post.impressions
        acc.organicEngagements += post.engagements
        acc.organicN += 1
        acc.engagementRate = acc.organicImpressions > 0
          ? Number((acc.organicEngagements / acc.organicImpressions).toFixed(4))
          : null
        results[variant] = acc
      }
    }

    const patch: Record<string, unknown> = {
      results,
      updated_at: new Date().toISOString(),
    }

    // Conclude when both arms have volume and one is clearly cheaper per lead.
    const paidArms = Object.entries(results).filter(([, r]) => r.leads >= 10)
    if (paidArms.length >= 2) {
      const ranked = paidArms
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
    } else {
      // No paid comparison available (organic-only ad type, e.g. Medicare
      // under Posting Mode) — fall back to engagement rate so these ad types
      // still calibrate instead of sitting inert forever for lack of spend.
      const organicArms = Object.entries(results).filter(([, r]) => r.organicImpressions >= 1000)
      if (organicArms.length >= 2) {
        const ranked = organicArms
          .filter(([, r]) => r.engagementRate != null)
          .sort((a, b) => (b[1].engagementRate as number) - (a[1].engagementRate as number))
        if (ranked.length >= 2) {
          const [bestName, best] = ranked[0]
          const [, runnerUp] = ranked[1]
          const improvement = runnerUp.engagementRate === 0
            ? 0
            : ((best.engagementRate as number) - (runnerUp.engagementRate as number)) / (runnerUp.engagementRate as number)
          if (improvement >= 0.15) {
            patch.status = 'concluded'
            patch.winner = bestName
            patch.concluded_at = new Date().toISOString()
            patch.conclusion_notes =
              `"${bestName}" won on organic engagement rate (${((best.engagementRate as number) * 100).toFixed(1)}% vs ` +
              `${((runnerUp.engagementRate as number) * 100).toFixed(1)}%) across ${best.organicImpressions} vs ${runnerUp.organicImpressions} impressions.`
            concluded++
          }
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

/**
 * Record every assigned dimension for an ad in one call, instead of the
 * caller cherry-picking a single dimension. Previously every generation
 * route only ever recorded image_style even when assignVariants returned
 * other dimensions too (audience_type, once seeded, was silently dropped
 * here) — that's what made audience_type experiments inert despite existing
 * in the type system since the beginning.
 */
export async function recordAllAssignments(
  adId: string,
  assignments: Record<string, string>,
  keys: Record<string, string>
): Promise<void> {
  await Promise.all(
    Object.entries(assignments).map(([dimension, variant]) => {
      const key = keys[dimension]
      if (!key) return Promise.resolve()
      return recordAssignment({ experimentKey: key, adId, variant }).catch(() => {})
    })
  )
}

/**
 * The variant(s) assigned to an ad at generation time, keyed by dimension —
 * looked up from experiment_assignments joined to experiments, since an ad
 * can carry assignments on more than one axis (image_style AND
 * audience_type) and the ads table itself doesn't try to store that.
 */
export async function getAssignedVariants(adId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('experiment_assignments')
    .select('variant, experiments(dimension)')
    .eq('ad_id', adId)

  const result: Record<string, string> = {}
  for (const row of data ?? []) {
    const dimension = (row as { experiments?: { dimension?: string } | { dimension?: string }[] }).experiments
    const dim = Array.isArray(dimension) ? dimension[0]?.dimension : dimension?.dimension
    if (dim) result[dim] = row.variant as string
  }
  return result
}
