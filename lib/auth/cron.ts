import crypto from 'crypto'

/**
 * Verify a request came from the Vercel cron scheduler.
 *
 * Deliberately fails CLOSED. The naive form of this check,
 *
 *   authHeader === `Bearer ${process.env.CRON_SECRET}`
 *
 * silently becomes `authHeader === "Bearer undefined"` when the env var is
 * missing — a string any anonymous caller can send. On routes that spend real
 * money (creative generation bills OpenAI; the optimizer writes to the budget
 * approval queue) that turns one misconfigured environment into open access.
 * With no secret configured, nothing authenticates as cron.
 *
 * Comparison is constant-time so the secret can't be recovered byte-by-byte.
 */
export function isCronRequest(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !authHeader) return false

  const expected = `Bearer ${secret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}
