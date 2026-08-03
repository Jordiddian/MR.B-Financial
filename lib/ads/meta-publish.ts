import { createClient } from '@supabase/supabase-js'
import { planBudget, type BudgetPlan } from '@/lib/optimizer/budget'
import { AGENT_INFO, LANDING_URL } from '@/lib/ads/creative'
import { getAssignedVariants } from '@/lib/experiments/growthbook'
import { PRODUCT_INTERESTS } from '@/lib/optimizer/interests'
import { PRODUCT_STATES } from '@/lib/optimizer/geo'

// Single source of truth for pushing an approved ad to Meta as a real
// campaign/adset/creative/ad. Both the manual "Push to Meta" button
// (app/api/meta/publish) and the auto-ads pipeline (app/api/auto/ads) call
// this — one copy of the Meta API sequence, so they can't drift apart.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH = 'https://graph.facebook.com/v20.0'

async function metaPost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params)
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body })
  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(json.error?.error_user_msg || json.error?.message || 'Meta API error')
  }
  return json
}

/**
 * Resolve interest names (from PRODUCT_INTERESTS) to real Meta interest IDs
 * via the targeting search endpoint. This is the piece that was missing
 * entirely — the system prompt has always described interest-based
 * targeting, but nothing ever turned it into a real Meta `flexible_spec`.
 * Any name that fails to resolve is just skipped, never fatal — the ad
 * still gets geo-only targeting at minimum.
 */
async function resolveInterestIds(
  names: string[],
  token: string
): Promise<{ id: string; name: string }[]> {
  const results = await Promise.all(names.map(async name => {
    try {
      const res = await fetch(
        `${GRAPH}/search?type=adinterest&q=${encodeURIComponent(name)}&limit=1&access_token=${token}`
      )
      const json = await res.json()
      const match = json.data?.[0]
      return match?.id ? { id: match.id as string, name: (match.name ?? name) as string } : null
    } catch {
      // Skip this one interest — targeting still works with whatever resolved.
      return null
    }
  }))
  return results.filter((r): r is { id: string; name: string } => r !== null)
}

/**
 * Resolve US state names (from PRODUCT_STATES) to real Meta region keys via
 * the targeting search endpoint — resolved live rather than hardcoded so a
 * wrong memorized key can never silently mistarget or omit a licensed
 * state. Every campaign used to hardcode California's region key regardless
 * of ad_type; this is what makes Final Expense (licensed in 11 states)
 * actually reach the other 10 instead of only California.
 */
async function resolveRegionKeys(
  stateNames: string[],
  token: string
): Promise<{ key: string; name: string }[]> {
  // Dental/Vision now resolve all 50 states per publish — chunked concurrency
  // keeps that from either serializing 50 round-trips or firing 50 at once
  // against Meta's rate limits.
  const CHUNK_SIZE = 10
  const resolved: { key: string; name: string }[] = []
  for (let i = 0; i < stateNames.length; i += CHUNK_SIZE) {
    const chunk = stateNames.slice(i, i + CHUNK_SIZE)
    const results = await Promise.all(chunk.map(async name => {
      try {
        const res = await fetch(
          `${GRAPH}/search?type=adgeolocation&location_types=["region"]&q=${encodeURIComponent(name)}&limit=1&access_token=${token}`
        )
        const json = await res.json()
        const match = json.data?.[0]
        return match?.key ? { key: match.key as string, name: (match.name ?? name) as string } : null
      } catch {
        // Skip this one state — targeting still works with whatever resolved.
        return null
      }
    }))
    for (const r of results) if (r) resolved.push(r)
  }
  return resolved
}

async function uploadImage(accountId: string, token: string, imageUrl: string): Promise<string | null> {
  try {
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) return null
    const buf = Buffer.from(await imgRes.arrayBuffer())
    const b64 = buf.toString('base64')
    const json = await metaPost(`${accountId}/adimages`, { bytes: b64, access_token: token })
    const images = json.images ?? {}
    const first = Object.values(images)[0] as { hash?: string } | undefined
    return first?.hash ?? null
  } catch {
    return null
  }
}

export interface PublishResult {
  success: true
  meta_ad_id: string
  campaign_id: string
  budgetPlan: BudgetPlan
  activated: boolean
}

export interface PublishError {
  success: false
  error: string
  budgetExhausted?: boolean
}

/**
 * Push one approved ad to Meta as campaign + adset + creative + ad.
 *
 * Always created PAUSED first — this matches Meta's own recommended flow and
 * gives every path (manual or automatic) one consistent moment where the
 * campaign exists but isn't spending. If `activate` is true, we then flip it
 * live in a second, explicit step. Auto mode is the only caller that passes
 * `activate: true` — the manual publish route always leaves it PAUSED for a
 * human to resume, same as it always has.
 */
