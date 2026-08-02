// Budget planning for Meta ad sets.
//
// Meta enforces a $1.00/day minimum daily budget. The previous logic did:
//
//   dailyBudget = Math.max(remaining / daysLeft, 100)
//
// which silently overspends whenever the monthly cap divided by the days left
// is under $1. A $20 cap with 30 days left computes $0.66, floors to $1.00,
// and then runs for 30 days — $30 spent against a $20 cap.
//
// The fix is to stop trying to smear a small budget across a whole month.
// Below the floor we run a BURST instead: a viable daily rate for only as many
// days as the cap actually affords, with a hard end date on the ad set so it
// cannot overrun. Concentrated delivery also exits Meta's learning phase
// faster than a trickle that never accumulates enough events.

/** Meta's hard floor for a daily ad set budget. */
export const META_MIN_DAILY_CENTS = 100

/** Meta's learning phase is measured over ~7 days; a burst should cover one. */
export const PREFERRED_BURST_DAYS = 7

/**
 * Below this monthly spend, insurance lead-gen on Meta doesn't produce enough
 * conversion volume for the optimizer (or Meta's own delivery) to learn from.
 * We still run — it's the client's money — but we say so plainly.
 */
export const MEANINGFUL_MONTHLY_CENTS = 15_000

export type BudgetStrategy = 'continuous' | 'burst' | 'insufficient'

export interface BudgetPlan {
  strategy: BudgetStrategy
  /** Whether an ad set can be created at all. */
  viable: boolean
  dailyBudgetCents: number
  /** Days the campaign may run before the cap is exhausted. */
  runDays: number
  /** Hard stop, as a unix timestamp in seconds — set as the ad set end_time. */
  endTimeUnix: number | null
  totalPlannedCents: number
  remainingCents: number
  /** Plain-language explanation, surfaced in the portal. */
  note: string
}

function daysLeftInMonth(now: Date): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.max(1, lastDay - now.getDate() + 1)
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Plan an ad set budget that provably cannot exceed what's left of the monthly
 * cap. Never returns a plan whose dailyBudget × runDays exceeds `remaining`.
 */
export function planBudget(params: {
  monthlyCapCents: number
  spentCents: number
  now?: Date
}): BudgetPlan {
  const { monthlyCapCents, spentCents } = params
  const now = params.now ?? new Date()

  const remainingCents = monthlyCapCents - spentCents
  const daysLeft = daysLeftInMonth(now)

  // Already at or over the cap — publishing anything would overspend.
  if (remainingCents < META_MIN_DAILY_CENTS) {
    return {
      strategy: 'insufficient',
      viable: false,
      dailyBudgetCents: 0,
      runDays: 0,
      endTimeUnix: null,
      totalPlannedCents: 0,
      remainingCents,
      note: remainingCents <= 0
        ? `The ${money(monthlyCapCents)} monthly cap is already spent (${money(spentCents)}). Nothing can launch until next month or the cap is raised.`
        : `Only ${money(remainingCents)} left this month, below Meta's ${money(META_MIN_DAILY_CENTS)}/day minimum. Raise the cap to launch.`,
    }
  }

  const naiveDailyCents = Math.floor(remainingCents / daysLeft)

  // Enough headroom to run every remaining day at or above Meta's floor.
  if (naiveDailyCents >= META_MIN_DAILY_CENTS) {
    const total = naiveDailyCents * daysLeft
    return {
      strategy: 'continuous',
      viable: true,
      dailyBudgetCents: naiveDailyCents,
      runDays: daysLeft,
      endTimeUnix: endOfMonthUnix(now),
      totalPlannedCents: total,
      remainingCents,
      note: `${money(naiveDailyCents)}/day for the remaining ${daysLeft} day${daysLeft === 1 ? '' : 's'} of the month (${money(total)} of ${money(remainingCents)} available).`,
    }
  }

  // Below the floor — burst instead of trickling. Spend at a rate that can
  // actually deliver, for only as many days as the cap covers.
  const burstDailyCents = Math.max(
    META_MIN_DAILY_CENTS,
    Math.floor(remainingCents / PREFERRED_BURST_DAYS)
  )
  const runDays = Math.floor(remainingCents / burstDailyCents)

  if (runDays < 1) {
    return {
      strategy: 'insufficient',
      viable: false,
      dailyBudgetCents: 0,
      runDays: 0,
      endTimeUnix: null,
      totalPlannedCents: 0,
      remainingCents,
      note: `${money(remainingCents)} left is under one day at Meta's ${money(META_MIN_DAILY_CENTS)} minimum.`,
    }
  }

  const total = burstDailyCents * runDays
  return {
    strategy: 'burst',
    viable: true,
    dailyBudgetCents: burstDailyCents,
    runDays,
    endTimeUnix: Math.floor(now.getTime() / 1000) + runDays * 86_400,
    totalPlannedCents: total,
    remainingCents,
    note:
      `${money(remainingCents)} across ${daysLeft} days works out to ${money(naiveDailyCents)}/day, ` +
      `under Meta's ${money(META_MIN_DAILY_CENTS)} minimum. Running a concentrated burst instead: ` +
      `${money(burstDailyCents)}/day for ${runDays} day${runDays === 1 ? '' : 's'} (${money(total)}), ` +
      `then it stops automatically. Concentrated delivery also reaches Meta's learning threshold faster than a trickle.`,
  }
}

function endOfMonthUnix(now: Date): number {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.floor(end.getTime() / 1000)
}

/** Whether a monthly cap is large enough for insurance lead-gen to be measurable. */
export function isMeaningfulBudget(monthlyCapCents: number): boolean {
  return monthlyCapCents >= MEANINGFUL_MONTHLY_CENTS
}
