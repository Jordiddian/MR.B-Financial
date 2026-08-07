import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { publishPostToMeta } from '@/lib/ads/social'
import { sendTelegramText } from '@/lib/notifications/telegram'

export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Receives Telegram's webhook callbacks for replies to auto-post approval
// requests. This is the only place a Telegram reply can actually change
// anything — it never trusts the message content beyond "did this come from
// Telegram with our secret" and "does the text parse as yes or no."
//
// Matching a reply to the ad it's about:
//   1. Prefer message.reply_to_message.message_id — set when Jordan actually
//      swipes/long-presses to reply to the specific approval message.
//   2. Fall back to the single most recent still-pending ad that has a
//      telegram_message_id at all, if he just sends a bare "yes"/"no" with
//      no reply-to. This is safe in practice because auto-post only ever
//      holds one item for review at a time (Medicare's rotation slot, once
//      a day at most) — there's essentially never a second candidate to
//      confuse it with.
//
// Always returns 200 quickly. Telegram retries on non-200s, and since every
// action here is gated on ad.status === 'pending', a retried delivery is a
// safe no-op (it just won't find a pending row to act on the second time).

interface TelegramUpdate {
  message?: {
    text?: string
    reply_to_message?: { message_id?: number }
  }
}

function parseYesNo(text: string): 'yes' | 'no' | null {
  const normalized = text.trim().toLowerCase()
  if (['yes', 'y', 'approve', 'approved', '👍'].includes(normalized)) return 'yes'
  if (['no', 'n', 'reject', 'rejected', '👎'].includes(normalized)) return 'no'
  return null
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const incomingSecret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || incomingSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const text = update.message?.text
  if (!text) return NextResponse.json({ ok: true })

  const decision = parseYesNo(text)
  if (!decision) {
    await sendTelegramText('Reply YES to approve or NO to reject.')
    return NextResponse.json({ ok: true })
  }

  const replyToId = update.message?.reply_to_message?.message_id

  const query = supabase.from('ads').select('*').eq('status', 'pending').not('telegram_message_id', 'is', null)
  const { data: ad } = replyToId
    ? await query.eq('telegram_message_id', replyToId).maybeSingle()
    : await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!ad) {
    await sendTelegramText('Nothing waiting for your approval right now.')
    return NextResponse.json({ ok: true })
  }

  if (decision === 'no') {
    await supabase.from('ads').update({ status: 'rejected' }).eq('id', ad.id)
    await supabase.from('auto_action_log').insert({
      kind: 'post', ad_type: ad.ad_type, ad_id: ad.id,
      status: 'rejected', reason: 'Rejected via Telegram reply.',
    })
    await sendTelegramText(`❌ Rejected — "${ad.headline}" (${ad.ad_type}) will not post.`)
    return NextResponse.json({ ok: true })
  }

  // decision === 'yes'
  await supabase.from('ads').update({ status: 'approved' }).eq('id', ad.id)
  const result = await publishPostToMeta(ad.id, 'both')

  if (!result.success) {
    await supabase.from('auto_action_log').insert({
      kind: 'post', ad_type: ad.ad_type, ad_id: ad.id,
      status: 'failed', reason: result.error,
    })
    await sendTelegramText(`⚠️ Approved, but posting failed: ${result.error}`)
    return NextResponse.json({ ok: true })
  }

  const partialFailure = [
    result.facebookError ? `Facebook: ${result.facebookError}` : null,
    result.instagramError ? `Instagram: ${result.instagramError}` : null,
  ].filter(Boolean).join(' | ')

  await supabase.from('auto_action_log').insert({
    kind: 'post', ad_type: ad.ad_type, ad_id: ad.id,
    status: 'published',
    result: { facebookPostId: result.facebookPostId, instagramMediaId: result.instagramMediaId },
    reason: partialFailure ? `Approved via Telegram reply. ${partialFailure}` : 'Approved via Telegram reply.',
  })
  await sendTelegramText(
    partialFailure
      ? `✅ Approved and posted — "${ad.headline}" (${ad.ad_type}). ⚠️ ${partialFailure}`
      : `✅ Approved and posted — "${ad.headline}" (${ad.ad_type}).`
  )

  return NextResponse.json({ ok: true })
}
