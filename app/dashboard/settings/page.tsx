'use client'
import { useState, useEffect } from 'react'
import {
  Page, PageHeader, Card, Button, Toggle, SettingRow, Loading, Badge, money,
} from '../ui'
import { planBudget } from '@/lib/optimizer/budget'
import AutoModeSection from './AutoModeSection'

const IMAGE_COST = 0.04  // gpt-image-1 at 1024×1024
const COPY_COST  = 0.01  // gpt-4o-mini per completion

const AUTOMATION = [
  { ok: true,  label: 'Meta Ads API connected', detail: 'account + access token + page' },
  { ok: true,  label: 'Meta Pixel + Conversions API', detail: 'live on the landing page' },
  { ok: true,  label: 'Daily sync — 8:00am PT', detail: 'pulls Meta figures, scores them, writes the memory log' },
  { ok: true,  label: 'Budget optimizer — 8:30am PT', detail: 'stages changes for your approval; never spends on its own' },
  { ok: true,  label: 'Creative refresh — Mondays 9:00am PT', detail: 'regenerates winning product lines only' },
  { ok: false, label: 'OpenAI billing', detail: 'keep a balance topped up for copy + image generation' },
  { ok: false, label: 'Business verification', detail: 'needed for a non-expiring Meta token' },
]

