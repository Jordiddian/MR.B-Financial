# Local Reels pipeline

Turns an already-published organic ad (image + copy already generated and
live via the normal Vercel-based pipeline) into a 9:16 Instagram Reel — a
slow zoom-out reveal of the same ad image, no new text, no new OpenAI
generation cost. Runs on this machine only; it cannot run on Vercel (no
FFmpeg binary, no persistent disk, function time limits). See the comment
at the top of `make-reel.mjs` for the full explanation.

This is **additive**, not a replacement — it does not touch or disable the
existing Vercel-based static image/text auto-post pipeline. It only adds a
Reel on top of whatever already went out.

## Requirements

- FFmpeg on PATH (already installed on this machine — confirmed via `ffmpeg -version`)
- Node 18+ (already installed)
- The project's `.env.local` (reads it directly — no separate config needed)

## Running it manually

```bash
# Picks the most recent live organic ad that doesn't have a Reel yet
node local/make-reel.mjs

# Or target a specific ad
node local/make-reel.mjs <ad_id>

# Render only — writes the video to a temp folder and stops before
# uploading or publishing anything, for checking the render itself first
node local/make-reel.mjs --render-only
```

## Setting up Windows Task Scheduler

Run once (PowerShell, as your normal user — no admin needed for a per-user task):

```powershell
$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "local/make-reel.mjs" -WorkingDirectory "C:\Claude\MR.B Financial"
$trigger = New-ScheduledTaskTrigger -Daily -At "4:15PM"
Register-ScheduledTask -TaskName "MRB-Reel-Pipeline" -Action $action -Trigger $trigger -Description "Turns the day's auto-posted ad into an Instagram Reel"
```

4:15pm was picked to run after the existing 3pm/3:15pm Vercel auto-post
cron has had time to actually publish that day's ad — adjust if needed.

To check it's registered: `Get-ScheduledTask -TaskName "MRB-Reel-Pipeline"`

To run it immediately without waiting for the schedule: `Start-ScheduledTask -TaskName "MRB-Reel-Pipeline"`

To remove it: `Unregister-ScheduledTask -TaskName "MRB-Reel-Pipeline" -Confirm:$false`

**Important limitation, not a bug**: this only fires if the machine is on,
awake, and online at the scheduled time — unlike the Vercel cron jobs,
which run in the cloud regardless. If this machine is asleep or off at
4:15pm, that day's Reel is simply skipped (no retry, no catch-up) until the
next scheduled run finds a new eligible ad.

## What it does, step by step

1. Queries Supabase for the most recent ad where `is_organic_post = true`,
   `status = 'live'`, `image_url` is set, and `reel_media_id` is still null.
2. Downloads that image.
3. Renders an 18-second 9:16 video: the same image blurred and scaled to
   fill the frame as a background, with the same image on top at a fixed
   size, animated with a 6-second zoom-out reveal (zoompan), then held
   static for the remainder.
4. Uploads the MP4 to the same public `ad-creatives` Supabase Storage
   bucket the images already live in, under `reels/<ad_id>.mp4`.
5. Publishes it to Instagram as a Reel via the Graph API (container create
   → poll until processed → publish), reusing the same page-access-token
   pattern `lib/ads/social.ts` uses for photos.
6. Records `reel_media_id` / `reel_video_url` on the `ads` row and logs the
   result to `auto_action_log` (`kind: 'reel'`), so it shows up in the
   dashboard's auto-activity feed even though it ran locally.

## Tuning

Constants near the top of `make-reel.mjs`:

- `DURATION_SEC` — total clip length (18s default)
- `REVEAL_SECONDS` — how long the zoom-out takes (6s default)
- `REVEAL_START_FRACTION` — how tight the starting zoom is (0.6 = ~1.65x zoomed in)
- `FOREGROUND_SIZE` — display size of the ad image within the 9:16 frame