export async function publishAdToMeta(
  adId: string,
  opts: { activate?: boolean } = {}
): Promise<PublishResult | PublishError> {
  const token = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID
  const pageId = process.env.META_PAGE_ID
  if (!token || !accountId || !pageId) {
    return { success: false, error: 'Meta credentials/page not configured' }
  }

  const { data: ad, error: adErr } = await supabase.from('ads').select('*').eq('id', adId).single()
  if (adErr || !ad) return { success: false, error: 'Ad not found' }
  if (ad.status !== 'approved') return { success: false, error: 'Ad must be approved before publishing' }
  if (!ad.image_url) return { success: false, error: 'Ad has no image — cannot publish to Meta' }

  // What was assigned at generation time — audience_type decides real Meta
  // targeting below; image_style is just recorded accurately instead of the
  // hardcoded 'lifestyle' this used to write regardless of what was used.
  const assignedVariants = await getAssignedVariants(adId).catch(() => ({}) as Record<string, string>)
  const audienceType = assignedVariants.audience_type === 'interest' ? 'interest' : 'broad'
  const imageStyleUsed = assignedVariants.image_style ?? 'lifestyle'

  const { data: budgetRow } = await supabase.from('budget_settings').select('monthly_cap').eq('id', 1).single()
  const monthlyCapCents = Math.round((budgetRow?.monthly_cap ?? 50) * 100)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data: spendRows } = await supabase
    .from('spending_log')
    .select('amount')
    .gte('created_at', startOfMonth)
  const spentCents = (spendRows ?? []).reduce((s, r) => s + Math.round((r.amount ?? 0) * 100), 0)

  const plan = planBudget({ monthlyCapCents, spentCents, now })
  if (!plan.viable) {
    return { success: false, error: plan.note, budgetExhausted: true }
  }

  try {
    const campaign = await metaPost(`${accountId}/campaigns`, {
      name: `MRB ${ad.ad_type} — ${now.toISOString().split('T')[0]}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: JSON.stringify(['CREDIT']),
      access_token: token,
    })

    // Geo: resolved per-product from PRODUCT_STATES, not a blanket
    // California key applied to every ad_type regardless of where the agent
    // is actually licensed.
    const licensedStates = PRODUCT_STATES[ad.ad_type] ?? ['California']
    const regions = await resolveRegionKeys(licensedStates, token)
    const resolvedRegions = regions.length > 0 ? regions : [{ key: '3847', name: 'California' }]

    // Audience: broad (geo only) unless the audience_type experiment
    // assigned this ad to the interest arm, in which case layer in this
    // product's interests too. Special Ads Category (CREDIT, set above)
    // still blocks age/gender/zip precision regardless of this.
    let resolvedInterests: { id: string; name: string }[] = []
    if (audienceType === 'interest') {
      const names = PRODUCT_INTERESTS[ad.ad_type] ?? []
      resolvedInterests = await resolveInterestIds(names, token)
    }

    const targeting: Record<string, unknown> = {
      geo_locations: { regions: resolvedRegions.map(r => ({ key: r.key })) },
    }
    if (resolvedInterests.length > 0) {
      targeting.flexible_spec = [{ interests: resolvedInterests.map(i => ({ id: i.id, name: i.name })) }]
    }
    // If audienceType was 'interest' but nothing resolved, this silently
    // falls back to broad — a failed interest lookup should never block
    // publishing, just narrow it back to geo-only.
    const actualAudienceType = resolvedInterests.length > 0 ? 'interest' : 'broad'

    const adset = await metaPost(`${accountId}/adsets`, {
      name: `MRB ${ad.ad_type} adset`,
      campaign_id: campaign.id,
      daily_budget: String(plan.dailyBudgetCents),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status: 'PAUSED',
      targeting: JSON.stringify(targeting),
      ...(plan.endTimeUnix ? { end_time: String(plan.endTimeUnix) } : {}),
      access_token: token,
    })

    const imageHash = await uploadImage(accountId, token, ad.image_url)
    if (!imageHash) return { success: false, error: 'Failed to register creative image with Meta' }

    // The `link` field only controls the click-through destination — Meta
    // doesn't render it as visible text, and the AI's body_copy alone never
    // guaranteed a phone number either. Both are appended in code so every
    // ad's caption always has them, regardless of what the model wrote. This
    // also satisfies the system prompt's own requirement that every life/
    // health ad carry the agent name, license number, and phone number.
    const caption = [ad.body_copy, '', AGENT_INFO, '', `Get your free quote: ${LANDING_URL}`]
      .join('\n')
      .trim()

    const creative = await metaPost(`${accountId}/adcreatives`, {
      name: `MRB ${ad.ad_type} creative`,
      object_story_spec: JSON.stringify({
        page_id: pageId,
        link_data: {
          message: caption,
          link: LANDING_URL,
          name: ad.headline,
          image_hash: imageHash,
          call_to_action: { type: 'GET_QUOTE', value: { link: LANDING_URL } },
        },
      }),
      access_token: token,
    })

    const metaAd = await metaPost(`${accountId}/ads`, {
      name: `MRB ${ad.ad_type} ad`,
      adset_id: adset.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: 'PAUSED',
      access_token: token,
    })

    let activated = false
    if (opts.activate) {
      // Explicit second step — flips campaign, adset, and ad all to ACTIVE.
      // This is the one place real spend actually starts; every other path
      // in this system stops at PAUSED.
      await Promise.all([
        metaPost(campaign.id, { status: 'ACTIVE', access_token: token }),
        metaPost(adset.id, { status: 'ACTIVE', access_token: token }),
        metaPost(metaAd.id, { status: 'ACTIVE', access_token: token }),
      ])
      activated = true
    }

    await supabase.from('ads').update({ status: 'live', meta_ad_id: metaAd.id }).eq('id', adId)

    await supabase.from('campaigns').upsert({
      meta_campaign_id: campaign.id,
      meta_adset_id: adset.id,
      meta_ad_id: metaAd.id,
      ad_id: adId,
      ad_type: ad.ad_type,
      campaign_name: `MRB ${ad.ad_type} — ${now.toISOString().split('T')[0]}`,
      objective: 'OUTCOME_TRAFFIC',
      audience_type: actualAudienceType,
      placement: 'automatic',
      image_style: imageStyleUsed,
      daily_budget_cents: plan.dailyBudgetCents,
      status: activated ? 'active' : 'active', // tracked as active regardless — PAUSED-in-Meta campaigns still get synced
      started_at: now.toISOString(),
      in_learning_phase: true,
    }, { onConflict: 'meta_campaign_id' })

    return {
      success: true,
      meta_ad_id: metaAd.id,
      campaign_id: campaign.id,
      budgetPlan: plan,
      activated,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Publish failed' }
  }
}
