import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateAd } from '@/lib/ads/creative'
import { assignVariants, recordAllAssignments, ensureBaselineExperiments } from '@/lib/experiments/growthbook'

export const maxDuration = 60

export async function POST(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ad_type, note, with_image, image_style, mode = 'ad' } = await request.json()
  if (!ad_type) return NextResponse.json({ error: 'ad_type required' }, { status: 400 })
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 })
  }

  // If an experiment is running on image style for this product, let it pick —
  // an explicit style from the UI always overrides the experiment.
  let style: string = image_style ?? 'lifestyle'
  let assignments: Record<string, string> = {}
  let assignmentKeys: Record<string, string> = {}

  if (!image_style) {
    try {
      const dimensions = mode === 'ad' ? (['image_style', 'audience_type'] as const) : (['image_style'] as const)
      await ensureBaselineExperiments([ad_type], [...dimensions])
      const result = await assignVariants(ad_type, `${ad_type}-${Date.now()}`)
      assignments = result.assignments
      assignmentKeys = result.keys
      if (assignments.image_style) style = assignments.image_style
    } catch {
      // Experiments are an optimization, never a hard dependency.
    }
  }

  try {
    const { ad } = await generateAd({
      adType: ad_type,
      note,
      withImage: with_image !== false,
      imageStyle: style,
      mode,
      generatedBy: 'manual',
      experimentKey: assignmentKeys.image_style,
      experimentVariant: assignments.image_style,
    })

    await recordAllAssignments(ad.id as string, assignments, assignmentKeys).catch(() => {})

    return NextResponse.json(ad)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    const status = message === 'OpenAI API error' ? 502 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
