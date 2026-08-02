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

async function getPageToken(userToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/${PAGE_ID}?fields=access_token&access_token=${userToken}`)
    const json = await res.json()
    return json.access_token ?? null
  } catch {
    return null
  }
}

export interface PostResult {
  success: true
  facebookPostId: string | null
  instagramMediaId: string | null
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

  const pageToken = await getPageToken(userToken)
  if (!pageToken) {
    return {
      success: false,
      needsReauth: true,
      error:
        'Cannot get a page access token. The current Meta token is missing pages_manage_posts scope. ' +
        'Re-authorize at developers.facebook.com → Graph API Explorer → request pages_manage_posts, pages_read_engagement, pages_show_list.',
    }
  }

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
      } else {
        const feedRes = await fetch(`${GRAPH}/${PAGE_ID}/feed`, {
          method: 'POST',
          body: new URLSearchParams(fbBody),
        })
        const feedJson = await feedRes.json()
        facebookPostId = feedJson.id ?? null
      }
    } catch {
      facebookPostId = null
    }
  }

  if (platform === 'instagram' || platform === 'both') {
    try {
      const igIdRes = await fetch(`${GRAPH}/${PAGE_ID}?fields=instagram_business_account&access_token=${pageToken}`)
      const igIdJson = await igIdRes.json()
      const igId = igIdJson.instagram_business_account?.id

      if (igId && ad.image_url) {
        const containerRes = await fetch(`${GRAPH}/${igId}/media`, {
          method: 'POST',
          body: new URLSearchParams({ image_url: ad.image_url, caption: instagramText, access_token: pageToken }),
        })
        const container = await containerRes.json()
        if (container.id) {
          const publishRes = await fetch(`${GRAPH}/${igId}/media_publish`, {
            method: 'POST',
            body: new URLSearchParams({ creation_id: container.id, access_token: pageToken }),
          })
          const published = await publishRes.json()
          instagramMediaId = published.id ?? null
        }
      }
    } catch {
      instagramMediaId = null
    }
  }

  // Only mark live if at least one platform actually produced a post ID —
  // otherwise a silent Meta failure would still show as "posted" in the portal.
  if (!facebookPostId && !instagramMediaId) {
    return { success: false, error: 'Meta did not return a post ID on either platform — the post likely failed' }
  }

  await supabase
    .from('ads')
    .update({
      status: 'live',
      meta_post_id: facebookPostId,
      meta_ig_media_id: instagramMediaId,
    })
    .eq('id', adId)

  return { success: true, facebookPostId, instagramMediaId }
}
