import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { META_ADS_SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { daysRunning, isInLearningPhase } from '@/lib/optimizer/config'
import { isCronRequest } from '@/lib/auth/cron'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const AD_TYPE_MAP: Record<string, string> = {
  'covered california': 'Covered California', 'covered ca': 'Covered California', 'aca': 'Covered California',
  'medicare': 'Medicare',
  'dental': 'Dental',
  'vision': 'Vision',
  'final expense': 'Final Expenses', 'final expenses': 'Final Expenses', 'burial': 'Final Expenses',
}
function mapToAdType(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, val] of Object.entries(AD_TYPE_MAP)) {
    if (lower.includes(key)) return val
  }
  return name
}

// CPL targets per product — used to compute learning_phase_active and urgency context for AI
const CPL_TARGETS: Record<string, number> = {
  'Covered California': 30, 'Medicare': 40, 'Dental': 25, 'Vision': 25, 'Final Expenses': 35,
}

interface MetaAction { action_type: string; value: string }
interface MetaCampaignRow {
  campaign_id?: string; campaign_name?: string
  impressions?: string; clicks?: string; spend?: string; actions?: MetaAction[]
}
interface CampaignData {
  meta_campaign_id: string; campaign_name: string; ad_type: string
  impressions: number; clicks: number; spend: number; leads: number
}

interface AiAnalysisItem {
  ad_id: string; meta_campaign_id?: string; score: number
  performance_summary: string; compliance_flags: string[]
  learning_phase_active: boolean; days_running?: number
  recommendation: 'pause' | 'maintain' | 'scale' | 'refresh' | 'duplicate'
}
interface AiCampaignAction {
  meta_campaign_id: string; action: string; reason: string
  urgency: string; learning_phase_active: boolean
  params?: { scale_percent?: number; new_creative_direction?: string }
}
interface AiResponse {
  analysis: AiAnalysisItem[]
  lessons_learned: string[]
  campaign_actions: AiCampaignAction[]
  budget_recommendations: string[]
  compliance_alerts: string[]
}

