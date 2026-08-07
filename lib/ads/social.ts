import { createClient } from '@supabase/supabase-js'
import { LANDING_URL } from '@/lib/ads/creative'

// Single source of truth for pushing an approved organic post to Facebook
// (and Instagram, if linked). Both the manual "Post to Page" button and the
// auto-post pipeline call this.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRAPH = 'https://graph.facebook.com/v20.0'
const PAGE_ID = process.env.META_PAGE_ID

interface PageTokenResult {
  token: string | null
  // The real reason it failed — a fetch/network exception, or Meta's own
  // error payload. Previously this was swallowed entirely and the caller
  // always guessed "missing pages_manage_posts scope" regardless of what
  // actually went wrong (a transient network blip got the same message as a
  // genuinely revoked token), which made a one-off failure look like a
  // standing auth problem that needed re-authorization when it didn't.
  error?: string
  isAuthError?: boolean
}

async function getPageToken(userToken: string): Promise<PageTokenResult> {
  try {
    const res = await fetch(`${GRAPH}/${PAGE_ID}?fields=access_token&access_token=${userToken}`)
    const json = await res.json()
    if (json.access_token) return { token: json.access_token }
    const metaError = json.error
    return {
      token: null,
      error: metaError?.message ?? `Meta returned no access_token (HTTP ${res.status})`,
      isAuthError: metaError?.type === 'OAuthException' || metaError?.code === 190,
    }
  } catch (err) {
    return {
      token: null,
      error: err instanceof Error ? err.message : 'Network error reaching Meta',
      isAuthError: false,
    }
  }
}

export interface PostResult {
  success: true
  facebookPostId: string | null
  instagramMediaId: string | null
  // Set when the overall call still counts as success (the other platform
  // came through) but one side quietly failed — previously any failure on
  // either platform just left its id null with zero trace of why, which is
  // exactly what happened to a Dental post that published to Facebook but
  // silently failed on Instagram with no error ever recorded anywhere.
  facebookError?: string
  instagramError?: string
}

export interface PostError {
  success: false
  error: string
  needsReauth?: boolean
}

/**
 * Publish an approved organic post to the Facebook page (and Instagram, if a
 * business account is linked). Persists the returned post/media IDs onto the
 * ads row so post_performance can be fetched against them later — the
 * original implementation returned these IDs in the HTTP response and then
 * threw them away, which made it impossible to ever measure the post.
 */
