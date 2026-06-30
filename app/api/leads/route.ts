import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, phone, interests } = body

    if (!name || !phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await supabase.from('leads').insert({
      name,
      phone,
      interests: interests || '',
      source: 'website_form',
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Lead insert error:', err)
    return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 })
  }
}
