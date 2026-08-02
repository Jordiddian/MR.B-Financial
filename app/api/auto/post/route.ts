import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { generateAd } from '@/lib/ads/creative'
import { publishPostToMeta } from '@/lib/ads/social'
import { AUTO_POST_ROTATION_TYPES } from '@/lib/optimizer/config'
import { assignVariants, recordAssignment } from '@/lib/experiments/growthbook'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fully automatic organic posting: generate → approve → post, no human step.
// This is Jordan's opening phase — prove the account with a month of organic
// posts before auto-ads ever touches real spend. Runs on a cadence (default
// 24h), rotating through all five product lines in AUTO_POST_ROTATION_TYPES
// — Covered California, Medicare, Dental, Vision, Final Expenses, one per
// cycle, so no single product line dominates the feed and every line gets
// equal turns.
//
// Compliance carve-out: if the AI flags a draft as requires_human_review for
// any reason, auto mode does NOT post it. It stays pending in Approvals and a
// human decides. This is what actually protects Medicare specifically — CMS
// rules mean every Medicare post gets this flag, so on Medicare's turn in the
// rotation it always generates and lands in Approvals rather than posting
// itself. The rotation still advances so one flagged draft can't jam the
// schedule.

async function runAutoPost(authHeader: string | null) {
  const isCron = isCronRequest(authHeader)
  if (!isCron) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: settings } = await supabase
    .from('budget_settings')
    .select('auto_post_enabled, auto_post_cadence_hours, last_auto_post_at, auto_post_rotation_index')
    .eq('id', 1)
    .single()

  if (!settings?.auto_post_enabled) {
    return NextResponse.json({ ran: false, note: 'Auto-post is disabled — turn it on in Settings.' })
  }

  const cadenceHours = settings.auto_post_cadence_hours ?? 24
  if (settings.last_auto_post_at) {
    const elapsedHours = (Date.now() - new Date(settings.last_auto_post_at).getTime()) / 3_600_000
    if (elapsedHours < cadenceHours) {
      return NextResponse.json({
        ran: false,
        note: `Last auto-post was ${elapsedHours.toFixed(1)}h ago — next one due at ${cadenceHours}h.`,
      })
    }
  }

  const rotationIndex = settings.auto_post_rotation_index ?? 0
  const adType = AUTO_POST_ROTATION_TYPES[rotationIndex % AUTO_POST_ROTATION_TYPES.length]

  // Reserve the slot immediately — if generation or posting throws, we still
  // want the schedule to advance rather than retry the same slot forever.
  const now = new Date().toISOString()
  await supabase.from('budget_settings').update({
    last_auto_post_at: now,
    auto_post_rotation_index: rotationIndex + 1,
  }).eq('id', 1)

  let style = 'lifestyle'
  let experimentKey: string | undefined
  let experimentVariant: string | undefined
  try {
    const { assignments, keys } = await assignVariants(adType, `${adType}-autopost-${Date.now()}`)
    if (assignments.image_style) {
      style = assignments.image_style
      experimentVariant = assignments.image_style
      experimentKey = keys.image_style
    }
  } catch {
    // Non-fatal — fall through with the default style.
  }

  try {
    const { ad, draft } = await generateAd({
      adType,
      mode: 'post',
      imageStyle: style,
      generatedBy: 'auto_post',
      experimentKey,
      experimentVariant,
    })
    const adId = ad.id as string

    if (experimentKey && experimentVariant) {
      await recordAssignment({ experimentKey, adId, variant: experimentVariant }).catch(() => {})
    }

    if (draft.requires_human_review) {
      await supabase.from('auto_action_log').insert({
        kind: 'post', ad_type: adType, ad_id: adId,
        status: 'held_for_review',
        reason: 'AI flagged this post as requiring human review — left pending in Approvals.',
      })
      return NextResponse.json({
        ran: true, ad_type: adType, ad_id: adId,
        status: 'held_for_review',
        note: 'Generated but held for manual review — check Approvals.',
      })
    }

    // Auto-approve, then post.
    await supabase.from('ads').update({ status: 'approved' }).eq('id', adId)
    const result = await publishPostToMeta(adId, 'both')

    if (!result.success) {
      await supabase.from('auto_action_log').insert({
        kind: 'post', ad_type: adType, ad_id: adId,
        status: 'failed', reason: result.error,
      })
      return NextResponse.json({ ran: true, ad_type: adType, ad_id: adId, status: 'failed', error: result.error })
    }

    await supabase.from('auto_action_log').insert({
      kind: 'post', ad_type: adType, ad_id: adId,
      status: 'published',
      result: { facebookPostId: result.facebookPostId, instagramMediaId: result.instagramMediaId },
    })

    return NextResponse.json({
      ran: true, ad_type: adType, ad_id: adId, status: 'published',
      facebook: result.facebookPostId, instagram: result.instagramMediaId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-post failed'
    await supabase.from('auto_action_log').insert({
      kind: 'post', ad_type: adType, status: 'failed', reason: message,
    })
    return NextResponse.json({ ran: true, ad_type: adType, status: 'failed', error: message }, { status: 502 })
  }
}

export async function GET(request: Request) {
  return runAutoPost(request.headers.get('authorization'))
}
export async function POST(request: Request) {
  return runAutoPost(request.headers.get('authorization'))
}
