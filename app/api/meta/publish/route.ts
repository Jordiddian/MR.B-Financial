import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { publishAdToMeta } from '@/lib/ads/meta-publish'

export async function POST(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'ad id required' }, { status: 400 })

  // Manual publish always leaves the campaign PAUSED — a human resumes it in
  // Ads Manager. Only the auto-ads pipeline (app/api/auto/ads) activates.
  const result = await publishAdToMeta(id, { activate: false })

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, budget_exhausted: result.budgetExhausted ?? false },
      { status: result.budgetExhausted ? 400 : 502 }
    )
  }

  return NextResponse.json({
    success: true,
    meta_ad_id: result.meta_ad_id,
    campaign_id: result.campaign_id,
    budget_strategy: result.budgetPlan.strategy,
    daily_budget: `$${(result.budgetPlan.dailyBudgetCents / 100).toFixed(2)}`,
    note: `Created in Meta as PAUSED. Activate it in Ads Manager to start spending. ${result.budgetPlan.note}`,
  })
}
