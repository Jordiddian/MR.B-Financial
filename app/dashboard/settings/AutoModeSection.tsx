'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, SettingRow, Toggle, Button, Badge, Loading } from '../ui'

// Auto mode: fully automatic, no-human-in-the-loop pipelines. Posting and ads
// are independent — the plan is a month of organic posts proving the account
// out before ads ever spend, so each needs its own switch and cadence.
//
// This component owns its own data fetching (settings + recent activity)
// rather than threading state through the parent page, same pattern as
// BudgetProposalBanner — it's a self-contained unit.

interface AutoSettings {
  auto_post_enabled: boolean
  auto_post_cadence_hours: number
  last_auto_post_at: string | null
  auto_ads_enabled: boolean
  auto_ads_cadence_hours: number
  last_auto_ads_at: string | null
}

interface LogEntry {
  id: string
  kind: string
  ad_type: string
  status: string
  reason: string | null
  created_at: string
}

const CADENCE_OPTIONS = [
  { hours: 24, label: 'Daily' },
  { hours: 48, label: 'Every 2 days' },
  { hours: 72, label: 'Every 3 days' },
  { hours: 168, label: 'Weekly' },
]

const STATUS_TONE: Record<string, 'green' | 'blue' | 'amber' | 'red' | 'neutral'> = {
  published: 'green',
  held_for_review: 'amber',
  skipped: 'neutral',
  failed: 'red',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function AutoModeSection() {
  const [settings, setSettings] = useState<AutoSettings | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<{ pipeline: string; text: string } | null>(null)

  const load = useCallback(() =>
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/auto/log?limit=8').then(r => r.json()),
    ]).then(([s, l]) => {
      setSettings({
        auto_post_enabled: s.auto_post_enabled ?? false,
        auto_post_cadence_hours: s.auto_post_cadence_hours ?? 24,
        last_auto_post_at: s.last_auto_post_at ?? null,
        auto_ads_enabled: s.auto_ads_enabled ?? false,
        auto_ads_cadence_hours: s.auto_ads_cadence_hours ?? 168,
        last_auto_ads_at: s.last_auto_ads_at ?? null,
      })
      setLog(Array.isArray(l) ? l : [])
      setLoading(false)
    }), [])

  useEffect(() => { void load() }, [load])

  async function patch(field: string, value: unknown) {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
  }

  async function toggleAutoPost() {
    if (!settings) return
    setToggling('post')
    const next = !settings.auto_post_enabled
    setSettings({ ...settings, auto_post_enabled: next })
    await patch('auto_post_enabled', next)
    setToggling(null)
  }

  async function toggleAutoAds() {
    if (!settings) return
    setToggling('ads')
    const next = !settings.auto_ads_enabled
    setSettings({ ...settings, auto_ads_enabled: next })
    await patch('auto_ads_enabled', next)
    setToggling(null)
  }

  async function setCadence(kind: 'post' | 'ads', hours: number) {
    if (!settings) return
    setSettings({
      ...settings,
      [kind === 'post' ? 'auto_post_cadence_hours' : 'auto_ads_cadence_hours']: hours,
    })
    await patch(kind === 'post' ? 'auto_post_cadence_hours' : 'auto_ads_cadence_hours', hours)
  }

  // Same double-click hazard as the Approvals Generate button — a ref closes
  // the window a state-only guard leaves open between rapid clicks.
  const runningRef = useRef(false)

  async function runNow(kind: 'post' | 'ads') {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(kind)
    setRunResult(null)
    try {
      const res = await fetch(`/api/auto/${kind}`, { method: 'POST' })
      const data = await res.json()
      setRunResult({
        pipeline: kind,
        text: data.note ?? data.error ?? `${data.status ?? 'ran'}${data.ad_type ? ` — ${data.ad_type}` : ''}`,
      })
      await load()
    } catch {
      setRunResult({ pipeline: kind, text: 'Could not reach the server' })
    } finally {
      runningRef.current = false
      setRunning(null)
    }
  }

  if (loading || !settings) {
    return <Card><Loading /></Card>
  }

  return (
    <Card className="space-y-5" delay={0.25}>
      <div>
        <h2 className="text-white text-sm font-semibold">Auto mode</h2>
        <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">
          Fully automatic — no approval step. Posting and ads are independent switches;
          the intended path is running Auto-Post alone for a while to build organic results
          before ever turning Auto-Ads on. Both are checked once a day by a scheduled job —
          use &quot;Run now&quot; to trigger one immediately instead of waiting.
        </p>
      </div>

      {/* Auto-Post */}
      <div className="pt-1">
        <SettingRow
          title="Auto-Post"
          description="Rotates through all five product lines, one per cycle. Medicare still gets a turn but always lands in Approvals for a human to review instead of posting itself — CMS requires that regardless."
          control={
            <Toggle
              label="Auto-Post"
              checked={settings.auto_post_enabled}
              onChange={toggleAutoPost}
              disabled={toggling === 'post'}
              tone="purple"
            />
          }
        />
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5">
            {CADENCE_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                onClick={() => setCadence('post', opt.hours)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  settings.auto_post_cadence_hours === opt.hours
                    ? 'bg-purple-900 text-purple-300'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-xs">Last: {timeAgo(settings.last_auto_post_at)}</span>
            <Button onClick={() => runNow('post')} disabled={running !== null}>
              {running === 'post' ? 'Running…' : 'Run now'}
            </Button>
          </div>
        </div>
      </div>

      {/* Auto-Ads */}
      <div className="pt-3 border-t border-gray-800">
        <SettingRow
          title="Auto-Ads"
          description="Generates a paid ad, publishes it, and activates it in Meta — spends real money automatically. CMS-flagged and human-review ads are never auto-launched, no matter what this is set to."
          control={
            <Toggle
              label="Auto-Ads"
              checked={settings.auto_ads_enabled}
              onChange={toggleAutoAds}
              disabled={toggling === 'ads'}
            />
          }
        />
        {settings.auto_ads_enabled && (
          <p className="text-yellow-300 text-xs bg-yellow-950/40 border border-yellow-900/60 rounded-lg px-3 py-2 mt-2 leading-relaxed">
            Auto-Ads is live. Campaigns will launch and start spending against the monthly cap
            without anyone reviewing them first.
          </p>
        )}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5">
            {CADENCE_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                onClick={() => setCadence('ads', opt.hours)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  settings.auto_ads_cadence_hours === opt.hours
                    ? 'bg-blue-900 text-blue-300'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-xs">Last: {timeAgo(settings.last_auto_ads_at)}</span>
            <Button onClick={() => runNow('ads')} disabled={running !== null} variant="primary">
              {running === 'ads' ? 'Running…' : 'Run now'}
            </Button>
          </div>
        </div>
      </div>

      {runResult && (
        <p className="text-xs text-gray-400 bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2 leading-relaxed">
          <span className="text-gray-300 font-medium capitalize">{runResult.pipeline}:</span> {runResult.text}
        </p>
      )}

      {/* Recent activity */}
      {log.length > 0 && (
        <div className="pt-3 border-t border-gray-800">
          <p className="text-gray-400 text-xs font-medium mb-2">Recent auto activity</p>
          <ul className="space-y-1.5">
            {log.map(entry => (
              <li key={entry.id} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge tone={STATUS_TONE[entry.status] ?? 'neutral'}>{entry.status.replace(/_/g, ' ')}</Badge>
                  <span className="text-gray-500 uppercase text-[10px] tracking-wide">{entry.kind}</span>
                  <span className="text-gray-300 truncate">{entry.ad_type}</span>
                </div>
                <span className="text-gray-600 flex-shrink-0">
                  {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
