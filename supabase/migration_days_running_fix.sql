-- Fix: campaigns.days_running never existed.
--
-- migration_campaigns.sql declared it as:
--   days_running integer generated always as (
--     extract(day from (coalesce(paused_at, now()) - started_at))::integer
--   ) stored
--
-- Postgres requires generated-column expressions to be IMMUTABLE, and now()
-- is only STABLE, so that column was never created. Every read of
-- days_running has been returning undefined → coerced to 0, which meant:
--   - sync computed `in_learning_phase = daysRunning < 7 || leads < 50`
--     as permanently true, so the AI was always told "don't intervene"
--   - the Campaigns page showed "0d" for every campaign
--
-- Fix is a plain column that the sync job refreshes each run, backfilled here
-- from started_at. Application code derives the value from started_at directly;
-- this column exists so the stored value stays correct for anything reading
-- the table without that logic.

alter table campaigns add column if not exists days_running integer default 0;

update campaigns
set days_running = greatest(
  0,
  floor(extract(epoch from (coalesce(paused_at, now()) - started_at)) / 86400)::integer
)
where started_at is not null;

-- Recompute in_learning_phase now that day counts are real.
update campaigns
set in_learning_phase = (days_running < 7 or coalesce(total_leads, 0) < 50)
where status = 'active';