async function runSync(authHeader: string | null) {
  if (!isCronRequest(authHeader)) {
    const auth = await createAuthClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID
  if (!token || !accountId) {
    return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 500 })
  }

  // Pull insights — now include campaign_id so we can track by Meta ID
  const params = new URLSearchParams({
    fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions',
    date_preset: 'this_month',
    level: 'campaign',
    access_token: token,
  })

  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${accountId}/insights?${params}`)
  const metaData = await metaRes.json()

  if (!metaRes.ok || metaData.error) {
    return NextResponse.json({ error: metaData.error?.message ?? 'Meta API error' }, { status: 502 })
  }

  if (!metaData.data?.length) {
    return NextResponse.json({ synced: 0, totalSpend: '0.00', note: 'No campaign data returned by Meta' })
  }

  // Build per-campaign data rows (preserve Meta campaign ID)
  const campaignRows: CampaignData[] = (metaData.data as MetaCampaignRow[]).map(row => ({
    meta_campaign_id: row.campaign_id ?? '',
    campaign_name: row.campaign_name ?? '',
    ad_type: mapToAdType(row.campaign_name ?? ''),
    impressions: parseInt(row.impressions ?? '0'),
    clicks: parseInt(row.clicks ?? '0'),
    spend: parseFloat(row.spend ?? '0'),
    leads: (row.actions ?? [])
      .filter(a => ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'].includes(a.action_type))
      .reduce((s, a) => s + parseInt(a.value ?? '0'), 0),
  }))

  // Fetch existing campaign records so we know days_running and history
  const metaIds = campaignRows.map(r => r.meta_campaign_id).filter(Boolean)
  const { data: existingCampaigns } = await supabase
    .from('campaigns')
    .select('*')
    .in('meta_campaign_id', metaIds)

  const campaignMap: Record<string, Record<string, unknown>> = {}
  for (const c of existingCampaigns ?? []) {
    campaignMap[(c as Record<string, unknown>).meta_campaign_id as string] = c as Record<string, unknown>
  }

  // Fetch memory log + templates for AI context
  const { data: memory } = await supabase
    .from('memory_log')
    .select('ad_type, score, what_worked, what_didnt, patterns_found, recommendation, lessons_learned, compliance_alerts')
    .order('created_at', { ascending: false })
    .limit(25)

  const { data: templates } = await supabase
    .from('campaigns')
    .select('ad_type, image_style, audience_type, objective, daily_budget_cents, template_notes, latest_score, total_leads, avg_cpl')
    .eq('is_template', true)

  // Build AI context
  const memoryContext = (memory ?? [])
    .map(m => `${(m as Record<string, unknown>).ad_type}(score ${(m as Record<string, unknown>).score}, ${(m as Record<string, unknown>).recommendation}): worked="${(m as Record<string, unknown>).what_worked ?? '—'}"; avoid="${(m as Record<string, unknown>).what_didnt ?? '—'}"; alerts="${(m as Record<string, unknown>).compliance_alerts ?? 'none'}"`)
    .join('\n') || 'No prior history.'

  const templateContext = (templates ?? []).length > 0
    ? (templates ?? []).map(t => `TEMPLATE [${(t as Record<string, unknown>).ad_type}]: style=${(t as Record<string, unknown>).image_style}, audience=${(t as Record<string, unknown>).audience_type}, score=${(t as Record<string, unknown>).latest_score}, leads=${(t as Record<string, unknown>).total_leads}, CPL=$${(t as Record<string, unknown>).avg_cpl}`).join('\n')
    : 'No templates yet.'

  const cplTargets = Object.entries(CPL_TARGETS).map(([k, v]) => `${k}: $${v}`).join(', ')

  const campaignContext = campaignRows.map(r => {
    const existing = campaignMap[r.meta_campaign_id]
    // Derived from started_at, not the stored column — see daysRunning().
    const days = existing ? daysRunning(existing as Parameters<typeof daysRunning>[0]) : 0
    const inLearning = existing
      ? isInLearningPhase({ ...(existing as Parameters<typeof isInLearningPhase>[0]), total_leads: r.leads })
      : true
    const cpl = r.leads > 0 ? (r.spend / r.leads).toFixed(2) : 'n/a'
    const ctr = r.impressions > 0 ? ((r.clicks / r.impressions) * 100).toFixed(3) : '0.000'
    const target = CPL_TARGETS[r.ad_type]
    const cplVsTarget = r.leads > 0 && target ? ` (target $${target} — ${((r.spend / r.leads) / target).toFixed(1)}× target)` : ''
    return `Campaign: "${r.campaign_name}" [${r.meta_campaign_id}]
  Ad type: ${r.ad_type} | Days running: ${days} | Learning phase: ${inLearning ? 'ACTIVE' : 'exited'}
  Impressions: ${r.impressions} | Clicks: ${r.clicks} | CTR: ${ctr}%
  Spend: $${r.spend.toFixed(2)} | Leads: ${r.leads} | CPL: $${cpl}${cplVsTarget}
  Prior score: ${existing ? existing.latest_score : 'new'} | Status: ${existing ? existing.status : 'new'}`
  }).join('\n\n')

  const userMessage = `
CPL TARGETS: ${cplTargets}

MEMORY LOG:
${memoryContext}

WINNING TEMPLATES:
${templateContext}

THIS CYCLE — CAMPAIGN-LEVEL DATA:
${campaignContext}

