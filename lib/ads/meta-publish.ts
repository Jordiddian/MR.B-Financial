import { createClient } from '@supabase/supabase-js'
import { planBudget, type BudgetPlan } from '@/lib/optimizer/budget'
import { AGENT_INFO, LANDING_URL } from '@/lib/ads/creative'

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

    const adset = await metaPost(`${accountId}/adsets`, {
      name: `MRB ${ad.ad_type} adset`,
      campaign_id: campaign.id,
      daily_budget: String(plan.dailyBudgetCents),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status: 'PAUSED',
      targeting: JSON.stringify({
        geo_locations: { regions: [{ key: '3847' }] }, // California — licensed service area
      }),
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
      audience_type: 'broad',
      placement: 'automatic',
      image_style: 'lifestyle',
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
