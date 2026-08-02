'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  Page, PageHeader, Card, CardHeader, SectionTitle, Button, Badge, EmptyState,
  Loading, Table, Row, Cell, ScoreText, money, cplTone, type Tone,
} from '../ui'

interface Campaign {
  id: string
  meta_campaign_id: string
  meta_adset_id: string | null
  ad_type: string
  campaign_name: string
  objective: string | null
  audience_type: string | null
  image_style: string | null
  daily_budget_cents: number | null
  status: string
  days_running: number
  started_at: string | null
  total_spend: number
  total_leads: number
  avg_cpl: number | null
  avg_ctr: number | null
  latest_score: number | null
  latest_recommendation: string | null
  in_learning_phase: boolean
  is_template: boolean
  template_notes: string | null
  last_synced_at: string | null
  created_at: string
}

interface PendingAction {
  id: string
  meta_campaign_id: string
  ad_type: string | null
  action: string
  reason: string | null
  urgency: string
  learning_phase_active: boolean
  params: Record<string, unknown> | null
  created_at: string
}

interface RecentAction {
  id: string
  action: string
  ad_type: string | null
  reason: string | null
  status: string
  executed_at: string | null
  executed_by: string | null
}

const URGENCY_ORDER: Record<string, number> = { immediate: 0, next_cycle: 1, when_convenient: 2 }

const ACTION_LABELS: Record<string, { label: string; tone: Tone; meta: string }> = {
  pause:            { label: 'Pause',            tone: 'red',    meta: 'Stops the campaign in Meta immediately' },
  scale_budget:     { label: 'Scale budget',     tone: 'green',  meta: 'Increases daily budget by 20–25% in Meta' },
  refresh_creative: { label: 'Refresh creative', tone: 'amber',  meta: 'Manual: generate a new ad, publish with the same structure' },
  duplicate:        { label: 'Duplicate',        tone: 'blue',   meta: 'Manual: copy the structure with new creative' },
  mark_template:    { label: 'Save as template', tone: 'purple', meta: 'Records this structure for future reuse' },
}

const REC_TONE: Record<string, Tone> = {
  scale: 'green',
  maintain: 'neutral',
  refresh: 'amber',
  duplicate: 'blue',
  pause: 'red',
}

