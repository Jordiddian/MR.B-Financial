import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  DIMENSION_VARIANTS,
  experimentKey,
  ensureBaselineExperiments,
  rollUpExperimentResults,
  type Dimension,
} from '@/lib/experiments/growthbook'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireUser() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  return user
}

// GET — every experiment with its rolled-up results, for the dashboard.
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — start an experiment, or refresh results across all of them.
// Body: { action: 'seed' } | { action: 'rollup' } | { ad_type, dimension }
export async function POST(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  if (body.action === 'seed') {
    const created = await ensureBaselineExperiments()
    return NextResponse.json({ created })
  }

  if (body.action === 'rollup') {
    const summary = await rollUpExperimentResults()
    return NextResponse.json(summary)
  }

  const { ad_type, dimension } = body as { ad_type?: string; dimension?: Dimension }
  if (!ad_type || !dimension) {
    return NextResponse.json({ error: 'ad_type and dimension required' }, { status: 400 })
  }
  if (!DIMENSION_VARIANTS[dimension]) {
    return NextResponse.json(
      { error: `Unknown dimension. Valid: ${Object.keys(DIMENSION_VARIANTS).join(', ')}` },
      { status: 400 }
    )
  }

  const key = experimentKey(ad_type, dimension)
  const { data, error } = await supabase
    .from('experiments')
    .upsert(
      {
        experiment_key: key,
        ad_type,
        dimension,
        variants: DIMENSION_VARIANTS[dimension],
        status: 'running',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'experiment_key' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — conclude an experiment by hand (pin a winner) or abandon it.
export async function PATCH(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, winner } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const VALID_STATUS = ['running', 'concluded', 'abandoned']
  if (status && !VALID_STATUS.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Valid: ${VALID_STATUS.join(', ')}` },
      { status: 400 }
    )
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status) patch.status = status

  if (winner) {
    // A winner is pinned into every future generation for this ad type, so it
    // has to be one of the arms actually under test — otherwise the style
    // silently falls back to the default and the experiment reads as decided
    // when nothing was learned.
    const { data: exp } = await supabase
      .from('experiments')
      .select('variants')
      .eq('id', id)
      .maybeSingle()

    const variants = (exp?.variants ?? []) as string[]
    if (!variants.includes(winner)) {
      return NextResponse.json(
        { error: `"${winner}" is not a variant of this experiment. Valid: ${variants.join(', ')}` },
        { status: 400 }
      )
    }

    patch.winner = winner
    patch.status = 'concluded'
    patch.concluded_at = new Date().toISOString()
    patch.conclusion_notes = `Winner set manually by ${user.email}.`
  }

  const { error } = await supabase.from('experiments').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
