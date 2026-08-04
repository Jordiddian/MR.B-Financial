import { createClient } from '@supabase/supabase-js'
import SyncButton from './SyncButton'
import { CPL_TARGETS, AD_TYPES } from '@/lib/optimizer/config'
import {
  Page, PageHeader, Card, Table, Row, Cell, ScoreText, money, cplTone, Badge,
} from '../ui'

// Service-role client, not the cookie-bound anon client — ad_performance has
// RLS enabled with no policy for the authenticated role, so the anon client
// silently returned zero rows here regardless of real data (see
// dashboard/page.tsx for the full explanation).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface PerfRow {
  ad_type: string
  impressions: number
  clicks: number
  spend: number
  leads: number
  cost_per_lead: number | null
  ai_score: number | null
  recorded_at: string
}

const CPL_TEXT: Record<string, string> = {
  green: 'text-green-400',
  amber: 'text-yellow-400',
  red: 'text-red-400',
  neutral: 'text-gray-500',
}

export default async function PerformancePage() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Snapshots are append-only; take the most recent snapshot per ad type this month.
  const { data } = await supabase
    .from('ad_performance')
    .select('ad_type, impressions, clicks, spend, leads, cost_per_lead, ai_score, recorded_at')
    .gte('recorded_at', startOfMonth)
    .order('recorded_at', { ascending: false })

  const latest: Record<string, PerfRow> = {}
  for (const row of (data ?? []) as PerfRow[]) {
    if (!latest[row.ad_type]) latest[row.ad_type] = row
  }

  const hasData = Object.keys(latest).length > 0
  const lastSync = hasData
    ? Object.values(latest).reduce(
        (max, r) => (r.recorded_at > max ? r.recorded_at : max),
        Object.values(latest)[0].recorded_at
      )
    : null

  return (
    <Page>
      <PageHeader
        title="Performance"
        subtitle={
          lastSync
            ? `Last synced ${new Date(lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
            : 'How each product line is performing this month'
        }
        actions={<SyncButton />}
      />

      <Card padded={false}>
        <Table
          columns={[
            { label: 'Ad type' },
            { label: 'Impressions', align: 'right' },
            { label: 'Clicks', align: 'right' },
            { label: 'CTR', align: 'right' },
            { label: 'Spend', align: 'right' },
            { label: 'Leads', align: 'right' },
            { label: 'Cost / lead', align: 'right' },
            { label: 'AI score', align: 'right' },
          ]}
        >
          {AD_TYPES.map(type => {
            const row = latest[type]
            const target = CPL_TARGETS[type] ?? null
            const cpl = row?.cost_per_lead ?? (row && row.leads > 0 ? row.spend / row.leads : null)
            const ctr = row && row.impressions > 0 ? (row.clicks / row.impressions) * 100 : null
            const tone = cplTone(cpl == null ? null : Number(cpl), target)

            return (
              <Row key={type}>
                <Cell strong nowrap>
                  {type}
                  {target != null && (
                    <span className="text-gray-600 text-xs ml-2 font-normal">target {money(target)}</span>
                  )}
                </Cell>
                <Cell align="right">{row ? row.impressions.toLocaleString() : '—'}</Cell>
                <Cell align="right">{row ? row.clicks.toLocaleString() : '—'}</Cell>
                <Cell align="right" muted={!ctr}>
                  {ctr != null ? `${ctr.toFixed(2)}%` : '—'}
                </Cell>
                <Cell align="right">{row ? money(row.spend) : '—'}</Cell>
                <Cell align="right">{row ? row.leads : '—'}</Cell>
                <Cell align="right">
                  <span className={`font-medium ${CPL_TEXT[tone]}`}>{money(cpl)}</span>
                </Cell>
                <Cell align="right">
                  <ScoreText score={row?.ai_score} />
                </Cell>
              </Row>
            )
          })}
        </Table>
      </Card>

      {!hasData && (
        <div className="mt-4 flex items-start gap-2">
          <Badge tone="neutral">No data</Badge>
          <p className="text-gray-500 text-xs leading-relaxed max-w-xl">
            Meta only returns figures once campaigns are actually running. Hit &quot;Sync now&quot; to
            pull the latest — the daily cron does this automatically at 8am PT.
          </p>
        </div>
      )}
    </Page>
  )
}
