import { createClient } from '@/lib/supabase/server'
import OverviewClient from './OverviewClient'

// Month-to-date budget position is fetched on the server so the page paints
// with real numbers immediately; the charts hydrate client-side against
// /api/reporting because the range is user-switchable.

export default async function OverviewPage() {
  const supabase = await createClient()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [leadsResult, spendResult, adsResult, budgetResult] = await Promise.all([
    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth),
    supabase
      .from('spending_log')
      .select('amount')
      .gte('created_at', startOfMonth),
    supabase
      .from('ads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('budget_settings')
      .select('monthly_cap')
      .eq('id', 1)
      .single(),
  ])

  const totalSpend = (spendResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  )

  return (
    <OverviewClient
      budget={{
        monthlyCap: budgetResult.data?.monthly_cap ? Number(budgetResult.data.monthly_cap) : null,
        spentThisMonth: totalSpend,
        leadsThisMonth: leadsResult.count ?? 0,
        pendingAds: adsResult.count ?? 0,
      }}
    />
  )
}
