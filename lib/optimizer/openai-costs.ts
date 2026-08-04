// Real, ground-truth OpenAI spend via the Costs API — a separate surface
// from spending_log. spending_log is an estimate computed at generation time
// from each response's own token usage, and stays the source of truth for
// real-time budget-cap enforcement (the Costs API has a reporting lag of
// hours, so it can't gate a request that's happening right now). This is
// for showing what was actually billed, which the estimate can drift from —
// stale rows logged before lib/optimizer/openai-pricing.ts existed used a
// flat per-generation guess that undercounted real cost by roughly 3.5x.
//
// Requires OPENAI_ADMIN_KEY — a distinct credential from OPENAI_API_KEY,
// created at platform.openai.com/settings/organization/admin-keys. The
// regular project API key used for generation cannot call this endpoint.

const COSTS_URL = 'https://api.openai.com/v1/organization/costs'

export interface DailyCost {
  date: string
  amountUsd: number
}

export interface RealCostsResult {
  daily: DailyCost[]
  totalUsd: number
}

/**
 * Real daily spend since `since`, summed across every cost bucket OpenAI
 * returns for the period (this org has a single default project, so there's
 * no need to filter by project/line-item — every dollar billed here is this
 * app's ad-generation activity).
 */
export async function fetchRealOpenAICosts(since: Date): Promise<RealCostsResult> {
  const adminKey = process.env.OPENAI_ADMIN_KEY
  if (!adminKey) throw new Error('OPENAI_ADMIN_KEY not configured')

  const startTime = Math.floor(since.getTime() / 1000)
  const daily: DailyCost[] = []
  let nextPage: string | null = null

  do {
    const url = new URL(COSTS_URL)
    url.searchParams.set('start_time', String(startTime))
    url.searchParams.set('bucket_width', '1d')
    url.searchParams.set('limit', '31')
    if (nextPage) url.searchParams.set('page', nextPage)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${adminKey}` },
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error?.message ?? `OpenAI Costs API error (HTTP ${res.status})`)
    }

    for (const bucket of json.data ?? []) {
      const dayTotal = (bucket.results ?? []).reduce(
        (sum: number, r: { amount?: { value?: string | number } }) =>
          sum + Number(r.amount?.value ?? 0),
        0
      )
      daily.push({
        date: (bucket.start_time_iso as string ?? '').slice(0, 10),
        amountUsd: Number(dayTotal.toFixed(4)),
      })
    }

    nextPage = json.has_more ? json.next_page : null
  } while (nextPage)

  const totalUsd = Number(daily.reduce((s, d) => s + d.amountUsd, 0).toFixed(4))
  return { daily, totalUsd }
}
