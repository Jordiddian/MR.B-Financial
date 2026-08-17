-- Tracks which ads have already been turned into a Reel by the local FFmpeg
-- pipeline (local/make-reel.mjs), so it doesn't reprocess the same ad twice.
-- Applied directly via the Supabase Management API on 2026-08-17 — this file
-- documents that change for anyone reading migration history.

alter table ads add column if not exists reel_media_id text;
alter table ads add column if not exists reel_video_url text;
