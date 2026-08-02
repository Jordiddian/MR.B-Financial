import { createClient } from '@supabase/supabase-js'
import { META_ADS_SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import crypto from 'crypto'

// Single source of truth for how an ad creative gets built. Both the on-demand
// generate route and the weekly refresh job go through here, so the image-
// composition spec and compliance rules can never drift between them.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const AGENT_INFO = `Bruce Tabibian | Licensed Insurance Agent | CA License: OH92156 | (818) 276-6767 TTY 711 | Brucet525@gmail.com`

// The one place a URL the whole system points prospects at is fixed. Every ad
// and post exists to drive a click here — never hardcode this string
// elsewhere.
export const LANDING_URL = process.env.LANDING_URL ?? 'https://mrb-site-beta.vercel.app'

export const BACKGROUND_STYLE: Record<string, string> = {
  lifestyle: 'Photorealistic lifestyle photography. Warm natural light, real-life setting. No medical environments, no hospitals, no white coats.',
  cartoon: 'Bright friendly cartoon illustration. Bold outlines, vivid colors, warm and approachable.',
  informational: 'Clean modern flat-design background. Soft gradient or geometric shapes, professional palette.',
}

export interface AdImagePromptParams {
  backgroundScene: string
  headline: string
  bodyCopy: string
  callToAction: string
  adType: string
  imageStyle: string
  isOrganicPost: boolean
}

export function buildAdImagePrompt(params: AdImagePromptParams): string {
  const { backgroundScene, headline, bodyCopy, callToAction, adType, imageStyle, isOrganicPost } = params
  const isMedicare = /medicare/i.test(adType)
  const orgsCount = process.env.MEDICARE_ORGS_COUNT ?? '5'
  const productsCount = process.env.MEDICARE_PRODUCTS_COUNT ?? '12'
  const style = BACKGROUND_STYLE[imageStyle] ?? BACKGROUND_STYLE.lifestyle

  const fineprint = isMedicare
    ? `This is an advertisement. Not affiliated with any government agency including Medicare. Currently I represent ${orgsCount} organizations which offer ${productsCount} products in your area. Contact Medicare.gov or 1-800-MEDICARE for all your options.`
    : `Licensed insurance broker. Not affiliated with or endorsed by any government agency.`

  if (isOrganicPost) {
    return `Create a polished social media post image for Facebook/Instagram.

BACKGROUND: ${backgroundScene} ${style}
Slightly darken the upper and lower areas where text overlays will appear to ensure readability.

TEXT TO RENDER ON IMAGE:
- HEADLINE (top, bold, large white text with dark drop shadow): "${headline}"
- BODY (center, medium white text): "${bodyCopy}"
- CTA (lower center, bold accent-colored text or button): "${callToAction}"
- AGENT INFO (bottom bar, small white text on semi-transparent dark strip): ${AGENT_INFO}

Style: Professional, clean, eye-catching. Looks like a high-quality Facebook post graphic.`
  }

  return `Create a complete professional Facebook and Instagram advertisement image. This is a FULL AD — not just a background photo. All text must be rendered directly on the image in a structured layout.

BACKGROUND: ${backgroundScene} ${style}
The upper third and bottom quarter should be slightly darkened with a semi-transparent overlay to ensure text is legible over the background.

ADVERTISEMENT TEXT LAYOUT — render all text directly on the image:

1. HOOK / HEADLINE (top, very large bold white text, centered, with strong dark drop shadow):
"${headline}"

2. BODY COPY (center section, medium white text, clean and readable):
"${bodyCopy}"

3. CALL TO ACTION (bold, accent color — blue or gold — in button style or prominent highlighted text):
"${callToAction}"

4. AGENT INFORMATION BLOCK (bottom section, white text on semi-transparent dark background bar):
${AGENT_INFO}

5. FINE PRINT (very bottom, very small but legible white text):
${fineprint}

CRITICAL: The final image must look like a polished, ready-to-publish insurance advertisement. Professional typography throughout. All text must be clearly legible. Layout should feel like a real ad, not a photo with captions.`
}

export async function generateImage(params: AdImagePromptParams): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null
  try {
    const prompt = buildAdImagePrompt(params)

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1024x1024' }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const b64 = data.data?.[0]?.b64_json
    if (!b64) return data.data?.[0]?.url ?? null

    const bytes = Buffer.from(b64, 'base64')
    const path = `${crypto.randomUUID()}.png`
    const { error } = await supabase.storage
      .from('ad-creatives')
      .upload(path, bytes, { contentType: 'image/png', upsert: false })
    if (error) return null

    const { data: pub } = supabase.storage.from('ad-creatives').getPublicUrl(path)
    return pub.publicUrl
  } catch {
    return null
  }
}

export interface AdDraft {
  headline: string
  body_copy: string
  call_to_action: string
  image_direction: string
  compliance_notes: string
  requires_cms_filing: boolean
  requires_human_review: boolean
  is_organic_post?: boolean
  post_hashtags?: string[]
}

export interface GenerateOptions {
  adType: string
  note?: string
  withImage?: boolean
  imageStyle?: string
  mode?: 'ad' | 'post'
  /** Extra direction appended to the AI prompt — used by the refresh job to
   *  carry forward what made the previous winner work. */
  winningContext?: string
  /** Where this ad came from, for the audit trail. */
  generatedBy?: string
  /** Experiment arm this ad is being generated under, if any. */
  experimentKey?: string
  experimentVariant?: string
}

export interface GenerateResult {
  ad: Record<string, unknown>
  draft: AdDraft
  imageUrl: string | null
}

