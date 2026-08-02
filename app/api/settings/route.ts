import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fields the portal is allowed to write. Explicit allowlist rather than
// spreading the request body straight into the update — auto_ads_enabled in
// particular gates real ad spend, so an unvalidated PATCH shouldn't be able
// to touch it (or anything else) by accident.
const WRITABLE_FIELDS = [
  'monthly_cap',
  'max_ad_spend',
  'max_api_costs',
  'approval_required',
  'posting_mode',
  'auto_post_enabled',
  'auto_post_cadence_hours',
  'auto_ads_enabled',
  'auto_ads_cadence_hours',
] as const

async function requireAuth() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('budget_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const patch: Record<string, unknown> = {}
  for (const key of WRITABLE_FIELDS) {
    if (key in body) patch[key] = body[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No recognized fields in request body' }, { status: 400 })
  }

  const { error } = await supabase
    .from('budget_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
