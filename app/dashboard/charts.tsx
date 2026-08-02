'use client'
import { Card } from './ui'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Chart primitives for the reporting dashboard. Bklit-style composition on
// Recharts, styled to the portal's existing dark palette so nothing here
// introduces a second visual system.

const AXIS = '#6b7280'
const GRID = '#1f2937'

export const SERIES = {
  spend: '#3b82f6',
  leads: '#22c55e',
  cpl: '#f59e0b',
  score: '#a855f7',
} as const

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function money(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${Number(n).toFixed(2)}`
}

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  formatter?: (value: number, key: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-gray-400 text-xs mb-1">
        {typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label) ? fmtDate(label) : label}
      </p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-gray-400">{entry.name}</span>
          <span className="text-white font-medium">
            {formatter && typeof entry.value === 'number'
              ? formatter(entry.value, String(entry.dataKey))
              : String(entry.value)}
          </span>
        </p>
      ))}
    </div>
  )
}

export function ChartCard({
  title,
  subtitle,
  children,
  delay = 0,
  empty,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  delay?: number
  empty?: boolean
}) {
  return (
    <Card delay={delay}>
      <div className="mb-4">
        <h3 className="text-white text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      {empty ? (
        <div className="h-[220px] flex items-center justify-center">
          <p className="text-gray-600 text-xs">No data in this range yet.</p>
        </div>
      ) : (
        <div className="h-[220px]">{children}</div>
      )}
    </Card>
  )
}

export function StatCard({
  label,
  value,
  hint,
  accent,
  delay = 0,
}: {
  label: string
  value: string
  hint?: string
  accent?: 'green' | 'amber' | 'red' | 'blue'
  delay?: number
}) {
  const accentClass =
    accent === 'green' ? 'text-green-400'
    : accent === 'amber' ? 'text-yellow-400'
    : accent === 'red' ? 'text-red-400'
    : accent === 'blue' ? 'text-blue-400'
    : 'text-white'

  return (
    <Card delay={delay}>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-semibold tabular-nums tracking-tight ${accentClass}`}>{value}</p>
      {hint && <p className="text-gray-500 text-xs mt-1 leading-relaxed">{hint}</p>}
    </Card>
  )
}

export function SpendLeadsChart({
  data,
}: {
  data: { date: string; spend: number; leads: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.spend} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIES.spend} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.leads} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SERIES.leads} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          stroke={AXIS}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          content={
            <ChartTooltip
              formatter={(v, key) => (key === 'spend' ? money(v) : String(v))}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="spend"
          name="Spend"
          stroke={SERIES.spend}
          strokeWidth={2}
          fill="url(#spendFill)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="leads"
          name="Leads"
          stroke={SERIES.leads}
          strokeWidth={2}
          fill="url(#leadsFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function CplTrendChart({
  data,
  target,
}: {
  data: { date: string; cpl: number | null }[]
  target: number | null
}) {
  // Keep the target line on-chart. With an auto domain, a CPL well under
  // target pushes the reference line outside the visible range and it silently
  // disappears — losing the one comparison this chart exists to make.
  const yDomain: [number, number | 'auto'] = target != null
    ? [0, Math.max(target * 1.15, ...data.map(d => d.cpl ?? 0)) ]
    : [0, 'auto']

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          stroke={AXIS}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          domain={yDomain}
          stroke={AXIS}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip formatter={v => money(v)} />} />
        {target != null && (
          <ReferenceLine
            y={target}
            stroke={SERIES.leads}
            strokeDasharray="4 4"
            label={{
              value: `target $${target}`,
              position: 'insideTopRight',
              fill: SERIES.leads,
              fontSize: 10,
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="cpl"
          name="Cost per lead"
          stroke={SERIES.cpl}
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** CPL per product against its own target — bar colour encodes pass/fail. */
export function CplByTypeChart({
  data,
}: {
  data: { ad_type: string; cpl: number | null; target: number | null }[]
}) {
  const withData = data.filter(d => d.cpl != null)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={withData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="ad_type"
          stroke={AXIS}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis stroke={AXIS} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={v => money(v)} />} />
        <Bar dataKey="cpl" name="Cost per lead" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {withData.map((d, i) => (
            <Cell
              key={i}
              fill={
                d.target != null && d.cpl != null && d.cpl <= d.target
                  ? SERIES.leads
                  : d.target != null && d.cpl != null && d.cpl <= d.target * 2
                  ? SERIES.cpl
                  : '#ef4444'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ScoreByTypeChart({
  data,
}: {
  data: { ad_type: string; score: number | null }[]
}) {
  const withData = data.filter(d => d.score != null)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={withData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="ad_type"
          stroke={AXIS}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          domain={[0, 100]}
          stroke={AXIS}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip />} />
        <ReferenceLine y={76} stroke={SERIES.leads} strokeDasharray="4 4" />
        <Bar dataKey="score" name="AI score" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {withData.map((d, i) => (
            <Cell
              key={i}
              fill={
                (d.score ?? 0) >= 76 ? SERIES.leads
                : (d.score ?? 0) >= 40 ? SERIES.cpl
                : '#ef4444'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
