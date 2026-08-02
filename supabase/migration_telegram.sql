-- Migration: Telegram approval + notification for Auto-Post
-- Run in Supabase SQL Editor → project tjbdxlcjbypcjnyggcrq

-- Tracks which Telegram message an ad's approval request went out as, so a
-- reply can be matched back to the exact ad it's about (via
-- message.reply_to_message.message_id in the webhook).
alter table ads add column if not exists telegram_message_id bigint;

create index if not exists ads_telegram_message_idx on ads(telegram_message_id) where telegram_message_id is not null;
