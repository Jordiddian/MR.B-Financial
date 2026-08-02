'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  Page, PageHeader, Card, CardHeader, SectionTitle, Button, Badge,
  EmptyState, Loading, money,
} from '../ui'

// Albert's mechanism made visible: which creative axes are under test, how
// each arm is doing, and what won. Concluding an experiment pins its winner,
// which every subsequent generation then uses by default.

interface VariantResult {
  impressions: number
  clicks: number
  leads: number
  spend: number
  cpl: number | null
  score: number | null
  n: number
}

interface Experiment {
  id: string
  experiment_key: string
  ad_type: string
  dimension: string
  variants: string[]
  status: string
  winner: string | null
  conclusion_notes: string | null
  results: Record<string, VariantResult>
  created_at: string
}

const DIMENSION_LABEL: Record<string, string> = {
  image_style: 'Image style',
  headline_style: 'Headline style',
  audience_type: 'Audience type',
  cta: 'Call to action',
}

const STATUS_TONE: Record<string, 'blue' | 'green' | 'neutral'> = {
  running: 'blue',
  concluded: 'green',
  abandoned: 'neutral',
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() =>
    fetch('/api/experiments')
      .then(r => r.json())
      .then(data => {
        setExperiments(Array.isArray(data) ? data : [])
        setLoading(false)
      }), [])

  // State only ever set from the promise callback — see campaigns/page.tsx.
  useEffect(() => { void load() }, [load])

  async function seed() {
    setBusy('seed')
    await fetch('/api/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed' }),
    })
    await load()
    setBusy(null)
  }

  async function rollup() {
    setBusy('rollup')
    await fetch('/api/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rollup' }),
    })
    await load()
    setBusy(null)
  }

  async function pinWinner(id: string, winner: string) {
    setBusy(id)
    await fetch('/api/experiments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, winner }),
    })
    await load()
    setBusy(null)
  }

  if (loading) return <Page><Loading /></Page>

  const running = experiments.filter(e => e.status === 'running')
  const concluded = experiments.filter(e => e.status === 'concluded')

  return (
    <Page>
      <PageHeader
        title="Experiments"
        subtitle="Each experiment splits new ads evenly across variants, then calls the winner on cost per lead"
        actions={
          <>
            <Button onClick={rollup} disabled={busy !== null} size="md">
              {busy === 'rollup' ? 'Refreshing…' : 'Refresh results'}
            </Button>
            <Button onClick={seed} disabled={busy !== null} variant="primary" size="md">
              {busy === 'seed' ? 'Starting…' : 'Start baseline tests'}
            </Button>
          </>
        }
      />

      {experiments.length === 0 && (
        <Card padded={false}>
          <EmptyState
            title="No experiments running yet"
            hint='Click "Start baseline tests" to begin testing image style across every product line. New ads get split evenly across variants automatically, and a winner is called once one arm is 15% cheaper per lead.'
          />
        </Card>
      )}

      {running.length > 0 && (
        <>
          <SectionTitle count={running.length}>Running</SectionTitle>
          <div className="space-y-3 mb-8">
            {running.map((exp, i) => {
              const arms = exp.variants ?? []
              const withLeads = arms
                .map(v => ({ variant: v, r: exp.results?.[v] }))
                .filter(a => a.r && a.r.leads > 0)
              const best = withLeads
                .filter(a => a.r!.cpl != null)
                .sort((a, b) => (a.r!.cpl as number) - (b.r!.cpl as number))[0]

              return (
                <motion.div
                  key={exp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-5"
                >
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-white text-sm font-medium">{exp.ad_type}</span>
                    <span className="text-gray-500 text-xs">·</span>
                    <span className="text-gray-400 text-xs">
                      {DIMENSION_LABEL[exp.dimension] ?? exp.dimension}
                    </span>
                    <Badge tone={STATUS_TONE[exp.status] ?? 'neutral'}>{exp.status}</Badge>
                  </div>

                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(arms.length, 1)}, minmax(0, 1fr))` }}>
                    {arms.map(variant => {
                      const r = exp.results?.[variant]
                      const isBest = best?.variant === variant
                      return (
                        <div
                          key={variant}
                          className={`rounded-lg border p-3 ${
                            isBest ? 'border-green-800 bg-green-950/20' : 'border-gray-800 bg-gray-950/40'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-gray-300 text-xs font-medium capitalize">
                              {variant.replace(/_/g, ' ')}
                            </p>
                            {isBest && (
                              <span className="text-green-400 text-xs">leading</span>
                            )}
                          </div>
                          {r ? (
                            <div className="space-y-0.5">
                              <p className="text-white text-lg font-semibold leading-tight">
                                {money(r.cpl)}
                              </p>
                              <p className="text-gray-500 text-xs">
                                {r.leads} lead{r.leads === 1 ? '' : 's'} · {money(r.spend)} spent
                              </p>
                              {r.score != null && (
                                <p className="text-gray-500 text-xs">
                                  Score {Math.round(r.score)}/100
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-gray-600 text-xs">No data yet</p>
                          )}
                          {r && r.leads > 0 && (
                            <div className="mt-2">
                              <Button
                                onClick={() => pinWinner(exp.id, variant)}
                                disabled={busy === exp.id}
                                title="Lock this variant in for all future generation"
                              >
                                Pin as winner
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {withLeads.length < 2 && (
                    <p className="text-gray-600 text-xs mt-3">
                      Needs at least 10 leads per variant before a winner can be called automatically.
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        </>
      )}

      {concluded.length > 0 && (
        <>
          <SectionTitle count={concluded.length}>Concluded</SectionTitle>
          <Card padded={false}>
            <CardHeader title="Winners" hint="— pinned into every future generation for that product" />
            <ul className="divide-y divide-gray-800">
              {concluded.map(exp => (
                <li key={exp.id} className="px-5 py-4 hover:bg-gray-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-white text-sm font-medium">{exp.ad_type}</span>
                        <span className="text-gray-400 text-xs">
                          {DIMENSION_LABEL[exp.dimension] ?? exp.dimension}
                        </span>
                      </div>
                      {exp.conclusion_notes && (
                        <p className="text-gray-400 text-xs leading-relaxed">{exp.conclusion_notes}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 capitalize">
                      <Badge tone="green">{exp.winner?.replace(/_/g, ' ')}</Badge>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Page>
  )
}
