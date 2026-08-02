# Ad Optimizer Concept — pulled from Albert AI + Hyper AI, mapped onto mrb-ad-system

Status: recon only, not a build plan. Input for Opus's planning pass.

## What Albert AI does (concrete, not marketing copy)
- Shifts budget to best-performing creative/audience, in-campaign and cross-channel, via **continuous multivariate testing**.
- Does **not** generate its own creative — user must supply approved materials for it to test.
- Needs a steady data flow from brand/creative/channel sources, plus preset goals + guardrails, to work well.
- Runs autonomously once configured — FAQ doesn't describe a human-approval gate before it spends.
- Evaluated via a ~3-month POC measuring KPI progress.

## What Hyper (HyperFX AI) does
- Launches/optimizes ads across Meta, Google, TikTok, LinkedIn.
- **Does** generate its own creative (static + video, via OpenAI/Veo/Meta tooling) — opposite of Albert here.
- Cadence: hourly performance monitoring, daily 9am reports, weekly (Monday 9am) budget review, weekly creative refresh.
- Dashboard: spend, ROAS, revenue, sessions, channel breakdown (paid social/organic/email), weekly Slack/email recaps.
- No explicit approval workflow described either.

## What mrb-ad-system already has (verified against the live repo, 2026-07-31)
- Next.js 16 + Supabase + Vercel, automating Meta insurance ads for Bruce Tabibi.
- **Already generates creative** (gpt-image-1 for images + AI copy) — matches Hyper's creative-gen capability.
- **Already publishes to Meta, but as PAUSED** — a human resumes it. This is an existing approval gate, and a good pattern to keep/extend rather than remove.
- `ad_performance` table already has `ai_score` (0-100) and `ai_notes` — some AI evaluation exists, but nothing currently *acts* on that score.
- `budget_settings` and `spending_log` tables exist — schema is ready for budget logic, but there's no route that actually reallocates budget yet (`/api/meta/sync`, `/api/meta/generate`, `/api/meta/publish`, `/api/ads`, `/api/leads` — no `/api/meta/optimize` equivalent).
- Daily cron at 15:00 UTC already exists (`/api/meta/sync`) — a natural place to hang a daily/weekly optimization pass, matching Hyper's reporting cadence.
- **No dashboard UI at all** — bare Next.js/Tailwind, no shadcn/Motion/Bklit yet. This is the single biggest visible gap versus both Albert and Hyper, whose most visible product surface is their reporting dashboard.

## The gap, mapped onto what already exists
1. **Budget reallocation logic** — a new route (e.g. `/api/meta/optimize`) that reads `ad_performance.ai_score` / `cost_per_lead` across active ads and shifts `budget_settings` toward winners. Given this is real ad spend for a real business, stage changes for approval the same way `/api/meta/publish` already stages ads as PAUSED, rather than auto-executing — at least for a v1.
2. **Scheduled creative refresh** — extend `/api/meta/generate` with a recurring job (weekly, matching Hyper's cadence) instead of one-off generation.
3. **Continuous testing loop** — GrowthBook (not yet installed, free/MIT, recommended earlier) fits here for systematic creative/audience multivariate testing and picking winners, echoing Albert's core mechanism.
4. **Reporting dashboard** — the clearest, lowest-risk, highest-visible-impact piece. Bklit UI (already in the dev toolkit) for spend/ROAS/cost-per-lead/ai_score charts against the existing Supabase tables; Motion for polish. Both `albert-design` and `hyperfx-design` skills (pulled today) are available as direct visual references for this.

## Guardrail principle to carry into the plan
mrb-ad-system already chose "publish as PAUSED, human resumes" over full autonomy. Neither Albert's nor Hyper's public docs describe a human-approval step before spending money — that's a gap in *their* published process, not a reason to skip it here. Recommend keeping a review/approval gate on anything that moves budget, at least until there's a track record, same logic as the existing publish flow.
