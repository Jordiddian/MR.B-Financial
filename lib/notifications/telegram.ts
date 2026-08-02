// Telegram notifications for Auto-Post. Two distinct message types:
//
//   sendTelegramApproval   — content the AI flagged requires_human_review
//                            (Medicare, currently). Nothing publishes until
//                            Jordan replies YES to this specific message.
//   sendTelegramNotice     — everything else: already published on schedule,
//                            this is purely an FYI with no gating power.
//
// Every send is soft-fail — a Telegram outage must never break the actual
// posting pipeline, same principle as the existing Meneris alerting pattern.

const TELEGRAM_API = 'https://api.telegram.org'

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null
}

function chatId(): string | null {
  return process.env.TELEGRAM_CHAT_ID || null
}

export interface AdForTelegram {
  ad_type: string
  headline: string
  body_copy: string
  image_url: string | null
  post_hashtags: string | null
}

function buildCaption(ad: AdForTelegram, extraLines: string[]): string {
  return [
    `📋 ${ad.ad_type}`,
    '',
    ad.headline,
    '',
    ad.body_copy,
    ad.post_hashtags ? `\n${ad.post_hashtags}` : '',
    '',
    ...extraLines,
  ].filter(line => line !== undefined && line !== '').join('\n')
}

interface SendResult {
  ok: boolean
  messageId: number | null
}

async function sendPhoto(caption: string, photoUrl: string | null): Promise<SendResult> {
  const token = botToken()
  const chat = chatId()
  if (!token || !chat) return { ok: false, messageId: null }

  try {
    const path = photoUrl ? 'sendPhoto' : 'sendMessage'
    const body = photoUrl
      ? { chat_id: chat, photo: photoUrl, caption, parse_mode: 'HTML' }
      : { chat_id: chat, text: caption, parse_mode: 'HTML' }

    const res = await fetch(`${TELEGRAM_API}/bot${token}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok || !json.ok) return { ok: false, messageId: null }
    return { ok: true, messageId: json.result?.message_id ?? null }
  } catch {
    return { ok: false, messageId: null }
  }
}

/**
 * Send an approval request for content that requires human review before it
 * can post. Returns the Telegram message_id so the webhook can match a reply
 * back to this exact ad — the caller must persist it onto the ads row.
 */
export async function sendTelegramApproval(ad: AdForTelegram): Promise<number | null> {
  const caption = buildCaption(ad, [
    '⚠️ <b>Needs your review before this posts</b> — CMS requires a human sign-off.',
    'Reply <b>YES</b> to approve and post it, or <b>NO</b> to reject it.',
  ])
  const { messageId } = await sendPhoto(caption, ad.image_url)
  return messageId
}

/** FYI only — this already published on schedule, nothing to act on. */
export async function sendTelegramNotice(ad: AdForTelegram): Promise<void> {
  const caption = buildCaption(ad, ['✅ Posted automatically.'])
  await sendPhoto(caption, ad.image_url)
}

/** FYI for a failed auto-post attempt — no photo, just what went wrong. */
export async function sendTelegramFailure(adType: string, error: string): Promise<void> {
  await sendPhoto(`❌ Auto-post for <b>${adType}</b> failed: ${error}`, null)
}

/** Plain text reply — used by the webhook to confirm/clarify a yes/no reply. */
export async function sendTelegramText(text: string): Promise<void> {
  await sendPhoto(text, null)
}
