import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — every organic post plus its latest performance snapshot, for the
// Posts results page. This is what "results" actually means for the organic
// phase: reach/engagement, not spend/leads.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: posts, error } = await supabase
    .from('ads')
    .select('id, ad_type, headline, body_copy, image_url, status, generated_by, meta_post_id, meta_ig_media_id, created_at')
    .eq('is_organic_post', true)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  interface PerfRow {
    ad_id: string; recorded_at: string; platform: string
    impressions: number; engaged_users: number; clicks: number
    reactions: number; comments: number; shares: number | null
  }

  const ids = (posts ?? []).map(p => p.id)
  const { data: perf } = ids.length
    ? await supabase
        .from('post_performance')
        .select('ad_id, recorded_at, platform, impressions, engaged_users, clicks, reactions, comments, shares')
        .in('ad_id', ids)
        .order('recorded_at', { ascending: false })
    : { data: [] as PerfRow[] }

  // Latest snapshot per (ad_id, platform).
  const latest = new Map<string, PerfRow>()
  for (const row of (perf ?? []) as PerfRow[]) {
    const key = `${row.ad_id}|${row.platform}`
    if (!latest.has(key)) latest.set(key, row)
  }

  const enriched = (posts ?? []).map(p => ({
    ...p,
    facebook: latest.get(`${p.id}|facebook`) ?? null,
    instagram: latest.get(`${p.id}|instagram`) ?? null,
  }))

  return NextResponse.json(enriched)
}
