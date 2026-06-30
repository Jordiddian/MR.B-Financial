-- Leads (also logged to Google Sheets via Apps Script)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  phone text not null,
  interests text,
  source text default 'website_form',
  ad_id uuid -- populated later once Meta ads are connected
);

-- Active and past ads
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  ad_type text not null, -- 'Covered California', 'Medicare', etc.
  headline text,
  body_copy text,
  image_url text,
  status text default 'pending', -- pending | approved | live | paused | archived
  meta_ad_id text, -- populated once pushed to Meta
  approved_at timestamptz,
  approved_by text
);

-- Daily performance snapshots per ad
create table if not exists ad_performance (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz default now(),
  ad_id uuid references ads(id),
  ad_type text,
  impressions integer default 0,
  clicks integer default 0,
  spend numeric(10,2) default 0,
  leads integer default 0,
  cost_per_lead numeric(10,2),
  ai_score integer, -- 0–100
  ai_notes text
);

-- AI analysis memory log
create table if not exists memory_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  ad_id uuid references ads(id),
  ad_type text,
  score integer,
  patterns_found text,
  what_worked text,
  what_didnt text,
  raw_analysis text
);

-- Budget settings (single row)
create table if not exists budget_settings (
  id integer primary key default 1,
  monthly_cap numeric(10,2),
  max_ad_spend numeric(10,2),
  max_api_costs numeric(10,2),
  approval_required boolean default true,
  updated_at timestamptz default now()
);
insert into budget_settings (id) values (1) on conflict do nothing;

-- Running cost log (every paid API call)
create table if not exists spending_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  category text not null, -- 'ad_spend' | 'ai_text' | 'image_gen'
  amount numeric(10,4) not null,
  description text
);
