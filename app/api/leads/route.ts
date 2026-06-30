import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `1${digits}` : digits
}

async function fireCapiLead(
  name: string,
  phone: string,
  interests: string,
  eventId: string,
  sourceUrl: string
) {
  const pixelId = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN
  if (!pixelId || !token) return

  const parts = name.trim().split(' ')
  const firstName = parts[0] ?? ''
  const lastName = parts.slice(1).join(' ')

  const userData: Record<string, string[]> = {
    ph: [sha256(normalizePhone(phone))],
  }
  if (firstName) userData.fn = [sha256(firstName)]
  if (lastName) userData.ln = [sha256(lastName)]

  try {
    await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          {
            event_name: 'Lead',
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_source_url: sourceUrl || 'https://mrb-site-beta.vercel.app',
            event_id: eventId,
            user_data: userData,
            custom_data: {
              content_name: interests || 'General Inquiry',
              content_category: 'Insurance',
            },
          },
        ],
        access_token: token,
      }),
    })
  } catch (err) {
    console.error('CAPI error:', err)
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, phone, interests, event_id, source_url } = body

    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const eventId = event_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const [dbResult] = await Promise.allSettled([
      supabase.from('leads').insert({
        name,
        phone,
        interests: interests || '',
        source: 'website_form',
      }),
      fireCapiLead(name, phone, interests || '', eventId, source_url || ''),
    ])

    if (dbResult.status === 'fulfilled' && dbResult.value.error) {
      throw dbResult.value.error
    }

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('Lead insert error:', err)
    return NextResponse.json(
      { error: 'Failed to save lead' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
