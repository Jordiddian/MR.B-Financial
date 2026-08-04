import { createClient } from '@supabase/supabase-js'
import OverviewClient from './OverviewClient'

// Month-to-date budget position is fetched on the server so the page paints
// with real numbers immediately; the charts hydrate client-side against
// /api/reporting because the range is user-switchable.
//
// Uses the service-role client, not the cookie-bound anon client from
// @/lib/supabase/server — these tables have RLS enabled with no policy
// granting the authenticated role read access, so the anon client silently
// returned zero rows for every query here (no error, just empty data),
// which is why this page showed $0.00 spent and 0 leads/pending ads
// regardless of what was actually in the tables. The layout above already
// gates the whole /dashboard tree on a real logged-in user via the anon
// client's auth.getUser() — that part was never the problem.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function OverviewPage() {

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