export default function SettingsPage() {
  const [monthlyCap, setMonthlyCap] = useState<number | null>(null)
  const [postingMode, setPostingMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [togglingMode, setTogglingMode] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setMonthlyCap(data.monthly_cap ?? null)
        setPostingMode(data.posting_mode ?? false)
        setLoading(false)
      })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_cap: monthlyCap }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function togglePostingMode() {
    setTogglingMode(true)
    const next = !postingMode
    setPostingMode(next)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posting_mode: next }),
    })
    setTogglingMode(false)
  }

  // Live budget math — mirrors exactly what /api/meta/publish will actually do,
  // including the burst fallback below Meta's $1/day minimum.
  const cap = monthlyCap ?? 0
  const perAdCost = IMAGE_COST + COPY_COST
  const availableForAds = Math.max(cap - perAdCost, 0)
  const plan = planBudget({ monthlyCapCents: Math.round(availableForAds * 100), spentCents: 0 })

  if (loading) {
    return <Page><Loading /></Page>
  }

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Budget, operating mode, and system status" />

      <div className="space-y-4 max-w-2xl">

        {/* Monthly budget */}
        <Card delay={0}>
          <h2 className="text-white text-sm font-semibold mb-1">Monthly budget</h2>
          <p className="text-gray-500 text-xs mb-4 leading-relaxed">
            One total limit covering everything — AI generation and Meta ad spend combined.
            The optimizer and the weekly refresh both stop once this is reached.
          </p>
          <form onSubmit={handleSave}>
            <label htmlFor="cap" className="block text-gray-400 text-xs mb-1.5">
              Total monthly cap
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                <input
                  id="cap"
                  type="number"
                  min={0}
                  placeholder="500"
                  value={monthlyCap ?? ''}
                  onChange={e => setMonthlyCap(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-white placeholder-gray-600 text-sm transition-colors focus:outline-none focus:border-blue-500"
                />
              </div>
              <Button type="submit" variant="primary" size="md" disabled={saving}>
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Budget breakdown */}
        <Card delay={0.05}>
          <h2 className="text-white text-sm font-semibold mb-1">How the budget breaks down</h2>
          <p className="text-gray-500 text-xs mb-4">
            Estimated per ad generated. Actual API costs vary slightly.
          </p>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-400">Monthly cap</dt>
              <dd className="text-white font-medium tabular-nums">{cap > 0 ? money(cap) : '—'}</dd>
            </div>

            <div className="border-t border-gray-800 pt-2.5 mt-1">
              <p className="text-gray-500 text-xs mb-2">Per-ad AI cost, deducted when you generate</p>
              <div className="space-y-1 pl-3">
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Image — gpt-image-1, 1024×1024</span>
                  <span className="text-gray-400 text-xs tabular-nums">~{money(IMAGE_COST)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Copy — gpt-4o</span>
                  <span className="text-gray-400 text-xs tabular-nums">~{money(COPY_COST)}</span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t border-gray-800/60">
                  <span className="text-gray-400 text-xs">Total per generation</span>
                  <span className="text-gray-300 text-xs tabular-nums">~{money(perAdCost)}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-2.5">
              <div className="flex justify-between">
                <dt className="text-gray-400">Available for Meta ad spend</dt>
                <dd className={`font-medium tabular-nums ${availableForAds > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                  {cap > 0 ? money(availableForAds) : '—'}
                </dd>
              </div>
              <div className="flex justify-between mt-1">
                <dt className="text-gray-400">
                  {plan.strategy === 'burst' ? `Daily budget, ${plan.runDays}-day burst` : 'Daily Meta budget, this month'}
                </dt>
                <dd className={`font-medium tabular-nums ${plan.dailyBudgetCents > 0 ? 'text-white' : 'text-gray-500'}`}>
                  {cap > 0 && plan.viable ? `${money(plan.dailyBudgetCents / 100)}/day` : '—'}
                </dd>
              </div>
            </div>
          </dl>

          {cap > 0 && !plan.viable && (
            <p className="mt-4 text-yellow-400 text-xs bg-yellow-950/40 border border-yellow-900/60 rounded-lg px-3 py-2 leading-relaxed">
              {plan.note}
            </p>
          )}
          {cap > 0 && plan.strategy === 'burst' && (
            <p className="mt-4 text-blue-300 text-xs bg-blue-950/40 border border-blue-900/60 rounded-lg px-3 py-2 leading-relaxed">
              {plan.note}
            </p>
          )}
          {cap > 0 && plan.strategy === 'continuous' && (
            <p className="mt-4 text-gray-500 text-xs leading-relaxed">
              At {money(plan.dailyBudgetCents / 100)}/day targeting California, expect roughly{' '}
              {Math.round((plan.dailyBudgetCents / 100) * 80).toLocaleString()}–
              {Math.round((plan.dailyBudgetCents / 100) * 300).toLocaleString()}{' '}
              impressions/day depending on audience competition.
            </p>
          )}
        </Card>

        {/* Operating mode */}
        <Card delay={0.1} className="space-y-4">
          <h2 className="text-white text-sm font-semibold">Operating mode</h2>

          <SettingRow
            title="Posting Mode"
            description={
              postingMode
                ? 'Organic posts only — no paid campaigns, no ad spend'
                : 'Advertising Mode — generating paid Meta campaigns (default)'
            }
            control={
              <Toggle
                label="Posting Mode"
                checked={postingMode}
                onChange={togglePostingMode}
                disabled={togglingMode}
                tone="purple"
              />
            }
          />

          {postingMode && (
            <p className="text-purple-300 text-xs bg-purple-950/40 border border-purple-900/60 rounded-lg px-3 py-2 leading-relaxed">
              Generated content will be organic post copy with hashtags — no Meta campaign is
              created. Switch back to Advertising Mode to resume paid campaigns.
            </p>
          )}

          <p className="text-gray-500 text-xs leading-relaxed pt-3 border-t border-gray-800">
            This controls what the <span className="text-gray-400">Generate</span> button in
            Approvals produces when you click it manually. Auto Mode below runs independently of
            this switch.
          </p>
        </Card>

        <AutoModeSection />

        {/* System status */}
        <Card delay={0.15}>
          <h2 className="text-white text-sm font-semibold mb-1">System status</h2>
          <p className="text-gray-500 text-xs mb-4">Connections and schedules powering the pipeline</p>
          <ul className="space-y-2.5">
            {AUTOMATION.map(item => (
              <li key={item.label} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex-shrink-0 text-xs ${item.ok ? 'text-green-400' : 'text-yellow-400'}`}
                  aria-label={item.ok ? 'active' : 'needs attention'}
                >
                  {item.ok ? '✓' : '○'}
                </span>
                <span className="min-w-0">
                  <span className="text-gray-300 text-sm">{item.label}</span>
                  <span className="text-gray-500 text-xs block leading-relaxed">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card delay={0.3}>
          <div className="flex items-start gap-3">
            <Badge tone="blue">How it works</Badge>
            <p className="text-gray-400 text-xs leading-relaxed">
              With Auto-Post and Auto-Ads both off, nothing spends or publishes without you
              clicking Approve — the optimizer only ever writes a recommendation to the banner
              at the top of every page. Turning either Auto switch on removes that human step for
              that pipeline specifically. CMS-flagged and human-review-flagged content is never
              auto-published regardless of these switches — it always lands in Approvals instead.
            </p>
          </div>
        </Card>

      </div>
    </Page>
  )
}
