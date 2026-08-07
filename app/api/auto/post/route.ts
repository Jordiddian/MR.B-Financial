import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { generateAd } from '@/lib/ads/creative'
import { publishPostToMeta } from '@/lib/ads/social'
import { AUTO_POST_ROTATION_TYPES } from '@/lib/optimizer/config'
import { assignVariants, recordAllAssignments, ensureBaselineExperiments } from '@/lib/experiments/growthbook'
import { sendTelegramApproval, sendTelegramNotice, sendTelegramFailure } from '@/lib/notifications/telegram'

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
// any reason, auto mode does NOT post it. It stays pending in Approvals AND
// gets sent to Telegram as an approval request with the photo and caption —
// nothing publishes until Jordan replies YES (handled by
// app/api/telegram/webhook). Reply NO and it's rejected instead. This is
// what actually protects Medicare specifically — CMS rules mean every
// Medicare post gets this flag, so on Medicare's turn in the rotation it
// always waits for a human regardless of what auto mode would otherwise do.
// Everything else still auto-publishes on schedule exactly as before —
// Telegram just sends an FYI with the photo and caption after it's already
// live, with no gating power. The rotation always advances so one held
// draft can't jam the schedule.

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
      // Previously a silent no-op — if the prior day's post landed a bit
      // after the target time (Vercel's cron timing isn't exact), the next
      // day's run can land just under 24h and skip with zero trace anywhere,
      // making a genuinely-missed day indistinguishable from an
      // intentionally-skipped one after the fact.
      const note = `Last auto-post was ${elapsedHours.toFixed(1)}h ago — next one due at ${cadenceHours}h.`
      await supabase.from('auto_action_log').insert({
        kind: 'post', ad_type: 'n/a', status: 'skipped', reason: note,
      })
      return NextResponse.json({ ran: false, note })
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

  // Organic posts only ever test image_style (no Meta ad targeting to vary),
  // but they now go through the same experiment machinery paid ads use —
  // previously this called assignVariants without ever seeding the baseline
  // experiment first, so a product line with no paid history yet got no
  // assignment at all and every organic post silently skipped calibration.
  let style = 'lifestyle'
  let assignments: Record<string, string> = {}
  let assignmentKeys: Record<string, string> = {}
  try {
    await ensureBaselineExperiments([adType], ['image_style'])
    const result = await assignVariants(adType, `${adType}-autopost-${Date.now()}`)
    assignments = result.assignments
    assignmentKeys = result.keys
    if (assignments.image_style) style = assignments.image_style
  } catch {
    // Non-fatal — fall through with the default style.
  }

  try {
    const { ad, draft } = await generateAd({
      adType,
      mode: 'post',
      imageStyle: style,
      generatedBy: 'auto_post',
      experimentKey: assignmentKeys.image_style,
      experimentVariant: assignments.image_style,
    })
    const adId = ad.id as string

    await recordAllAssignments(adId, assignments, assignmentKeys).catch(() => {})

    if (draft.requires_human_review) {
      const telegramMessageId = await sendTelegramApproval({
        ad_type: adType,
        headline: draft.headline,
        body_copy: draft.body_copy,
        image_url: ad.image_url as string | null,
        post_hashtags: draft.post_hashtags ? draft.post_hashtags.join(' ') : null,
      })
      if (telegramMessageId) {
        await supabase.from('ads').update({ telegram_message_id: telegramMessageId }).eq('id', adId)
      }

      await supabase.from('auto_action_log').insert({
        kind: 'post', ad_type: adType, ad_id: adId,
        status: 'held_for_review',
        reason: telegramMessageId
          ? 'AI flagged this post as requiring human review — sent to Telegram for a yes/no, also waiting in Approvals.'
          : 'AI flagged this post as requiring human review — left pending in Approvals (Telegram send failed or is not configured).',
      })
      return NextResponse.json({
        ran: true, ad_type: adType, ad_id: adId,
        status: 'held_for_review',
        note: 'Generated but held for manual review — check Telegram or Approvals.',
      })
    }

    // Auto-approve, then post — no gate for anything but requires_human_review content.
    await supabase.from('ads').update({ status: 'approved' }).eq('id', adId)
    const result = await publishPostToMeta(adId, 'both')

    if (!result.success) {
      await supabase.from('auto_action_log').insert({
        kind: 'post', ad_type: adType, ad_id: adId,
        status: 'failed', reason: result.error,
      })
      await sendTelegramFailure(adType, result.error)
      return NextResponse.json({ ran: true, ad_type: adType, ad_id: adId, status: 'failed', error: result.error })
    }

    // A partial failure (one platform posted, the other silently didn't) used
    // to leave zero trace — the failed side's id was just null with no
    // reason logged anywhere. Surface it even though the run still counts as
    // published overall.
    const partialFailure = [
      result.facebookError ? `Facebook: ${result.facebookError}` : null,
      result.instagramError ? `Instagram: ${result.instagramError}` : null,
    ].filter(Boolean).join(' | ') || null

    await supabase.from('auto_action_log').insert({
      kind: 'post', ad_type: adType, ad_id: adId,
      status: 'published',
      reason: partialFailure,
      result: { facebookPostId: result.facebookPostId, instagramMediaId: result.instagramMediaId },
    })

    await sendTelegramNotice({
      ad_type: adType,
      headline: draft.headline,
      body_copy: draft.body_copy,
      image_url: ad.image_url as string | null,
      post_hashtags: draft.post_hashtags ? draft.post_hashtags.join(' ') : null,
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
    await sendTelegramFailure(adType, message)
    return NextResponse.json({ ran: true, ad_type: adType, status: 'failed', error: message }, { status: 502 })
  }
}

export async function GET(request: Request) {
  return runAutoPost(request.headers.get('authorization'))
}
export async function POST(request: Request) {
  return runAutoPost(request.headers.get('authorization'))
}
