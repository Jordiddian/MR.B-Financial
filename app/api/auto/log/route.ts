import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — recent auto-mode activity (both auto-post and auto-ads), so the
// portal can show what the automation actually did instead of it being a
// black box. ?kind=post|ad filters to one pipeline.
export async function GET(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20') || 20, 1), 100)

  let query = supabase
    .from('auto_action_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (kind === 'post' || kind === 'ad') query = query.eq('kind', kind)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
