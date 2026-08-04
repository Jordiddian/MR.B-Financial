'use client'
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  ChartCard,
  CplByTypeChart,
  CplTrendChart,
  ScoreByTypeChart,
  SpendLeadsChart,
  StatCard,
} from './charts'
import { Page, PageHeader, Card, Loading } from './ui'

interface ReportingData {
  range_days: number
  daily: { date: string; spend: number; leads: number; clicks: number; impressions: number; cpl: number | null }[]
  by_ad_type: { ad_type: string; spend: number; leads: number; cpl: number | null; target: number | null; score: number | null }[]
  leads: { date: string; count: number }[]
  spend_categories: { category: string; amount: number }[]
  totals: {
    spend: number
    leads: number
    clicks: number
    impressions: number
    cpl: number | null
    ctr: number | null
    active_campaigns: number
    learning_campaigns: number
  }
}

interface BudgetContext {
  monthlyCap: number | null
  spentThisMonth: number
  leadsThisMonth: number
  pendingAds: number
}

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
]

export default function OverviewClient({ budget }: { budget: BudgetContext }) {
  const [range, setRange] = useState(30)
  const [data, setData] = useState<ReportingData | null>(null)
  const [loadedRange, setLoadedRange] = useState<number | null>(null)
  const [realOpenAiSpend, setRealOpenAiSpend] = useState<number | null>(null)

  // Ground-truth OpenAI spend from their Costs API, alongside the
  // estimate-based spentThisMonth below — the estimate is what actually
  // gates the monthly cap in real time, but it can drift from what OpenAI
  // really billed (older entries were flat per-generation guesses), so this
  // is shown for comparison rather than replacing it.
  useEffect(() => {
    fetch('/api/costs/openai')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.totalUsd != null) setRealOpenAiSpend(d.totalUsd) })
      .catch(() => {})
  }, [])

  // Derived rather than stored: we're loading whenever the range we're showing
  // isn't the range we've fetched. Setting a loading flag synchronously inside
  // the effect would trigger a cascading render.
  const loading = loadedRange !== range

  useEffect(() => {
    let cancelled = false
    fetch(`/api/reporting?days=${range}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) { setData(d); setLoadedRange(range) } })
      .catch(() => { if (!cancelled) setLoadedRange(range) })
    return () => { cancelled = true }
  }, [range])

  const { monthlyCap, spentThisMonth, leadsThisMonth, pendingAds } = budget
  const remaining = monthlyCap !== null ? monthlyCap - spentThisMonth : null
  const monthCpl = leadsThisMonth > 0 && spentThisMonth > 0 ? spentThisMonth / leadsThisMonth : null

  // Blended target across the products actually running, so the CPL trend line
  // has something meaningful to compare against.
  const activeTargets = (data?.by_ad_type ?? []).filter(t => t.spend > 0 && t.target != null)
  const blendedTarget = activeTargets.length > 0
    ? Math.round(activeTargets.reduce((s, t) => s + (t.target as number), 0) / activeTargets.length)
    : null

  const hasSeries = (data?.daily.length ?? 0) > 0
  const hasTypeData = (data?.by_ad_type ?? []).some(t => t.cpl != null || t.score != null)

  return (
    <Page>
      <PageHeader
        title="Overview"
        subtitle="Spend, leads, and cost efficiency across every active product line"
        actions={
          <div
            role="group"
            aria-label="Date range"
            className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1"
          >
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setRange(r.days)}
                aria-pressed={range === r.days}
                className={`relative text-xs px-3 py-1.5 rounded-md transition-colors ${
                  range === r.days ? 'text-white font-medium' : 'text-gray-400 hover:text-white'
                }`}
              >
                {range === r.days && (
                  <motion.span
                    layoutId="range-active"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 bg-gray-800 rounded-md"
                  />
                )}
                <span className="relative z-10">{r.label}</span>
              </button>
            ))}
          </div>
        }
      />

      {/* Month-to-date budget position — always from the authoritative
          month-scoped query, not the selected chart range. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Monthly budget"
          value={monthlyCap !== null ? `$${monthlyCap.toFixed(0)}` : '—'}
          hint={
            monthlyCap !== null
              ? `$${remaining!.toFixed(2)} remaining`
              : 'not set — go to Settings'
          }
          accent={remaining !== null && remaining < 0 ? 'red' : undefined}
          delay={0}
        />
        <StatCard
          label="Spent this month"
          value={`$${spentThisMonth.toFixed(2)}`}
          hint={
            realOpenAiSpend != null
              ? `ads + API · $${realOpenAiSpend.toFixed(2)} actual OpenAI spend`
              : 'ads + API costs'
          }
          delay={0.05}
        />
        <StatCard
          label="Leads this month"
          value={String(leadsThisMonth)}
          hint="from all sources"
          accent={leadsThisMonth > 0 ? 'green' : undefined}
          delay={0.1}
        />
        <StatCard
          label="Cost per lead"
          value={monthCpl !== null ? `$${monthCpl.toFixed(2)}` : '—'}
          hint="blended, month to date"
          accent={monthCpl !== null && blendedTarget !== null
            ? monthCpl <= blendedTarget ? 'green' : monthCpl <= blendedTarget * 2 ? 'amber' : 'red'
            : undefined}
          delay={0.15}
        />
      </div>

      {/* Range-scoped operational stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Impressions"
            value={data.totals.impressions.toLocaleString()}
            hint={`last ${range} days`}
            delay={0.2}
          />
          <StatCard
            label="Clicks"
            value={data.totals.clicks.toLocaleString()}
            hint={data.totals.ctr != null ? `${data.totals.ctr}% CTR` : 'no impressions yet'}
            delay={0.25}
          />
          <StatCard
            label="Active campaigns"
            value={String(data.totals.active_campaigns)}
            hint={
              data.totals.learning_campaigns > 0
                ? `${data.totals.learning_campaigns} still in learning phase`
                : 'all past learning phase'
            }
            accent="blue"
            delay={0.3}
          />
          <StatCard
            label="Awaiting approval"
            value={String(pendingAds)}
            hint={pendingAds > 0 ? 'review in Approvals' : 'nothing queued'}
            accent={pendingAds > 0 ? 'amber' : undefined}
            delay={0.35}
          />
        </div>
      )}

      {loading && !data ? (
        <Loading label="Loading charts…" />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ChartCard
              title="Spend and leads"
              subtitle={`Daily totals over the last ${range} days`}
              empty={!hasSeries}
              delay={0.4}
            >
              <SpendLeadsChart data={data?.daily ?? []} />
            </ChartCard>

            <ChartCard
              title="Cost per lead trend"
              subtitle={
                blendedTarget !== null
                  ? `Against a $${blendedTarget} blended target across running products`
                  : 'Daily blended cost per lead'
              }
              empty={!hasSeries}
              delay={0.45}
            >
              <CplTrendChart data={data?.daily ?? []} target={blendedTarget} />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ChartCard
              title="Cost per lead by product"
              subtitle="Green is at or under target, red is 2× over"
              empty={!hasTypeData}
              delay={0.5}
            >
              <CplByTypeChart data={data?.by_ad_type ?? []} />
            </ChartCard>

            <ChartCard
              title="AI score by product"
              subtitle="76+ is scale-eligible; the dashed line marks the threshold"
              empty={!hasTypeData}
              delay={0.55}
            >
              <ScoreByTypeChart data={data?.by_ad_type ?? []} />
            </ChartCard>
          </div>
        </>
      )}

      {monthlyCap !== null && (
        <Card delay={0.6}>
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-gray-400 text-sm">Budget consumed this month</p>
            <p className="text-gray-500 text-xs tabular-nums">
              {Math.round((spentThisMonth / monthlyCap) * 100)}%
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round((spentThisMonth / monthlyCap) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Monthly budget consumed"
            className="w-full bg-gray-800 rounded-full h-2 mb-3 overflow-hidden"
          >
            <motion.div
              className={`h-2 rounded-full ${
                spentThisMonth > monthlyCap ? 'bg-red-500' : 'bg-blue-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (spentThisMonth / monthlyCap) * 100)}%` }}
              transition={{ duration: 0.6, delay: 0.7, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 tabular-nums">
            <span>${spentThisMonth.toFixed(2)} spent</span>
            <span>${monthlyCap.toFixed(2)} budget</span>
          </div>
        </Card>
      )}
    </Page>
  )
}
