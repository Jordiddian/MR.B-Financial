'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  Page, PageHeader, Card, CardHeader, SectionTitle, Badge, EmptyState, Loading,
} from '../ui'

// Results for the organic posting phase — reach and engagement, since that's
// what "results" means before any paid spend starts. Distinct from the paid
// Performance page, which tracks spend/leads/CPL.

interface PlatformStat {
  recorded_at: string
  impressions: number
  engaged_users: number
  clicks: number
  reactions: number
  comments: number
  shares: number | null
}

interface Post {
  id: string
  ad_type: string
  headline: string
  body_copy: string
  image_url: string | null
  status: string
  generated_by: string | null
  meta_post_id: string | null
  meta_ig_media_id: string | null
  created_at: string
  facebook: PlatformStat | null
  instagram: PlatformStat | null
}

interface LogEntry {
  id: string
  kind: string
  ad_type: string
  status: string
  reason: string | null
  created_at: string
}

const STATUS_TONE: Record<string, 'green' | 'blue' | 'amber' | 'red' | 'neutral'> = {
  published: 'green',
  held_for_review: 'amber',
  skipped: 'neutral',
  failed: 'red',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() =>
    Promise.all([
      fetch('/api/posts').then(r => r.json()),
      fetch('/api/auto/log?kind=post&limit=15').then(r => r.json()),
    ]).then(([p, l]) => {
      setPosts(Array.isArray(p) ? p : [])
      setLog(Array.isArray(l) ? l : [])
      setLoading(false)
    }), [])

  useEffect(() => { void load() }, [load])

  if (loading) return <Page><Loading /></Page>

  const live = posts.filter(p => p.status === 'live')
  const totals = live.reduce(
    (acc, p) => {
      const fb = p.facebook
      const ig = p.instagram
      acc.impressions += (fb?.impressions ?? 0) + (ig?.impressions ?? 0)
      acc.engaged += (fb?.engaged_users ?? 0) + (ig?.engaged_users ?? 0)
      acc.reactions += (fb?.reactions ?? 0) + (ig?.reactions ?? 0)
      acc.comments += (fb?.comments ?? 0) + (ig?.comments ?? 0)
      return acc
    },
    { impressions: 0, engaged: 0, reactions: 0, comments: 0 }
  )

  return (
    <Page>
      <PageHeader
        title="Posts"
        subtitle="Organic reach and engagement — this is the phase before any paid spend starts"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card delay={0}>
          <p className="text-gray-400 text-sm mb-1">Posts live</p>
          <p className="text-white text-3xl font-semibold tabular-nums">{live.length}</p>
          <p className="text-gray-500 text-xs mt-1">of {posts.length} generated</p>
        </Card>
        <Card delay={0.05}>
          <p className="text-gray-400 text-sm mb-1">Impressions</p>
          <p className="text-white text-3xl font-semibold tabular-nums">{totals.impressions.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-1">across Facebook + Instagram</p>
        </Card>
        <Card delay={0.1}>
          <p className="text-gray-400 text-sm mb-1">Engaged users</p>
          <p className="text-green-400 text-3xl font-semibold tabular-nums">{totals.engaged.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-1">clicked, reacted, or commented</p>
        </Card>
        <Card delay={0.15}>
          <p className="text-gray-400 text-sm mb-1">Reactions + comments</p>
          <p className="text-white text-3xl font-semibold tabular-nums">
            {(totals.reactions + totals.comments).toLocaleString()}
          </p>
          <p className="text-gray-500 text-xs mt-1">{totals.reactions} reactions · {totals.comments} comments</p>
        </Card>
      </div>

      <Card padded={false} className="mb-4" delay={0.2}>
        <CardHeader title="Published posts" />
        {live.length === 0 ? (
          <EmptyState
            title="No posts published yet"
            hint="Turn on Auto-Post in Settings, or generate one manually in Approvals, to start building organic results."
          />
        ) : (
          <ul className="divide-y divide-gray-800">
            {live.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="px-5 py-4"
              >
                <div className="flex items-start gap-4">
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={`Post for ${p.ad_type}`}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-gray-800"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-blue-400 text-xs font-medium">{p.ad_type}</span>
                      {p.generated_by === 'auto_post' && <Badge tone="purple">Auto-posted</Badge>}
                      <span className="text-gray-600 text-xs">{fmtDate(p.created_at)}</span>
                    </div>
                    <p className="text-white text-sm font-medium mb-2 truncate">{p.headline}</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                      {p.facebook && (
                        <span>
                          FB — {p.facebook.impressions.toLocaleString()} impr ·{' '}
                          {p.facebook.engaged_users} engaged · {p.facebook.reactions} reactions ·{' '}
                          {p.facebook.comments} comments
                        </span>
                      )}
                      {p.instagram && (
                        <span>
                          IG — {p.instagram.impressions.toLocaleString()} impr ·{' '}
                          {p.instagram.engaged_users} engaged · {p.instagram.reactions} likes
                        </span>
                      )}
                      {!p.facebook && !p.instagram && (
                        <span className="text-gray-600">No performance data yet — syncs daily</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </Card>

      {log.length > 0 && (
        <>
          <SectionTitle>Auto-post activity</SectionTitle>
          <Card padded={false}>
            <ul className="divide-y divide-gray-800">
              {log.map(entry => (
                <li key={entry.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[entry.status] ?? 'neutral'}>{entry.status.replace(/_/g, ' ')}</Badge>
                      <span className="text-gray-300 text-sm">{entry.ad_type}</span>
                    </div>
                    {entry.reason && <p className="text-gray-500 text-xs mt-0.5">{entry.reason}</p>}
                  </div>
                  <span className="text-gray-600 text-xs flex-shrink-0">
                    {new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Page>
  )
}
