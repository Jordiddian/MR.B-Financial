// TEMPORARY diagnostic route — deleted after verification.
import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { LANDING_URL } from '@/lib/ads/creative'

export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    resolvedLandingUrl: LANDING_URL,
    rawEnvValue: process.env.LANDING_URL,
    rawEnvType: typeof process.env.LANDING_URL,
    rawEnvLength: process.env.LANDING_URL?.length ?? null,
  })
}