TASK: Analyze every campaign above. Score each one. Apply the restructuring decision rules in sequence. Produce campaign_actions for any that require intervention. Document lessons. Do NOT generate new ads (leave new_ads empty array). Return the full JSON structure.
`.trim()

  // Run AI analysis
  let aiResult: AiResponse | null = null
  if (process.env.OPENAI_API_KEY) {
    try {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: META_ADS_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        }),
      })
      if (aiRes.ok) {
        const aiData = await aiRes.json()
        aiResult = JSON.parse(aiData.choices[0].message.content) as AiResponse
      }
    } catch {
      // non-fatal
    }
  }

  // Build analysis map keyed by meta_campaign_id or ad_id
  const analysisById: Record<string, AiAnalysisItem> = {}
  for (const item of aiResult?.analysis ?? []) {
    if (item.meta_campaign_id) analysisById[item.meta_campaign_id] = item
    analysisById[item.ad_id] = item
  }

  // Upsert campaigns table with latest performance data
  const now = new Date().toISOString()
  for (const r of campaignRows) {
    if (!r.meta_campaign_id) continue
    const a = analysisById[r.meta_campaign_id] ?? analysisById[r.ad_type]
    const cpl = r.leads > 0 ? Number((r.spend / r.leads).toFixed(2)) : null
    const ctr = r.impressions > 0 ? Number(((r.clicks / r.impressions)).toFixed(6)) : null
    const existingRow = campaignMap[r.meta_campaign_id]
    const days = existingRow ? daysRunning(existingRow as Parameters<typeof daysRunning>[0]) : 0
    const inLearning = existingRow
      ? isInLearningPhase({ ...(existingRow as Parameters<typeof isInLearningPhase>[0]), total_leads: r.leads })
      : true

    const upsertData: Record<string, unknown> = {
      meta_campaign_id: r.meta_campaign_id,
      campaign_name: r.campaign_name,
      ad_type: r.ad_type,
      total_spend: r.spend,
      total_leads: r.leads,
      total_impressions: r.impressions,
      total_clicks: r.clicks,
      avg_cpl: cpl,
      avg_ctr: ctr,
      in_learning_phase: inLearning,
      // Keep the stored column fresh; started_at stays the source of truth.
      days_running: days,
      last_synced_at: now,
      updated_at: now,
    }
    if (a) {
      upsertData.latest_score = Math.round(a.score)
      upsertData.latest_recommendation = a.recommendation
    }

    await supabase.from('campaigns').upsert(upsertData, { onConflict: 'meta_campaign_id' })
  }

  // Write ad_performance snapshots
  const perfRows = campaignRows.map(r => {
    const a = analysisById[r.meta_campaign_id] ?? analysisById[r.ad_type]
    return {
      recorded_at: now,
      ad_type: r.ad_type,
      impressions: r.impressions,
      clicks: r.clicks,
      spend: r.spend,
      leads: r.leads,
      cost_per_lead: r.leads > 0 ? Number((r.spend / r.leads).toFixed(2)) : null,
      ai_score: a ? Math.round(a.score) : null,
      ai_notes: a
        ? `${a.performance_summary} | Rec: ${a.recommendation}${a.compliance_flags?.length ? ' | Compliance: ' + a.compliance_flags.join('; ') : ''}`
        : null,
    }
  })
  await supabase.from('ad_performance').insert(perfRows)

  // Write memory log entries
  const memoryRows = campaignRows
    .filter(r => (analysisById[r.meta_campaign_id] ?? analysisById[r.ad_type]))
    .map(r => {
      const a = analysisById[r.meta_campaign_id] ?? analysisById[r.ad_type]
      return {
        ad_type: r.ad_type,
        score: Math.round(a.score),
        patterns_found: a.performance_summary,
        what_worked: a.recommendation === 'scale' || a.recommendation === 'duplicate' ? a.performance_summary : null,
        what_didnt: a.recommendation === 'pause' ? a.performance_summary : null,
        raw_analysis: a.performance_summary,
        recommendation: a.recommendation,
        lessons_learned: aiResult?.lessons_learned?.join(' | ') ?? null,
        budget_recommendations: aiResult?.budget_recommendations?.join(' | ') ?? null,
        compliance_alerts: [...(a.compliance_flags ?? []), ...(aiResult?.compliance_alerts ?? [])].join(' | ') || null,
      }
    })
  if (memoryRows.length > 0) {
    await supabase.from('memory_log').insert(memoryRows)
  }

  // Queue campaign_actions into restructure_log (pending human approval)
  let actionsQueued = 0
  for (const action of aiResult?.campaign_actions ?? []) {
    if (!action.meta_campaign_id || !action.action) continue

    // Find our internal campaign record
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, ad_type')
      .eq('meta_campaign_id', action.meta_campaign_id)
      .single()

    await supabase.from('restructure_log').insert({
      campaign_id: campaign?.id ?? null,
      meta_campaign_id: action.meta_campaign_id,
      ad_type: campaign?.ad_type ?? null,
      action: action.action,
      reason: action.reason,
      urgency: action.urgency ?? 'next_cycle',
      learning_phase_active: action.learning_phase_active ?? false,
      params: action.params ?? null,
      status: 'pending',
    })
    actionsQueued++
  }

  // Log spend
  const totalSpend = campaignRows.reduce((s, r) => s + r.spend, 0)
  if (totalSpend > 0) {
    await supabase.from('spending_log').insert({
      category: 'ad_spend',
      amount: Number(totalSpend.toFixed(2)),
      description: `Meta ads sync ${now.split('T')[0]}`,
    })
  }

  return NextResponse.json({
    synced: perfRows.length,
    analyzed: memoryRows.length,
    actionsQueued,
    totalSpend: totalSpend.toFixed(2),
    complianceAlerts: aiResult?.compliance_alerts ?? [],
  })
}

export async function GET(request: Request) {
  return runSync(request.headers.get('authorization'))
}
export async function POST(request: Request) {
  return runSync(request.headers.get('authorization'))
}
