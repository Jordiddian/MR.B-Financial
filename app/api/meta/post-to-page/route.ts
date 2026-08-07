import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishPostToMeta } from '@/lib/ads/social'

// POST — publish an approved organic post to the Facebook page (and optionally Instagram).
// Body: { ad_id: string, platform: 'facebook' | 'instagram' | 'both' }
export async function POST(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ad_id, platform = 'facebook' } = await request.json()
  if (!ad_id) return NextResponse.json({ error: 'ad_id required' }, { status: 400 })

  const result = await publishPostToMeta(ad_id, platform)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, needs_reauth: result.needsReauth ?? false },
      { status: result.needsReauth ? 403 : 502 }
    )
  }

  return NextResponse.json({
    success: true,
    results: {
      facebook: result.facebookPostId ?? undefined,
      instagram: result.instagramMediaId ?? undefined,
    },
    partial_errors: {
      facebook: result.facebookError,
      instagram: result.instagramError,
    },
  })
}
