'use client'
import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Page, PageHeader, Card, CardHeader, Button, Badge, EmptyState, Loading,
  ErrorNote, ExpandableThumbnail, Lightbox, type Tone,
} from '../ui'
import { PUBLIC_LANDING_URL } from '@/lib/config/public'

const AD_TYPES = ['Covered California', 'Medicare', 'Dental', 'Vision', 'Final Expenses']

const IMAGE_STYLES = [
  { value: 'lifestyle', label: 'Lifestyle photo' },
  { value: 'cartoon', label: 'Cartoon / illustrated' },
  { value: 'informational', label: 'Informational / flat design' },
]

interface Ad {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'live'
  headline: string
  body_copy: string
  image_url: string | null
  ad_type: string
  meta_ad_id: string | null
  call_to_action: string | null
  compliance_notes: string | null
  requires_cms_filing: boolean
  requires_human_review: boolean
  is_organic_post: boolean
  post_hashtags: string | null
  generated_by: string | null
  experiment_variant: string | null
  created_at: string
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  approved: { label: 'Approved', tone: 'green' },
  live:     { label: 'In Meta — paused', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export default function ApprovalsPage() {
  const [postingMode, setPostingMode] = useState(false)

  const [ads, setAds] = useState<Ad[]>([])
  const [adsLoading, setAdsLoading] = useState(true)
  const [reviewing, setReviewing] = useState<string | null>(null)

  const [showGenerate, setShowGenerate] = useState(false)
  const [genType, setGenType] = useState(AD_TYPES[0])
  const [genNote, setGenNote] = useState('')
  const [genStyle, setGenStyle] = useState('lifestyle')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const [publishing, setPublishing] = useState<string | null>(null)
  // Per-ad inline feedback, keyed by ad id — replaces the browser alert()s,
  // which fired outside the page and lost the context of which ad failed.
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  // Generated creative is 1024×1024 with headline/body/CTA text baked into
  // the image — unreadable at thumbnail size, which is exactly what needs
  // checking before approving. Lightbox state is just the URL to show.
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // Both fetches set state only from their promise callbacks — a synchronous
  // setState inside the effect would cascade renders.
  useEffect(() => {
    let cancelled = false

    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setPostingMode(data.posting_mode ?? false)
      })
      .catch(() => {})

    fetch('/api/ads')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setAds(Array.isArray(data) ? data : [])
        setAdsLoading(false)
      })
      .catch(() => { if (!cancelled) setAdsLoading(false) })

