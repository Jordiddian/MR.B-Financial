-- Migration: add compliance fields to ads and memory_log
-- Run this in the Supabase SQL editor for the tjbdxlcjbypcjnyggcrq project

-- New columns on ads (AI compliance output)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS call_to_action text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS compliance_notes text;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS requires_cms_filing boolean default false;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS requires_human_review boolean default false;

-- New columns on memory_log (structured AI output from sync)
ALTER TABLE memory_log ADD COLUMN IF NOT EXISTS recommendation text; -- pause|maintain|scale|refresh
ALTER TABLE memory_log ADD COLUMN IF NOT EXISTS lessons_learned text;
ALTER TABLE memory_log ADD COLUMN IF NOT EXISTS budget_recommendations text;
ALTER TABLE memory_log ADD COLUMN IF NOT EXISTS compliance_alerts text;
