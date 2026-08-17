// Shared optimizer configuration — targets and guardrails.
// These mirror the CPL targets the AI system prompt already reasons about;
// keeping one copy here means the deterministic budget math and the AI
// analysis can never drift apart.

import { META_MIN_DAILY_CENTS } from './budget'

export const CPL_TARGETS: Record<string, number> = {
  'Covered California': 30,
  'Medicare': 40,
  'Dental': 25,
  'Vision': 25,
  // Was 35 — industry benchmarks (Insurance_FB_IG_Advertising_Strategy.docx,
  // Aug 2026) report disciplined final expense campaigns landing $15–$30;
  // 35 was letting genuinely underperforming campaigns look on-target.
  'Final Expenses': 30,
}

export const AD_TYPES = Object.keys(CPL_TARGETS)

// Seasonal CPL windows — per the same benchmark doc, Medicare CPLs run
// meaningfully higher during AEP (Oct 1–Dec 7) and Covered California/ACA
// CPLs rise sharply during Open Enrollment (Nov 1–Jan 15), driven by
// platform-wide competition, not a drop in campaign quality. Without this,
// the optimizer would read a seasonally-normal CPL spike as underperformance
// and cut budget right when the enrollment window makes spend most valuable.
interface SeasonalWindow {
  adType: string
  startMonth: number // 1-12
  startDay: number
  endMonth: number
  endDay: number
  seasonalTarget: number
}

const SEASONAL_WINDOWS: SeasonalWindow[] = [
  { adType: 'Medicare', startMonth: 10, startDay: 1, endMonth: 12, endDay: 7, seasonalTarget: 70 },
  { adType: 'Covered California', startMonth: 11, startDay: 1, endMonth: 1, endDay: 15, seasonalTarget: 55 },
]

function isWithinWindow(date: Date, w: SeasonalWindow): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const asValue = (m: number, d: number) => m * 100 + d
  const value = asValue(month, day)
  const start = asValue(w.startMonth, w.startDay)
  const end = asValue(w.endMonth, w.endDay)
  // Windows that cross the calendar year boundary (e.g. Nov 1 – Jan 15)
  // need an OR check instead of a simple start <= value <= end range.
  return start <= end ? value >= start && value <= end : value >= start || value <= end
}

/** CPL target for this ad type, widened if `date` falls in a known seasonal window. */
export function seasonalCplTarget(adType: string, date: Date = new Date()): number | null {
  const base = CPL_TARGETS[adType] ?? null
  const window = SEASONAL_WINDOWS.find(w => w.adType === adType && isWithinWindow(date, w))
  if (!window) return base
  return Math.max(base ?? 0, window.seasonalTarget)
}

// Auto-ads specifically: which product lines a paid campaign may be
// auto-launched for. Medicare is excluded here because CMS rules (see the
// system prompt) require requires_human_review: true on every Medicare ad,
// and auto-ads activates campaigns immediately with real spend — there's no
// point computing "does Medicare need a campaign" when the answer can never
// be "launch it automatically." Medicare campaigns still go through the
// normal manual Approvals → Push to Meta flow.
export const AUTO_ELIGIBLE_TYPES = AD_TYPES.filter(t => t !== 'Medicare')

// Auto-post specifically: all five product lines get a turn in rotation,
// including Medicare. Unlike auto-ads, generating a Medicare post costs
// nothing risky — the auto-post route's own requires_human_review check
// (always true for Medicare, per the system prompt) catches it before
// anything publishes and drops it into Approvals instead. Excluding Medicare
// from the rotation entirely would mean it never gets a turn at all, which
// isn't what "rotate through all five" means.
export const AUTO_POST_ROTATION_TYPES = AD_TYPES

