-- Migration: campaign tracking + restructure queue
-- Run in Supabase SQL Editor → project tjbdxlcjbypcjnyggcrq

-- Full campaign record — populated by publish route, updated by sync
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Meta identifiers
  meta_campaign_id text unique,
  meta_adset_id text,
  meta_ad_id text,

  -- Our identifiers
  ad_id uuid references ads(id),
  ad_type text,

  -- Structure (set at creation, never changes)
  campaign_name text,
  objective text,
  audience_type text,       -- 'broad' | 'lookalike' | 'interest'
  placement text,           -- 'automatic' | 'feed' | 'reels' | 'stories'
  image_style text,         -- 'lifestyle' | 'cartoon' | 'informational'
  daily_budget_cents integer,

  -- Status
  status text default 'active',  -- 'active' | 'paused' | 'archived'
  started_at timestamptz default now(),
  paused_at timestamptz,
  days_running integer generated always as (
    extract(day from (coalesce(paused_at, now()) - started_at))::integer
  ) stored,

  -- Performance (updated each sync)
  total_spend numeric(10,2) default 0,
  total_leads integer default 0,
  total_impressions integer default 0,
  total_clicks integer default 0,
  avg_cpl numeric(10,2),
  avg_ctr numeric(6,4),
  latest_score integer,
  latest_recommendation text,  -- pause|maintain|scale|refresh|duplicate
  in_learning_phase boolean default true,
  last_synced_at timestamptz,

  -- Template system
  is_template boolean default false,
  template_notes text
);

-- AI-generated action queue: recommended actions pending human approval
create table if not exists restructure_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  -- Campaign reference
  campaign_id uuid references campaigns(id),
  meta_campaign_id text,
  ad_type text,

  -- Action
  action text not null,  -- pause|scale_budget|refresh_creative|duplicate|mark_template
  reason text,
  urgency text default 'next_cycle',  -- immediate|next_cycle|when_convenient
  learning_phase_active boolean default false,
  params jsonb,          -- e.g. { scale_percent: 25, new_creative_direction: "..." }

  -- Lifecycle
  status text default 'pending',  -- pending|approved|executed|dismissed
  executed_at timestamptz,
  executed_by text,
  result jsonb           -- Meta API response or error
);

-- Index for fast pending-action lookups
create index if not exists restructure_log_status_idx on restructure_log(status);
create index if not exists campaigns_meta_id_idx on campaigns(meta_campaign_id);
