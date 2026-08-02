-- Migration: true auto mode (posting + ads) + organic post results tracking
-- Run in Supabase SQL Editor → project tjbdxlcjbypcjnyggcrq

-- ─────────────────────────────────────────────────────────────
-- Auto mode settings. Posting and ads are independent switches —
-- Jordan's plan is organic posts for ~a month, then ads once that's proven out.
-- Each has its own cadence and rotation cursor so the two schedules never
-- interfere with each other.
-- ─────────────────────────────────────────────────────────────
alter table budget_settings add column if not exists auto_post_enabled boolean default false;
alter table budget_settings add column if not exists auto_post_cadence_hours integer default 24;
alter table budget_settings add column if not exists last_auto_post_at timestamptz;
alter table budget_settings add column if not exists auto_post_rotation_index integer default 0;

alter table budget_settings add column if not exists auto_ads_enabled boolean default false;
alter table budget_settings add column if not exists auto_ads_cadence_hours integer default 168; -- weekly by default
alter table budget_settings add column if not exists last_auto_ads_at timestamptz;
alter table budget_settings add column if not exists auto_ads_rotation_index integer default 0;

-- ─────────────────────────────────────────────────────────────
-- Persist the Facebook post ID (and Instagram media ID) once an organic
-- post actually goes out. Without this there's no way to fetch its
-- performance later — post-to-page previously returned the ID in the API
-- response and then discarded it.
-- ─────────────────────────────────────────────────────────────
alter table ads add column if not exists meta_post_id text;
alter table ads add column if not exists meta_ig_media_id text;

-- ─────────────────────────────────────────────────────────────
-- Every automated action, whether it published or was held back, so the
-- portal can show a real activity feed instead of a black box.
-- ─────────────────────────────────────────────────────────────
create table if not exists auto_action_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  kind text not null,          -- 'post' | 'ad'
  ad_type text not null,
  ad_id uuid references ads(id),
  meta_campaign_id text,

  status text not null,        -- published | held_for_review | skipped | failed
  reason text,
  result jsonb
);

create index if not exists auto_action_log_created_idx on auto_action_log(created_at desc);
create index if not exists auto_action_log_kind_idx on auto_action_log(kind, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Organic post performance. Separate from ad_performance because the fields
-- don't overlap — engagement/reach, not spend/leads.
-- ─────────────────────────────────────────────────────────────
create table if not exists post_performance (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references ads(id),
  recorded_at timestamptz default now(),

  platform text not null,      -- facebook | instagram
  impressions integer default 0,
  engaged_users integer default 0,
  clicks integer default 0,
  reactions integer default 0,
  comments integer default 0,
  shares integer default 0,
  raw jsonb
);

create index if not exists post_performance_ad_idx on post_performance(ad_id, recorded_at desc);
