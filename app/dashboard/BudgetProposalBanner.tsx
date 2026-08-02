'use client'
import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Badge, Button, ErrorNote } from './ui'

// The optimizer stages budget changes here rather than executing them.
// Nothing in this banner touches Meta until someone clicks Approve — same
// guardrail as publishing ads PAUSED and letting a human resume them.

interface Proposal {
  id: string
  meta_campaign_id: string
  ad_type: string | null
  direction: 'increase' | 'decrease'
  current_budget_cents: number
  proposed_budget_cents: number
  change_percent: number
  reason: string
  ai_score: number | null
  cost_per_lead: number | null
  cpl_target: number | null
  created_at: string
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function BudgetProposalBanner() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Fetch is expressed as a promise chain inside the effect so no state is set
  // during the effect's synchronous pass — that would cascade renders.
  useEffect(() => {
    let cancelled = false
    fetch('/api/budget-proposals?status=pending')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && Array.isArray(data)) setProposals(data)
      })
      .catch(() => {
        // Banner is supplementary — a failed poll shouldn't surface an error.
      })
    return () => { cancelled = true }
  }, [])

  async function approve(id: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/budget-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not apply the budget change.')
      } else {
        setProposals(p => p.filter(x => x.id !== id))
      }
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(null)
  }

  async function dismiss(id: string) {
    setBusy(id)
    setError(null)
    try {
      await fetch('/api/budget-proposals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setProposals(p => p.filter(x => x.id !== id))
    } catch {
      setError('Could not reach the server.')
    }
    setBusy(null)
  }

  if (proposals.length === 0) return null

  const increases = proposals.filter(p => p.direction === 'increase').length
  const decreases = proposals.length - increases

  return (
    <div className="border-b border-gray-800 bg-gray-900/60">
      <div className="px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <p className="text-sm text-white truncate">
            <span className="font-semibold">
              {proposals.length} budget change{proposals.length === 1 ? '' : 's'} waiting for approval
            </span>
            <span className="text-gray-400 ml-2 text-xs">
              {increases > 0 && `${increases} increase${increases === 1 ? '' : 's'}`}
              {increases > 0 && decreases > 0 && ' · '}
              {decreases > 0 && `${decreases} decrease${decreases === 1 ? '' : 's'}`}
              {' · no money moves until you approve'}
            </span>
          </p>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-8 pb-4 space-y-2">
              {error && <ErrorNote>{error}</ErrorNote>}

              {proposals.map((p, i) => {
                const up = p.direction === 'increase'
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04, ease: 'easeOut' }}
                    className={`rounded-xl border p-4 ${
                      up ? 'border-green-900/60 bg-green-950/20' : 'border-yellow-900/60 bg-yellow-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Badge tone={up ? 'green' : 'amber'}>
                            {up ? 'Increase budget' : 'Reduce budget'}
                          </Badge>
                          {p.ad_type && (
                            <span className="text-xs text-blue-400">{p.ad_type}</span>
                          )}
                          {p.ai_score != null && (
                            <span className="text-xs text-gray-500">Score {p.ai_score}/100</span>
                          )}
                        </div>

                        <p className="text-white text-sm font-medium mb-1 tabular-nums">
                          {dollars(p.current_budget_cents)}/day
                          <span className="text-gray-500 mx-1.5" aria-hidden>→</span>
                          <span className="sr-only">changing to </span>
                          {dollars(p.proposed_budget_cents)}/day
                          <span className={`ml-2 text-xs ${up ? 'text-green-400' : 'text-yellow-400'}`}>
                            {up ? '+' : ''}{Number(p.change_percent).toFixed(0)}%
                          </span>
                        </p>

                        <p className="text-gray-400 text-xs leading-relaxed">{p.reason}</p>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button onClick={() => dismiss(p.id)} disabled={busy === p.id}>
                          Dismiss
                        </Button>
                        <Button
                          onClick={() => approve(p.id)}
                          disabled={busy === p.id}
                          variant={up ? 'success' : 'primary'}
                        >
                          {busy === p.id ? 'Applying…' : 'Approve'}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