/** Derived from started_at — the stored days_running column has been unreliable. */
function daysRunning(c: Campaign): number {
  if (c.started_at) {
    return Math.max(0, Math.floor((Date.now() - new Date(c.started_at).getTime()) / 86_400_000))
  }
  return c.days_running ?? 0
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [pending, setPending] = useState<PendingAction[]>([])
  const [recent, setRecent] = useState<RecentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState<string | null>(null)

  const load = useCallback(() =>
    Promise.all([
      fetch('/api/campaigns').then(r => r.json()),
      fetch('/api/campaigns/actions?status=pending').then(r => r.json()),
      fetch('/api/campaigns/actions?status=executed&limit=10').then(r => r.json()),
    ]).then(([c, p, r]) => {
      setCampaigns(Array.isArray(c) ? c : [])
      setPending(
        Array.isArray(p)
          ? p.sort((a: PendingAction, b: PendingAction) =>
              (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2))
          : []
      )
      setRecent(Array.isArray(r) ? r : [])
      setLoading(false)
    }), [])

  // State is only ever set from a promise callback, never during the effect's
  // synchronous pass — a sync setState there cascades renders.
  useEffect(() => { void load() }, [load])

  async function approve(id: string) {
    setExecuting(id)
    await fetch('/api/meta/restructure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_id: id }),
    })
    await load()
    setExecuting(null)
  }

  async function dismiss(id: string) {
    setExecuting(id)
    await fetch('/api/meta/restructure', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_id: id }),
    })
    await load()
    setExecuting(null)
  }

  const active = campaigns.filter(c => c.status === 'active')
  const paused = campaigns.filter(c => c.status === 'paused' || c.status === 'archived')
  const templates = campaigns.filter(c => c.is_template)

  if (loading) return <Page><Loading /></Page>

  return (
    <Page>
      <PageHeader
        title="Campaigns"
        subtitle="Structural memory, pending AI actions, and live performance"
      />

      {/* ── Pending AI actions ── */}
      {pending.length > 0 && (
        <div className="mb-8">
          <SectionTitle count={pending.length}>Pending AI actions</SectionTitle>
          <div className="space-y-3">
            {pending.map((action, i) => {
              const def = ACTION_LABELS[action.action] ?? {
                label: action.action, tone: 'neutral' as Tone, meta: '',
              }
              const isManual = action.action === 'refresh_creative' || action.action === 'duplicate'
              const urgent = action.urgency === 'immediate'

              return (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04, ease: 'easeOut' }}
                  className={`bg-gray-900 border rounded-xl p-4 ${
                    urgent ? 'border-red-800/70' : 'border-yellow-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge tone={def.tone}>{def.label}</Badge>
                        {urgent && <Badge tone="red">Immediate</Badge>}
                        {action.learning_phase_active && <Badge tone="blue">Learning phase</Badge>}
                        {action.ad_type && (
                          <span className="text-blue-400 text-xs">{action.ad_type}</span>
                        )}
                      </div>
                      <p className="text-gray-300 text-sm mb-1 leading-relaxed">{action.reason}</p>
                      <p className="text-gray-500 text-xs">{def.meta}</p>
                      {action.params?.scale_percent != null && (
                        <p className="text-green-400 text-xs mt-1">
                          Budget increase: +{String(action.params.scale_percent)}%
                        </p>
                      )}
                      {action.params?.new_creative_direction != null && (
                        <p className="text-gray-400 text-xs mt-1">
                          Creative direction: {String(action.params.new_creative_direction)}
                        </p>
                      )}
                      {isManual && (
                        <p className="text-yellow-500 text-xs mt-1.5">
                          Requires manual steps — approve to see instructions.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button onClick={() => dismiss(action.id)} disabled={executing === action.id}>
                        Dismiss
                      </Button>
                      <Button
                        onClick={() => approve(action.id)}
                        disabled={executing === action.id}
                        variant={def.tone === 'red' ? 'danger' : 'primary'}
                      >
                        {executing === action.id ? 'Running…' : isManual ? 'Show steps' : 'Execute'}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Active campaigns ── */}
      <Card padded={false} className="mb-4" delay={0.05}>
        <CardHeader
          title="Active campaigns"
          right={<span className="text-gray-500 text-xs">{active.length}</span>}
        />
        {active.length === 0 ? (
          <EmptyState
            title="No campaigns tracked yet"
            hint="Approve an ad in the Approvals tab and push it to Meta to start tracking. Campaigns publish paused — you resume them in Ads Manager."
          />
        ) : (
          <Table
            columns={[
              { label: 'Campaign' },
              { label: 'Ad type' },
              { label: 'Days', align: 'right' },
              { label: 'Spend', align: 'right' },
              { label: 'Leads', align: 'right' },
              { label: 'CPL', align: 'right' },
              { label: 'Score', align: 'right' },
              { label: 'Recommendation', align: 'right' },
            ]}
          >
            {active.map(c => (
              <Row key={c.id}>
                <Cell strong>
                  <span className="block truncate max-w-[200px]" title={c.campaign_name}>
                    {c.campaign_name || '—'}
                  </span>
                  {c.in_learning_phase && (
                    <span className="text-blue-400 text-xs font-normal">Learning phase</span>
                  )}
                </Cell>
                <Cell>{c.ad_type}</Cell>
                <Cell align="right">{daysRunning(c)}d</Cell>
                <Cell align="right">{money(c.total_spend)}</Cell>
                <Cell align="right">{c.total_leads}</Cell>
                <Cell align="right">
                  <span
                    className={
                      cplTone(c.avg_cpl, 40) === 'green' ? 'text-green-400'
                      : cplTone(c.avg_cpl, 40) === 'amber' ? 'text-yellow-400'
                      : cplTone(c.avg_cpl, 40) === 'red' ? 'text-red-400'
                      : 'text-gray-500'
                    }
                  >
                    {money(c.avg_cpl)}
                  </span>
                </Cell>
                <Cell align="right"><ScoreText score={c.latest_score} /></Cell>
                <Cell align="right">
                  {c.latest_recommendation ? (
                    <Badge tone={REC_TONE[c.latest_recommendation] ?? 'neutral'}>
                      {c.latest_recommendation}
                    </Badge>
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* ── Templates ── */}
      {templates.length > 0 && (
        <Card padded={false} className="mb-4" delay={0.1}>
          <CardHeader
            title="Winning templates"
            hint="— structures the AI reuses when building new campaigns"
          />
          <ul className="divide-y divide-gray-800">
            {templates.map(c => (
              <li key={c.id} className="px-5 py-3.5 hover:bg-gray-800/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{c.ad_type}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {c.image_style && <span className="text-gray-500 text-xs">Style: {c.image_style}</span>}
                      {c.audience_type && <span className="text-gray-500 text-xs">Audience: {c.audience_type}</span>}
                      {c.daily_budget_cents != null && (
                        <span className="text-gray-500 text-xs">
                          Budget: {money(c.daily_budget_cents / 100)}/day
                        </span>
                      )}
                    </div>
                    {c.template_notes && (
                      <p className="text-gray-500 text-xs mt-1 leading-relaxed">{c.template_notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-green-400 text-xs tabular-nums">{c.total_leads} leads</span>
                    <ScoreText score={c.latest_score} />
                    <Badge tone="purple">Template</Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Paused ── */}
      {paused.length > 0 && (
        <Card padded={false} className="mb-4" delay={0.15}>
          <CardHeader title="Paused / archived" />
          <ul className="divide-y divide-gray-800">
            {paused.map(c => (
              <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-800/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-gray-400 text-sm truncate">{c.campaign_name || c.ad_type}</p>
                  <p className="text-gray-600 text-xs">
                    {c.total_leads} leads · {money(c.avg_cpl)} CPL · Score {c.latest_score ?? '—'}
                  </p>
                </div>
                <Badge tone="neutral">{c.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Recent actions ── */}
      {recent.length > 0 && (
        <Card padded={false} delay={0.2}>
          <CardHeader title="Recent actions" />
          <ul className="divide-y divide-gray-800">
            {recent.map(r => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-800/30 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 text-sm">
                      {ACTION_LABELS[r.action]?.label ?? r.action}
                    </span>
                    {r.ad_type && <span className="text-gray-500 text-xs">{r.ad_type}</span>}
                  </div>
                  {r.reason && (
                    <p className="text-gray-500 text-xs mt-0.5 truncate max-w-xl">{r.reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-gray-500 text-xs">{r.executed_by?.split('@')[0] ?? '—'}</p>
                  <p className="text-gray-600 text-xs">
                    {r.executed_at ? new Date(r.executed_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  )
}
