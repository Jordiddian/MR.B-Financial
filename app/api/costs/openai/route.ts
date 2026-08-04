import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchRealOpenAICosts } from '@/lib/optimizer/openai-costs'

// Real, actual OpenAI spend for the current month — ground truth from the
// Costs API, shown alongside (not instead of) the estimate-based
// "spentThisMonth" figure that spending_log/the budget cap still use.
export async function GET() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  try {
    const result = await fetchRealOpenAICosts(startOfMonth)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch OpenAI costs'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
