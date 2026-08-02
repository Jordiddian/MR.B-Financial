'use client'
import { motion } from 'motion/react'

// Shared primitives for the portal. Every page composes from these so spacing,
// colour, and motion stay consistent — the pages had drifted into ad-hoc
// Tailwind repeated eight different ways.
//
// Palette is the portal's existing dark scale (gray-950 page, gray-900 surface,
// gray-800 border). Semantic colour is reserved for meaning — green/amber/red
// only ever encode performance, never decoration.

/* ── Layout ─────────────────────────────────────────────── */

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="p-8 max-w-[1400px]">{children}</div>
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex items-start justify-between gap-4 mb-8"
    >
      <div className="min-w-0">
        <h1 className="text-white text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-gray-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </motion.div>
  )
}

/* ── Surfaces ───────────────────────────────────────────── */

export function Card({
  children,
  className = '',
  delay = 0,
  padded = true,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  padded?: boolean
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className={`bg-gray-900 border border-gray-800 rounded-xl ${padded ? 'p-5' : 'overflow-hidden'} ${className}`}
    >
      {children}
    </motion.section>
  )
}

export function CardHeader({
  title,
  hint,
  right,
}: {
  title: string
  hint?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800">
      <div className="min-w-0">
        <span className="text-gray-300 text-sm font-medium">{title}</span>
        {hint && <span className="text-gray-500 text-xs ml-2">{hint}</span>}
      </div>
      {right}
    </div>
  )
}

export function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-white text-sm font-semibold">{children}</h2>
      {count != null && count > 0 && (
        <span className="bg-gray-800 text-gray-300 text-xs font-medium px-2 py-0.5 rounded-full tabular-nums">
          {count}
        </span>
      )}
    </div>
  )
}

/* ── Feedback ───────────────────────────────────────────── */

export function EmptyState({
  title,
  hint,
  icon = '○',
}: {
  title: string
  hint?: string
  icon?: string
}) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="text-gray-700 text-2xl mb-2 select-none" aria-hidden>{icon}</div>
      <p className="text-gray-400 text-sm">{title}</p>
      {hint && <p className="text-gray-600 text-xs mt-1 max-w-md mx-auto leading-relaxed">{hint}</p>}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="px-5 py-12 flex items-center justify-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-pulse" />
      <span className="text-gray-500 text-sm">{label}</span>
    </div>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-red-400 text-xs bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
      {children}
    </p>
  )
}

/* ── Badges ─────────────────────────────────────────────── */

export type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'purple'

const TONE: Record<Tone, string> = {
  neutral: 'bg-gray-800 text-gray-400',
  blue: 'bg-blue-950 text-blue-300 ring-1 ring-blue-900/60',
  green: 'bg-green-950 text-green-300 ring-1 ring-green-900/60',
  amber: 'bg-yellow-950 text-yellow-300 ring-1 ring-yellow-900/60',
  red: 'bg-red-950 text-red-300 ring-1 ring-red-900/60',
  purple: 'bg-purple-950 text-purple-300 ring-1 ring-purple-900/60',
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode
  tone?: Tone
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}

/* ── Controls ───────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'success'

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white border border-transparent',
  ghost: 'bg-transparent border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500',
  danger: 'bg-red-700 hover:bg-red-600 text-white border border-transparent',
  success: 'bg-green-700 hover:bg-green-600 text-white border border-transparent',
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  size = 'sm',
  type = 'button',
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  disabled?: boolean
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  title?: string
}) {
  const sizing = size === 'md' ? 'text-sm px-4 py-2' : 'text-xs px-3 py-1.5'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${sizing} ${BUTTON[variant]} rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950`}
    >
      {children}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled,
  tone = 'blue',
  label,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  tone?: 'blue' | 'purple'
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${
        checked ? (tone === 'purple' ? 'bg-purple-600' : 'bg-blue-600') : 'bg-gray-700'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={`w-5 h-5 bg-white rounded-full shadow-sm ${checked ? 'ml-auto' : ''}`}
      />
    </button>
  )
}

/** Label + description + control, the row used across Settings and Approvals. */
export function SettingRow({
  title,
  description,
  control,
}: {
  title: string
  description?: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-white text-sm font-medium">{title}</p>
        {description && <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {control}
    </div>
  )
}

/* ── Tables ─────────────────────────────────────────────── */

export function Table({
  columns,
  children,
}: {
  columns: { label: string; align?: 'left' | 'right' }[]
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {columns.map(c => (
              <th
                key={c.label}
                className={`${c.align === 'right' ? 'text-right' : 'text-left'} text-gray-500 text-xs font-medium uppercase tracking-wide px-5 py-3 whitespace-nowrap`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">{children}</tbody>
      </table>
    </div>
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return <tr className="hover:bg-gray-800/40 transition-colors">{children}</tr>
}

export function Cell({
  children,
  align = 'left',
  strong,
  muted,
  nowrap,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  strong?: boolean
  muted?: boolean
  nowrap?: boolean
}) {
  const color = strong ? 'text-white font-medium' : muted ? 'text-gray-500' : 'text-gray-300'
  return (
    <td
      className={`px-5 py-3 ${align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${color} ${nowrap ? 'whitespace-nowrap' : ''}`}
    >
      {children}
    </td>
  )
}

/* ── Shared formatting + semantics ──────────────────────── */

export function money(n: number | string | null | undefined, dash = '—') {
  if (n == null) return dash
  const v = Number(n)
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : dash
}

/** Score colour thresholds, matched to the optimizer's scale/cut bands. */
export function scoreTone(score: number | null | undefined): Tone {
  if (score == null) return 'neutral'
  if (score >= 76) return 'green'
  if (score >= 40) return 'amber'
  return 'red'
}

/** CPL colour against its own product target. */
export function cplTone(cpl: number | null | undefined, target: number | null | undefined): Tone {
  if (cpl == null || target == null) return 'neutral'
  if (cpl <= target) return 'green'
  if (cpl <= target * 2) return 'amber'
  return 'red'
}

export function ScoreText({ score }: { score: number | null | undefined }) {
  const tone = scoreTone(score)
  const color =
    tone === 'green' ? 'text-green-400'
    : tone === 'amber' ? 'text-yellow-400'
    : tone === 'red' ? 'text-red-400'
    : 'text-gray-500'
  return <span className={`font-semibold tabular-nums ${color}`}>{score ?? '—'}</span>
}
