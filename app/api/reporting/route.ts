import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CPL_TARGETS } from '@/lib/optimizer/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Everything the overview dashboard charts need, in one round trip.
// ad_performance is append-only snapshots, so daily series come from
// collapsing to the last snapshot per ad type per day.

export interface DailyPoint {
  date: string
  spend: number
  leads: number
  clicks: number
  impressions: number
  cpl: number | null
}

export interface AdTypePoint {
  ad_type: string
  spend: number
  leads: number
  cpl: number | null
  target: number | null
  score: number | null
}

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

export async function GET(request: Request) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '30'), 7), 90)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const [perfRes, leadsRes, spendRes, campaignsRes] = await Promise.all([
    supabase
      .from('ad_performance')
      .select('recorded_at, ad_type, impressions, clicks, spend, leads, cost_per_lead, ai_score')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('leads')
      .select('created_at, interests')
      .gte('created_at', since),
    supabase
      .from('spending_log')
      .select('created_at, category, amount')
      .gte('created_at', since),
    supabase
      .from('campaigns')
      .select('ad_type, status, latest_score, avg_cpl, total_spend, total_leads, in_learning_phase'),
  ])

  const perf = perfRes.data ?? []

  // Snapshots repeat within a day; keep only the latest per (day, ad_type)
  // so summing across ad types doesn't double-count the same spend.
  const latestPerDayType = new Map<string, typeof perf[number]>()
  for (const row of perf) {
    const key = `${dayKey(row.recorded_at as string)}|${row.ad_type}`
    latestPerDayType.set(key, row) // ordered ascending, so last write wins
  }

  const dailyMap = new Map<string, DailyPoint>()
  for (const [key, row] of latestPerDayType) {
    const date = key.split('|')[0]
    const point = dailyMap.get(date) ?? {
      date, spend: 0, leads: 0, clicks: 0, impressions: 0, cpl: null,
    }
    point.spend += Number(row.spend ?? 0)
    point.leads += Number(row.leads ?? 0)
    point.clicks += Number(row.clicks ?? 0)
    point.impressions += Number(row.impressions ?? 0)
    dailyMap.set(date, point)
  }
  for (const point of dailyMap.values()) {
    point.spend = Number(point.spend.toFixed(2))
    point.cpl = point.leads > 0 ? Number((point.spend / point.leads).toFixed(2)) : null
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  // Per-ad-type roll-up from the most recent snapshot of each.
  const latestByType = new Map<string, typeof perf[number]>()
  for (const row of perf) latestByType.set(row.ad_type as string, row)

  const byAdType: AdTypePoint[] = Object.keys(CPL_TARGETS).map(adType => {
    const row = latestByType.get(adType)
    const spend = Number(row?.spend ?? 0)
    const leads = Number(row?.leads ?? 0)
    const cpl = row?.cost_per_lead != null
      ? Number(row.cost_per_lead)
      : leads > 0 ? Number((spend / leads).toFixed(2)) : null
    return {
      ad_type: adType,
      spend: Number(spend.toFixed(2)),
      leads,
      cpl,
      target: CPL_TARGETS[adType] ?? null,
      score: row?.ai_score == null ? null : Number(row.ai_score),
    }
  })

  // Lead volume by day, straight from the leads table (includes off-Meta sources).
  const leadsByDay = new Map<string, number>()
  for (const l of leadsRes.data ?? []) {
    const d = dayKey(l.created_at as string)
    leadsByDay.set(d, (leadsByDay.get(d) ?? 0) + 1)
  }
  const leadSeries = [...leadsByDay.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Spend split — ad spend vs the AI generation costs that fund it.
  const spendByCategory = new Map<string, number>()
  for (const s of spendRes.data ?? []) {
    const cat = (s.category as string) ?? 'other'
    spendByCategory.set(cat, (spendByCategory.get(cat) ?? 0) + Number(s.amount ?? 0))
  }
  const categories = [...spendByCategory.entries()].map(([category, amount]) => ({
    category,
    amount: Number(amount.toFixed(2)),
  }))

  const campaigns = campaignsRes.data ?? []
  const activeCampaigns = campaigns.filter(c => c.status === 'active')

  const totalSpend = daily.reduce((s, d) => s + d.spend, 0)
  const totalLeads = leadSeries.reduce((s, d) => s + d.count, 0)
  const totalClicks = daily.reduce((s, d) => s + d.clicks, 0)
  const totalImpressions = daily.reduce((s, d) => s + d.impressions, 0)

  return NextResponse.json({
    range_days: days,
    daily,
    by_ad_type: byAdType,
    leads: leadSeries,
    spend_categories: categories,
    totals: {
      spend: Number(totalSpend.toFixed(2)),
      leads: totalLeads,
      clicks: totalClicks,
      impressions: totalImpressions,
      cpl: totalLeads > 0 ? Number((totalSpend / totalLeads).toFixed(2)) : null,
      ctr: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(3)) : null,
      active_campaigns: activeCampaigns.length,
      learning_campaigns: activeCampaigns.filter(c => c.in_learning_phase).length,
    },
  })
}
