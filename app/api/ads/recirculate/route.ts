import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Duplicates a live/approved ad back to pending so it can be re-approved and re-posted.
// Reuses the existing image — no new AI generation cost.
export async function POST(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: original, error: fetchErr } = await supabase
    .from('ads')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !original) return NextResponse.json({ error: 'Ad not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('ads')
    .insert({
      status: 'pending',
      headline: original.headline,
      body_copy: original.body_copy,
      ad_type: original.ad_type,
      image_url: original.image_url,
      call_to_action: original.call_to_action,
      compliance_notes: original.compliance_notes,
      requires_cms_filing: original.requires_cms_filing,
      requires_human_review: original.requires_human_review,
      is_organic_post: original.is_organic_post,
      post_hashtags: original.post_hashtags,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
