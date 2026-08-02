-- Migration: ad optimizer — staged budget proposals, creative refresh log, experiments
-- Run in Supabase SQL Editor → project tjbdxlcjbypcjnyggcrq

-- ─────────────────────────────────────────────────────────────
-- Budget proposals: the optimizer never moves money directly.
-- It writes a proposal here; a human approves it from the portal
-- banner, which is what actually calls the Meta API.
-- Same guardrail pattern as publishing ads as PAUSED.
-- ─────────────────────────────────────────────────────────────
create table if not exists budget_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  campaign_id uuid references campaigns(id),
  meta_campaign_id text not null,
  ad_type text,

  -- What the optimizer wants to do
  direction text not null,            -- 'increase' | 'decrease'
  current_budget_cents integer not null,
  proposed_budget_cents integer not null,
  change_percent numeric(5,2) not null,

  -- Why — surfaced verbatim in the approval banner
  reason text not null,
  ai_score integer,
  cost_per_lead numeric(10,2),
  cpl_target numeric(10,2),

  -- Lifecycle
  status text default 'pending',      -- pending | approved | rejected | expired
  reviewed_at timestamptz,
  reviewed_by text,
  result jsonb                        -- Meta API response on approval, or error
);

create index if not exists budget_proposals_status_idx on budget_proposals(status);
create index if not exists budget_proposals_campaign_idx on budget_proposals(meta_campaign_id);

-- Only one pending proposal per campaign at a time — the optimizer
-- refreshes rather than stacking duplicates on every run.
create unique index if not exists budget_proposals_one_pending_per_campaign
  on budget_proposals(meta_campaign_id)
  where status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- Creative refresh log: weekly job regenerates creative ONLY for
-- ad types that are already performing. Tracks what it touched so
-- the same winner isn't refreshed twice in one week.
-- ─────────────────────────────────────────────────────────────
create table if not exists creative_refresh_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  ad_type text not null,
  source_campaign_id uuid references campaigns(id),
  source_ad_id uuid references ads(id),
  generated_ad_id uuid references ads(id),

  -- Why this ad type qualified
  trigger_score integer,
  trigger_cpl numeric(10,2),
  template_used text,

  status text default 'generated',   -- generated | skipped | failed
  notes text
);

create index if not exists creative_refresh_log_type_idx on creative_refresh_log(ad_type, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Experiments: GrowthBook-backed multivariate testing over the
-- creative/audience dimensions we actually control. Albert's core
-- mechanism — systematically vary one axis, measure, pick winners.
-- ─────────────────────────────────────────────────────────────
create table if not exists experiments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- GrowthBook feature/experiment key
  experiment_key text not null,
  ad_type text not null,
  dimension text not null,            -- 'image_style' | 'headline_style' | 'audience_type' | 'cta'

  -- Variants under test, e.g. ['lifestyle','informational']
  variants jsonb not null,

  status text default 'running',      -- running | concluded | abandoned
  winner text,
  concluded_at timestamptz,
  conclusion_notes text,

  -- Rolled-up results per variant:
  -- { "lifestyle": { impressions, clicks, leads, spend, cpl, score, n } }
  results jsonb default '{}'::jsonb
);

create index if not exists experiments_status_idx on experiments(status);
create unique index if not exists experiments_key_idx on experiments(experiment_key);

-- Which variant a given published ad was assigned — lets sync
-- attribute performance back to the experiment arm.
create table if not exists experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  experiment_id uuid references experiments(id) on delete cascade,
  experiment_key text not null,
  ad_id uuid references ads(id),
  meta_campaign_id text,
  variant text not null
);

create index if not exists experiment_assignments_ad_idx on experiment_assignments(ad_id);
create index if not exists experiment_assignments_campaign_idx on experiment_assignments(meta_campaign_id);

-- ─────────────────────────────────────────────────────────────
-- Track budget changes on campaigns so the optimizer can enforce
-- Meta's 5-day cooldown between increases on the same ad set.
-- ─────────────────────────────────────────────────────────────
alter table campaigns add column if not exists last_budget_change_at timestamptz;
alter table campaigns add column if not exists experiment_key text;
alter table campaigns add column if not exists experiment_variant text;

-- Ads carry the variant they were generated under
alter table ads add column if not exists experiment_key text;
alter table ads add column if not exists experiment_variant text;
alter table ads add column if not exists generated_by text default 'manual';  -- manual | refresh_job | recirculate
