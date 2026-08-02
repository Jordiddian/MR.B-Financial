import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateAd } from '@/lib/ads/creative'
import { assignVariants, recordAssignment } from '@/lib/experiments/growthbook'

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
  let experimentKey: string | undefined
  let experimentVariant: string | undefined

  if (!image_style) {
    try {
      const { assignments, keys } = await assignVariants(ad_type, `${ad_type}-${Date.now()}`)
      if (assignments.image_style) {
        style = assignments.image_style
        experimentVariant = assignments.image_style
        experimentKey = keys.image_style
      }
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
      experimentKey,
      experimentVariant,
    })

    if (experimentKey && experimentVariant) {
      await recordAssignment({
        experimentKey,
        adId: ad.id as string,
        variant: experimentVariant,
      }).catch(() => {})
    }

    return NextResponse.json(ad)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    const status = message === 'OpenAI API error' ? 502 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