// Guardrails — deliberately conservative. Every one of these exists because
// violating it either resets Meta's learning phase or trips spend enforcement.
export const GUARDRAILS = {
  /** Meta flags sudden spend jumps. Never propose more than this in one step. */
  MAX_INCREASE_PERCENT: 25,
  /** Decreases are less risky but still shouldn't gut a campaign in one move. */
  MAX_DECREASE_PERCENT: 30,
  /** Days that must pass after a budget change before proposing another. */
  BUDGET_CHANGE_COOLDOWN_DAYS: 5,
  /** Below this, a campaign is still in learning phase — never touch it. */
  MIN_DAYS_RUNNING: 7,
  /** Learning phase also holds until this many lead events accumulate. */
  MIN_LEADS_FOR_SIGNAL: 50,
  /** Don't propose changes on campaigns that have barely spent anything. */
  MIN_SPEND_FOR_SIGNAL: 25,
  /** Meta's floor. Never propose a daily budget below this. Single source of
   *  truth lives in budget.ts so publish and the optimizer can't drift apart. */
  MIN_DAILY_BUDGET_CENTS: META_MIN_DAILY_CENTS,
  /** Score at or above this = winner, eligible for more budget. */
  SCALE_SCORE_THRESHOLD: 76,
  /** Score below this = loser, propose pulling budget back. */
  CUT_SCORE_THRESHOLD: 40,
  /** CPL multiple of target above which we cut regardless of score. */
  CPL_CUT_MULTIPLE: 2.0,
  /** Proposals older than this are stale — the data has moved on. */
  PROPOSAL_EXPIRY_HOURS: 72,
} as const

/**
 * Days a campaign has been running, derived from started_at.
 *
 * Always compute this rather than trusting the stored days_running column:
 * that column was originally declared as a STORED generated column over
 * now(), which Postgres rejects (generated expressions must be IMMUTABLE),
 * so it silently didn't exist and every read came back 0. The column now
 * exists and sync refreshes it, but started_at remains the source of truth.
 */
export function daysRunning(c: {
  started_at?: string | null
  paused_at?: string | null
  days_running?: number | null
}): number {
  if (c.started_at) {
    const end = c.paused_at ? new Date(c.paused_at).getTime() : Date.now()
    const elapsed = end - new Date(c.started_at).getTime()
    return Math.max(0, Math.floor(elapsed / 86_400_000))
  }
  return c.days_running ?? 0
}

/** Learning phase per Meta's definition: too new, or too few conversion events. */
export function isInLearningPhase(c: {
  started_at?: string | null
  paused_at?: string | null
  days_running?: number | null
  total_leads?: number | null
}): boolean {
  return (
    daysRunning(c) < GUARDRAILS.MIN_DAYS_RUNNING ||
    (c.total_leads ?? 0) < GUARDRAILS.MIN_LEADS_FOR_SIGNAL
  )
}

/** A campaign is only actionable once it's out of learning phase with real spend. */
export function hasReliableSignal(c: {
  started_at?: string | null
  paused_at?: string | null
  days_running?: number | null
  total_leads?: number | null
  total_spend?: number | null
}): boolean {
  const days = daysRunning(c)
  const leads = c.total_leads ?? 0
  const spend = Number(c.total_spend ?? 0)
  if (days < GUARDRAILS.MIN_DAYS_RUNNING) return false
  if (spend < GUARDRAILS.MIN_SPEND_FOR_SIGNAL) return false
  // Either enough leads to be statistically meaningful, or enough spend that
  // zero leads is itself a signal.
  return leads >= GUARDRAILS.MIN_LEADS_FOR_SIGNAL || spend >= GUARDRAILS.MIN_SPEND_FOR_SIGNAL * 2
}

/** True when the campaign's budget was changed too recently to touch again. */
export function inBudgetCooldown(lastChangeAt: string | null | undefined): boolean {
  if (!lastChangeAt) return false
  const elapsedDays = (Date.now() - new Date(lastChangeAt).getTime()) / 86_400_000
  return elapsedDays < GUARDRAILS.BUDGET_CHANGE_COOLDOWN_DAYS
}

/** Clamp a proposed budget to the guardrail band around the current one. */
export function clampBudget(currentCents: number, proposedCents: number): number {
  const maxUp = Math.round(currentCents * (1 + GUARDRAILS.MAX_INCREASE_PERCENT / 100))
  const maxDown = Math.round(currentCents * (1 - GUARDRAILS.MAX_DECREASE_PERCENT / 100))
  return Math.max(
    GUARDRAILS.MIN_DAILY_BUDGET_CENTS,
    Math.min(maxUp, Math.max(maxDown, proposedCents))
  )
}
