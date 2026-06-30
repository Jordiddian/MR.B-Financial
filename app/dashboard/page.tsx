import { createClient } from '@/lib/supabase/server'

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
      .select('monthly_cap, max_ad_spend, max_api_costs')
      .eq('id', 1)
      .single(),
  ])

  const leadsThisMonth = leadsResult.count ?? 0
  const totalSpend = (spendResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  )
  const pendingAds = adsResult.count ?? 0
  const monthlyCap = budgetResult.data?.monthly_cap
    ? Number(budgetResult.data.monthly_cap)
    : null
  const remaining = monthlyCap !== null ? monthlyCap - totalSpend : null
  const cpl = leadsThisMonth > 0 && totalSpend > 0 ? totalSpend / leadsThisMonth : null

  return (
    <div className="p-8">
      <h1 className="text-white text-2xl font-semibold mb-1">Overview</h1>
      <p className="text-gray-400 text-sm mb-8">Monthly summary and budget status</p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-400 text-sm mb-1">Monthly ad budget</p>
          <p className="text-white text-3xl font-semibold">
            {monthlyCap !== null ? `$${monthlyCap.toFixed(0)}` : '—'}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            {monthlyCap !== null
              ? `$${remaining!.toFixed(2)} remaining`
              : 'not set — go to Settings'}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-400 text-sm mb-1">Spent this month</p>
          <p className="text-white text-3xl font-semibold">${totalSpend.toFixed(2)}</p>
          <p className="text-gray-500 text-xs mt-1">ads + API costs</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-400 text-sm mb-1">Leads this month</p>
          <p className="text-white text-3xl font-semibold">{leadsThisMonth}</p>
          <p className="text-gray-500 text-xs mt-1">from all sources</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-400 text-sm mb-1">Cost per lead</p>
          <p className="text-white text-3xl font-semibold">
            {cpl !== null ? `$${cpl.toFixed(2)}` : '—'}
          </p>
          <p className="text-gray-500 text-xs mt-1">avg this month</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-gray-400 text-sm mb-4">Budget breakdown</p>
        {monthlyCap !== null ? (
          <>
            <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
              <div
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: `${Math.min(100, (totalSpend / monthlyCap) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>${totalSpend.toFixed(2)} spent</span>
              <span>${monthlyCap.toFixed(2)} budget</span>
            </div>
            {pendingAds > 0 && (
              <p className="text-yellow-400 text-xs mt-3">
                {pendingAds} ad{pendingAds === 1 ? '' : 's'} waiting for approval
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-sm">
            Set a monthly budget in Settings to see the breakdown here.
          </p>
        )}
      </div>
    </div>
  )
}