async function buildMemoryContext(adType: string): Promise<string> {
  const { data: memory } = await supabase
    .from('memory_log')
    .select('score, what_worked, what_didnt, patterns_found, recommendation, lessons_learned, compliance_alerts')
    .eq('ad_type', adType)
    .order('created_at', { ascending: false })
    .limit(5)

  return (memory ?? [])
    .map(m => `Score ${m.score} (${m.recommendation ?? '—'}): worked="${m.what_worked ?? '—'}"; avoid="${m.what_didnt ?? '—'}"; compliance="${m.compliance_alerts ?? 'none'}"`)
    .join('\n') || 'No prior history — generate best-practice compliant ad.'
}

function buildUserMessage(opts: GenerateOptions, memoryContext: string): string {
  const { adType, note, imageStyle = 'lifestyle', mode = 'ad', winningContext } = opts
  const isOrganicPost = mode === 'post'

  const winningBlock = winningContext ? `\nWHAT IS ALREADY WORKING FOR THIS PRODUCT:\n${winningContext}\nProduce a fresh variation on this proven angle — new wording and new imagery, same underlying strategy. Do not simply restate the previous ad.\n` : ''

  if (isOrganicPost) {
    return `
MEMORY LOG FOR ${adType}:
${memoryContext}
${winningBlock}
TASK: Generate ONE organic social media post (POSTING MODE — not a paid ad) for the following insurance product.
Product type: ${adType}
Image style: ${imageStyle}
${note ? `Creative direction: ${note}` : ''}

Rules:
- This is a California insurance broker (MR. B Financial Services, Bruce Tabibi)
- Organic post — no Meta Special Ads Category restrictions; no campaign structure needed
- Body copy up to 400 characters, conversational and educational (not salesy)
- Headline is the attention-grabbing opening line of the post
- call_to_action should be soft ("DM us for a free quote", "Comment below", "Link in bio")
- post_hashtags: include 6–10 hashtags relevant to the product and California audience, always include #MRBFinancial
- audience_recommendation: specify "Facebook Page", "Instagram", or "both"
- is_organic_post: true
- All California insurance law and CMS compliance rules still apply
- Set requires_human_review: true for Medicare posts
- Leave analysis, campaign_actions, lessons_learned, budget_recommendations as empty arrays
- Return the full JSON structure with exactly one item in new_ads
`.trim()
  }

  return `
MEMORY LOG FOR ${adType}:
${memoryContext}
${winningBlock}
TASK: Generate ONE new paid ad for the following insurance product.
Product type: ${adType}
Image style requested: ${imageStyle}
${note ? `Creative direction note: ${note}` : ''}

Rules:
- This is a California insurance broker (MR. B Financial Services, Bruce Tabibi)
- Ads run under Meta's Special Ads Category (CREDIT) — no age/gender targeting in recommendations
- Do NOT recommend any specific plan by name (would require CMS filing)
- Body copy must be under 200 characters
- Headline must be under 40 characters
- Provide a detailed image_direction that specifies exactly what the image should show (subject, setting, mood) — this will be passed directly to an image model
- Set requires_cms_filing: true only if the copy mentions a specific plan name or specific benefit amounts
- Set requires_human_review: true for all Medicare ads
- Leave analysis as empty array, lessons_learned as empty array, budget_recommendations as empty array
- Return the full JSON structure with exactly one item in new_ads, is_organic_post: false
`.trim()
}

/**
 * Generate one ad end-to-end: AI copy → full-composite image → pending row.
 * Throws on unrecoverable failure so callers can decide how loud to be.
 */
export async function generateAd(opts: GenerateOptions): Promise<GenerateResult> {
  const { adType, withImage = true, imageStyle = 'lifestyle', mode = 'ad' } = opts
  if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI not configured')

  const isOrganicPost = mode === 'post'
  const memoryContext = await buildMemoryContext(adType)
  const userMessage = buildUserMessage(opts, memoryContext)

  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: META_ADS_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    }),
  })

  if (!aiRes.ok) throw new Error('OpenAI API error')

  const aiData = await aiRes.json()
  let parsed: { new_ads: AdDraft[]; compliance_alerts?: string[] }
  try {
    parsed = JSON.parse(aiData.choices[0].message.content)
  } catch {
    throw new Error('Failed to parse AI response')
  }

  const draft = parsed.new_ads?.[0]
  if (!draft) throw new Error('AI returned no ad draft')

  const imageUrl = withImage === false
    ? null
    : await generateImage({
        backgroundScene: draft.image_direction,
        headline: draft.headline,
        bodyCopy: draft.body_copy,
        callToAction: draft.call_to_action ?? 'Call us today!',
        adType,
        imageStyle,
        isOrganicPost,
      })

  const { data, error } = await supabase
    .from('ads')
    .insert({
      status: 'pending',
      headline: draft.headline,
      body_copy: draft.body_copy,
      ad_type: adType,
      image_url: imageUrl,
      call_to_action: draft.call_to_action ?? null,
      compliance_notes: [
        draft.compliance_notes,
        ...(parsed.compliance_alerts ?? []),
      ].filter(Boolean).join(' | ') || null,
      requires_cms_filing: draft.requires_cms_filing ?? false,
      requires_human_review: draft.requires_human_review ?? false,
      is_organic_post: isOrganicPost,
      post_hashtags: draft.post_hashtags ? draft.post_hashtags.join(' ') : null,
      generated_by: opts.generatedBy ?? 'manual',
      experiment_key: opts.experimentKey ?? null,
      experiment_variant: opts.experimentVariant ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase.from('spending_log').insert({
    category: 'api_costs',
    amount: imageUrl ? 0.05 : 0.01,
    description: `Ad generation: ${adType} (${imageStyle} image${imageUrl ? '' : ' skipped'})`,
  })

  return { ad: data as Record<string, unknown>, draft, imageUrl }
}
