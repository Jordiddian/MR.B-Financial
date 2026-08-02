import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'

export const maxDuration = 60

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

interface InsightValue { name: string; values: { value: number }[] }

/**
 * Facebook Page post insights. Metric names Meta actually supports on a page
 * post as of the v20.0 Graph API — post_impressions/post_engaged_users/
 * post_clicks are the stable, non-deprecated set for this purpose.
 */
async function fetchFacebookInsights(postId: string, pageToken: string) {
  const metrics = 'post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total'
  const res = await fetch(`${GRAPH}/${postId}/insights?metric=${metrics}&access_token=${pageToken}`)
  const json = await res.json()
  if (!res.ok || json.error) return null

  const byName = new Map((json.data as InsightValue[] ?? []).map(d => [d.name, d.values?.[0]?.value]))
  const reactions = byName.get('post_reactions_by_type_total')
  const reactionTotal = typeof reactions === 'object' && reactions
    ? Object.values(reactions as Record<string, number>).reduce((a, b) => a + b, 0)
    : 0

  return {
    impressions: Number(byName.get('post_impressions') ?? 0),
    engaged_users: Number(byName.get('post_engaged_users') ?? 0),
    clicks: Number(byName.get('post_clicks') ?? 0),
    reactions: reactionTotal,
  }
}

async function fetchFacebookComments(postId: string, pageToken: string): Promise<number> {
  const res = await fetch(`${GRAPH}/${postId}?fields=comments.summary(true),shares&access_token=${pageToken}`)
  const json = await res.json()
  if (!res.ok || json.error) return 0
  return Number(json.comments?.summary?.total_count ?? 0)
}

interface IgInsightValue { name: string; values?: { value: number }[]; total_value?: { value: number } }

async function fetchInstagramInsights(mediaId: string, pageToken: string) {
  const metrics = 'impressions,reach,engagement,likes,comments,shares'
  const res = await fetch(`${GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${pageToken}`)
  const json = await res.json()
  if (!res.ok || json.error) return null

  const byName = new Map(
    (json.data as IgInsightValue[] ?? []).map(d => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? 0])
  )

  return {
    impressions: Number(byName.get('impressions') ?? 0),
    engaged_users: Number(byName.get('engagement') ?? 0),
    clicks: 0, // Instagram doesn't expose link clicks on organic media
    reactions: Number(byName.get('likes') ?? 0),
    comments: Number(byName.get('comments') ?? 0),
    shares: Number(byName.get('shares') ?? 0),
  }
}

async function runSyncPosts(authHeader: string | null) {
  const isCron = isCronRequest(authHeader)
  if (!isCron) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.META_ACCESS_TOKEN
  if (!token || !PAGE_ID) {
    return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 500 })
  }

  const pageToken = await getPageToken(token)
  if (!pageToken) {
    return NextResponse.json({
      error: 'Could not get a page token — the Meta token may be missing pages_read_engagement scope.',
    }, { status: 502 })
  }

  // Every organic post that's live and has a stored platform ID.
  const { data: posts } = await supabase
    .from('ads')
    .select('id, meta_post_id, meta_ig_media_id')
    .eq('is_organic_post', true)
    .eq('status', 'live')
    .or('meta_post_id.not.is.null,meta_ig_media_id.not.is.null')

  if (!posts?.length) {
    return NextResponse.json({ synced: 0, note: 'No published organic posts with a stored platform ID yet.' })
  }

  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  let failures = 0

  for (const post of posts) {
    if (post.meta_post_id) {
      try {
        const insights = await fetchFacebookInsights(post.meta_post_id, pageToken)
        if (insights) {
          const comments = await fetchFacebookComments(post.meta_post_id, pageToken)
          rows.push({
            ad_id: post.id, recorded_at: now, platform: 'facebook',
            impressions: insights.impressions, engaged_users: insights.engaged_users,
            clicks: insights.clicks, reactions: insights.reactions, comments,
            raw: insights,
          })
        }
      } catch { failures++ }
    }

    if (post.meta_ig_media_id) {
      try {
        const insights = await fetchInstagramInsights(post.meta_ig_media_id, pageToken)
        if (insights) {
          rows.push({
            ad_id: post.id, recorded_at: now, platform: 'instagram',
            impressions: insights.impressions, engaged_users: insights.engaged_users,
            clicks: insights.clicks, reactions: insights.reactions, comments: insights.comments,
            shares: insights.shares, raw: insights,
          })
        }
      } catch { failures++ }
    }
  }

  if (rows.length > 0) {
    await supabase.from('post_performance').insert(rows)
  }

  return NextResponse.json({ synced: rows.length, checked: posts.length, failures })
}

export async function GET(request: Request) {
  return runSyncPosts(request.headers.get('authorization'))
}
export async function POST(request: Request) {
  return runSyncPosts(request.headers.get('authorization'))
}