export async function publishPostToMeta(
  adId: string,
  platform: 'facebook' | 'instagram' | 'both' = 'facebook'
): Promise<PostResult | PostError> {
  const userToken = process.env.META_ACCESS_TOKEN
  if (!userToken || !PAGE_ID) return { success: false, error: 'Meta credentials not configured' }

  const { data: ad, error: adErr } = await supabase.from('ads').select('*').eq('id', adId).single()
  if (adErr || !ad) return { success: false, error: 'Ad not found' }
  if (ad.status !== 'approved') return { success: false, error: 'Ad must be approved before posting' }
  if (!ad.is_organic_post) return { success: false, error: 'This is a paid ad, not an organic post — use the publish route' }

  const pageTokenResult = await getPageToken(userToken)
  if (!pageTokenResult.token) {
    return {
      success: false,
      needsReauth: pageTokenResult.isAuthError,
      error: pageTokenResult.isAuthError
        ? `Meta token needs re-authorization: ${pageTokenResult.error}. ` +
          'Re-authorize at developers.facebook.com → Graph API Explorer → request pages_manage_posts, pages_read_engagement, pages_show_list.'
        : `Could not get a page access token (likely transient): ${pageTokenResult.error}`,
    }
  }
  const pageToken = pageTokenResult.token

  // The website link is appended in code, not left to the AI, so every post
  // that actually goes out has a guaranteed path to a lead — the whole point
  // of posting at all. Facebook auto-linkifies a bare URL in post text, so it
  // gets the real link; Instagram captions can't open links at all, so IG
  // always gets a "link in bio" pointer instead, built as its own text rather
  // than reusing Facebook's copy (platform: 'both' posts to each separately).
  function buildPostText(ctaLine: string) {
    return [ad.headline, '', ad.body_copy, '', ctaLine, '', ad.post_hashtags ?? '']
      .filter(line => line !== undefined)
      .join('\n')
      .trim()
  }

  const facebookText = buildPostText(`Get your free quote: ${LANDING_URL}`)
  const instagramText = buildPostText('Link in bio to get your free quote.')

  let facebookPostId: string | null = null
  let instagramMediaId: string | null = null
  let facebookError: string | undefined
  let instagramError: string | undefined

  if (platform === 'facebook' || platform === 'both') {
    try {
      const fbBody: Record<string, string> = { message: facebookText, access_token: pageToken }
      if (ad.image_url) {
        const photoRes = await fetch(`${GRAPH}/${PAGE_ID}/photos`, {
          method: 'POST',
          body: new URLSearchParams({ ...fbBody, url: ad.image_url }),
        })
        const photoJson = await photoRes.json()
        facebookPostId = photoJson.post_id ?? photoJson.id ?? null
        if (!facebookPostId) facebookError = photoJson.error?.message ?? `HTTP ${photoRes.status}, no post id returned`
      } else {
        const feedRes = await fetch(`${GRAPH}/${PAGE_ID}/feed`, {
          method: 'POST',
          body: new URLSearchParams(fbBody),
        })
        const feedJson = await feedRes.json()
        facebookPostId = feedJson.id ?? null
        if (!facebookPostId) facebookError = feedJson.error?.message ?? `HTTP ${feedRes.status}, no post id returned`
      }
    } catch (err) {
      facebookError = err instanceof Error ? err.message : 'Network error posting to Facebook'
    }
  }

  if (platform === 'instagram' || platform === 'both') {
    try {
      const igIdRes = await fetch(`${GRAPH}/${PAGE_ID}?fields=instagram_business_account&access_token=${pageToken}`)
      const igIdJson = await igIdRes.json()
      const igId = igIdJson.instagram_business_account?.id

      if (!igId) {
        instagramError = 'No Instagram business account linked to this Facebook page'
      } else if (!ad.image_url) {
        instagramError = 'Ad has no image_url — Instagram requires an image'
      } else {
        const containerRes = await fetch(`${GRAPH}/${igId}/media`, {
          method: 'POST',
          body: new URLSearchParams({ image_url: ad.image_url, caption: instagramText, access_token: pageToken }),
        })
        const container = await containerRes.json()
        if (!container.id) {
          instagramError = container.error?.message ?? `HTTP ${containerRes.status}, container creation failed`
        } else {
          // Meta processes the image asynchronously — publishing immediately
          // after creation can hit the container before it's ready
          // (status_code stays IN_PROGRESS briefly). Poll until FINISHED
          // instead of racing it, since calling media_publish too early is a
          // real, documented cause of intermittent Instagram publish
          // failures with no useful error message.
          let statusCode = 'IN_PROGRESS'
          for (let attempt = 0; attempt < 10 && statusCode === 'IN_PROGRESS'; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 1000))
            const statusRes = await fetch(`${GRAPH}/${container.id}?fields=status_code&access_token=${pageToken}`)
            const statusJson = await statusRes.json()
            statusCode = statusJson.status_code ?? 'ERROR'
          }

          if (statusCode !== 'FINISHED') {
            instagramError = `Container never became ready (status: ${statusCode})`
          } else {
            const publishRes = await fetch(`${GRAPH}/${igId}/media_publish`, {
              method: 'POST',
              body: new URLSearchParams({ creation_id: container.id, access_token: pageToken }),
            })
            const published = await publishRes.json()
            instagramMediaId = published.id ?? null
            if (!instagramMediaId) instagramError = published.error?.message ?? `HTTP ${publishRes.status}, no media id returned`
          }
        }
      }
    } catch (err) {
      instagramError = err instanceof Error ? err.message : 'Network error posting to Instagram'
    }
  }

  // Only mark live if at least one platform actually produced a post ID —
  // otherwise a silent Meta failure would still show as "posted" in the portal.
  if (!facebookPostId && !instagramMediaId) {
    return {
      success: false,
      error: [facebookError, instagramError].filter(Boolean).join(' | ') ||
        'Meta did not return a post ID on either platform — the post likely failed',
    }
  }

  await supabase
    .from('ads')
    .update({
      status: 'live',
      meta_post_id: facebookPostId,
      meta_ig_media_id: instagramMediaId,
    })
    .eq('id', adId)

  return { success: true, facebookPostId, instagramMediaId, facebookError, instagramError }
}