    return () => { cancelled = true }
  }, [])

  async function review(id: string, status: 'approved' | 'rejected') {
    setReviewing(id)
    await fetch('/api/ads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setAds(prev => prev.map(a => (a.id === id ? { ...a, status } : a)))
    setReviewing(null)
  }

  async function publish(id: string) {
    setPublishing(id)
    setNotice(null)
    try {
      const res = await fetch('/api/meta/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (res.ok) {
        setAds(prev => prev.map(a => (a.id === id ? { ...a, status: 'live', meta_ad_id: data.meta_ad_id } : a)))
        setNotice({ id, ok: true, text: 'Created in Meta as paused — activate it in Ads Manager to start spending.' })
      } else {
        setNotice({ id, ok: false, text: data.error ?? 'Publish failed' })
      }
    } catch {
      setNotice({ id, ok: false, text: 'Could not reach the server' })
    }
    setPublishing(null)
  }

  async function postToPage(id: string) {
    setPublishing(id)
    setNotice(null)
    try {
      const res = await fetch('/api/meta/post-to-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: id, platform: 'facebook' }),
      })
      const data = await res.json()
      if (data.needs_reauth) {
        setNotice({ id, ok: false, text: 'The Meta token is missing the pages_manage_posts scope — regenerate it in the Graph API Explorer.' })
      } else if (res.ok) {
        setAds(prev => prev.map(a => (a.id === id ? { ...a, status: 'live' } : a)))
        setNotice({ id, ok: true, text: 'Posted to the Facebook page.' })
      } else {
        setNotice({ id, ok: false, text: data.error ?? 'Post failed' })
      }
    } catch {
      setNotice({ id, ok: false, text: 'Could not reach the server' })
    }
    setPublishing(null)
  }

  async function recirculate(id: string) {
    setPublishing(id)
    setNotice(null)
    try {
      const res = await fetch('/api/ads/recirculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const newAd = await res.json()
      if (newAd.id) {
        setAds(prev => [newAd, ...prev])
        setNotice({ id, ok: true, text: 'Copied back to pending — reusing the same image, no new AI cost.' })
      } else {
        setNotice({ id, ok: false, text: newAd.error ?? 'Could not recirculate' })
      }
    } catch {
      setNotice({ id, ok: false, text: 'Could not reach the server' })
    }
    setPublishing(null)
  }

  async function copyPost(ad: Ad) {
    // Mirrors lib/ads/social.ts's buildPostText exactly — the actual post
    // includes a website link the AI never writes into body_copy itself; it
    // gets appended at publish time. Copy has to match what really goes out.
    const text = [
      ad.headline, '', ad.body_copy, '',
      `Get your free quote: ${PUBLIC_LANDING_URL}`, '',
      ad.post_hashtags,
    ].filter(x => x != null).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ id: ad.id, ok: true, text: 'Post copied to clipboard.' })
    } catch {
      setNotice({ id: ad.id, ok: false, text: 'Clipboard unavailable — select and copy manually.' })
    }
  }

  // `generating` state alone isn't enough to stop a double-click: React
  // batches the setState, so two rapid clicks can both read `generating` as
  // false before the first re-render lands, firing two generations (real AI
  // spend) instead of one. A plain ref is set synchronously the instant the
  // function runs, closing that window regardless of render timing.
  const generatingRef = useRef(false)

  async function generate() {
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/meta/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_type: genType,
          note: genNote || undefined,
          image_style: genStyle,
          mode: postingMode ? 'post' : 'ad',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setAds(prev => [data, ...prev])
        setShowGenerate(false)
        setGenNote('')
      } else {
        setGenError(data.error ?? 'Failed to generate')
      }
    } catch {
      setGenError('Could not reach the server')
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  const pending = ads.filter(a => a.status === 'pending')
  const reviewed = ads.filter(a => a.status !== 'pending')

  const selectClass =
    'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 transition-colors focus:outline-none focus:border-blue-500'

  return (
    <Page>
      <PageHeader
        title="Approvals"
        subtitle={
          postingMode
            ? 'Organic posts waiting for review before going out'
            : 'AI-generated ads waiting for review before going live'
        }
        actions={
          <>
            {postingMode && <Badge tone="purple">Posting Mode</Badge>}
            <Button
              onClick={() => setShowGenerate(v => !v)}
              variant={showGenerate ? 'ghost' : 'primary'}
              size="md"
            >
              {showGenerate ? 'Cancel' : postingMode ? 'Generate post' : 'Generate ad'}
            </Button>
          </>
        }
      />

      <AnimatePresence initial={false}>
        {showGenerate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden mb-4"
          >
            <div className={`bg-gray-900 border rounded-xl p-5 ${postingMode ? 'border-purple-800' : 'border-blue-800'}`}>
              <p className="text-white text-sm font-medium mb-4">
                Generate a new {postingMode ? 'organic post' : 'ad'} draft
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="genType" className="text-gray-400 text-xs mb-1.5 block">Product</label>
                  <select id="genType" value={genType} onChange={e => setGenType(e.target.value)} className={selectClass}>
                    {AD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="genStyle" className="text-gray-400 text-xs mb-1.5 block">Image style</label>
                  <select id="genStyle" value={genStyle} onChange={e => setGenStyle(e.target.value)} className={selectClass}>
                    {IMAGE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label htmlFor="genNote" className="text-gray-400 text-xs mb-1.5 block">
                  Optional direction
                </label>
                <input
                  id="genNote"
                  value={genNote}
                  onChange={e => setGenNote(e.target.value)}
                  placeholder="e.g. focus on seniors in Fresno — leave blank for a general ad"
                  className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 transition-colors focus:outline-none focus:border-blue-500 placeholder-gray-600"
                />
              </div>
              {genError && <div className="mb-3"><ErrorNote>{genError}</ErrorNote></div>}
              <Button onClick={generate} disabled={generating} variant="primary" size="md">
                {generating ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pending ── */}
      <Card padded={false} className="mb-4" delay={0.05}>
        <CardHeader
          title={postingMode ? 'Pending posts' : 'Pending ads'}
          right={
            pending.length > 0
              ? <Badge tone="amber">{pending.length} waiting</Badge>
              : undefined
          }
        />
        {adsLoading ? (
          <Loading />
        ) : pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting for review"
            hint={`Click "Generate ${postingMode ? 'post' : 'ad'}" to create a draft. The weekly refresh also drops new creative here for product lines that are performing.`}
          />
        ) : (
          <ul className="divide-y divide-gray-800">
            {pending.map(ad => (
              <li key={ad.id} className="px-5 py-4">
                <div className="flex items-start gap-4">
                  {ad.image_url && (
                    <ExpandableThumbnail
                      src={ad.image_url}
                      alt={`Creative for ${ad.ad_type}`}
                      onExpand={() => setLightboxSrc(ad.image_url)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-blue-400 text-xs font-medium">{ad.ad_type}</span>
                      {ad.is_organic_post && <Badge tone="purple">Organic post</Badge>}
                      {ad.requires_cms_filing && <Badge tone="red">CMS filing required</Badge>}
                      {ad.requires_human_review && <Badge tone="amber">Human review</Badge>}
                      {ad.generated_by === 'refresh_job' && (
                        <Badge tone="blue" title="Auto-generated by the weekly refresh because this product line is performing">
                          Weekly refresh
                        </Badge>
                      )}
                      {ad.experiment_variant && (
                        <Badge tone="neutral" title="Variant assigned by a running experiment">
                          Test: {ad.experiment_variant.replace(/_/g, ' ')}
                        </Badge>
                      )}
                      {ad.call_to_action && <Badge tone="neutral">CTA: {ad.call_to_action}</Badge>}
                    </div>
                    <p className="text-white text-sm font-semibold mb-1">{ad.headline}</p>
                    <p className="text-gray-400 text-xs leading-relaxed">{ad.body_copy}</p>
                    {ad.is_organic_post && (
                      <p className="text-blue-400 text-xs mt-1.5" title="Appended automatically when this posts — not part of the AI-written copy above">
                        + Get your free quote: {PUBLIC_LANDING_URL}
                      </p>
                    )}
                    {ad.post_hashtags && (
                      <p className="text-purple-400 text-xs mt-2 leading-relaxed">{ad.post_hashtags}</p>
                    )}
                    {ad.compliance_notes && (
                      <p className="text-yellow-500 text-xs mt-2 leading-relaxed">⚠ {ad.compliance_notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button onClick={() => review(ad.id, 'rejected')} disabled={reviewing === ad.id}>
                      Reject
                    </Button>
                    <Button
                      onClick={() => review(ad.id, 'approved')}
                      disabled={reviewing === ad.id}
                      variant="primary"
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Reviewed ── */}
      {reviewed.length > 0 && (
        <Card padded={false} delay={0.1}>
          <CardHeader title="Recently reviewed" />
          <ul className="divide-y divide-gray-800">
            {reviewed.slice(0, 10).map(ad => {
              const status = STATUS[ad.status] ?? { label: ad.status, tone: 'neutral' as Tone }
              return (
                <li key={ad.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-gray-300 text-sm truncate">{ad.headline}</p>
                      <p className="text-gray-500 text-xs">{ad.ad_type}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {ad.status === 'live' && (
                        <Button
                          onClick={() => recirculate(ad.id)}
                          disabled={publishing === ad.id}
                          title="Copy this ad back to pending, reusing the same image"
                        >
                          Recirculate
                        </Button>
                      )}

                      {ad.status === 'approved' && ad.is_organic_post && (
                        <>
                          <Button onClick={() => copyPost(ad)}>Copy</Button>
                          <Button
                            onClick={() => postToPage(ad.id)}
                            disabled={publishing === ad.id}
                            variant="primary"
                          >
                            {publishing === ad.id ? 'Posting…' : 'Post to Page'}
                          </Button>
                        </>
                      )}

                      {ad.status === 'approved' && !ad.is_organic_post && (
                        <Button
                          onClick={() => publish(ad.id)}
                          disabled={publishing === ad.id || !ad.image_url}
                          variant="primary"
                          title={ad.image_url ? undefined : 'No image — regenerate with an image first'}
                        >
                          {publishing === ad.id ? 'Pushing…' : 'Push to Meta'}
                        </Button>
                      )}

                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  </div>

                  {notice?.id === ad.id && (
                    <p className={`text-xs mt-2 leading-relaxed ${notice.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {notice.text}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Lightbox
        src={lightboxSrc}
        alt="Ad creative, fullscreen"
        onClose={() => setLightboxSrc(null)}
      />
    </Page>
  )
}
