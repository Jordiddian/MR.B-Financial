#!/usr/bin/env node
// Local-only Reels pipeline. Does NOT run on Vercel — FFmpeg has no binary
// there, no persistent disk for video files, and function limits would kill
// a video encode before it finished. This is meant to run on this machine,
// either by hand (`node local/make-reel.mjs [ad_id]`) or via Windows Task
// Scheduler (see local/README.md).
//
// What it does: picks the most recent published organic ad that doesn't
// have a Reel yet, renders a 9:16 video from its existing static image with
// the headline and body copy fading in as animated on-screen text (FFmpeg
// drawtext), uploads the video to the same public Supabase Storage bucket
// the images already live in, then publishes it to Instagram as a Reel via
// the same container -> poll -> publish pattern lib/ads/social.ts uses for
// photos. This is additive — it does not touch or replace the existing
// Vercel-based auto-post pipeline for the static image/text post.

import { createClient } from '@supabase/supabase-js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

// ── Env loading — this is a standalone script outside Next.js, so it needs
// its own .env.local parsing. Deliberately simple: no quoting/escaping
// support beyond what this project's own .env.local actually uses.
function loadEnv() {
  const envPath = path.resolve(import.meta.dirname, '..', '.env.local')
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN
const META_PAGE_ID = process.env.META_PAGE_ID
const LANDING_URL = process.env.LANDING_URL || 'https://mrb-site-beta.vercel.app'
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg'
const GRAPH = 'https://graph.facebook.com/v20.0'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Video timing/layout constants — tweak here rather than hunting through
// the filter graph below.
const WIDTH = 1080
const HEIGHT = 1920
const DURATION_SEC = 18
const FPS = 30
// Size the ad image is displayed at once fully revealed — square, since the
// source images are square, centered in the 9:16 frame over a blurred fill.
// Was 960 (89% of WIDTH) — left enough blurred padding top/bottom on the
// tall 9:16 canvas that the ad read as small rather than filling the Reel.
// 1040 keeps a deliberate small margin (20px each side) rather than
// touching the edges, without shrinking the actual ad down.
const FOREGROUND_SIZE = 1040
// How long the zoom-out reveal takes, in seconds. Holds fully revealed for
// the remainder of DURATION_SEC.
const REVEAL_SECONDS = 6
// Starting crop fraction — 0.6 means the reveal starts showing the center
// 60% of the image (roughly 1.65x zoomed in — a clearly visible "pull back"
// once it grows to 100%, not the barely-perceptible ~1.05x a fraction like
// 0.95 would produce) and grows to 100% over REVEAL_SECONDS.
const REVEAL_START_FRACTION = 0.6

async function fetchNextAdForReel() {
  const { data, error } = await supabase
    .from('ads')
    .select('id, ad_type, headline, body_copy, image_url, post_hashtags, is_organic_post, status')
    .eq('is_organic_post', true)
    .eq('status', 'live')
    .not('image_url', 'is', null)
    .is('reel_media_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Supabase query failed: ${error.message}`)
  return data?.[0] ?? null
}

async function fetchAdById(id) {
  const { data, error } = await supabase
    .from('ads')
    .select('id, ad_type, headline, body_copy, image_url, post_hashtags, is_organic_post, status')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Ad ${id} not found: ${error.message}`)
  return data
}

async function downloadImage(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(destPath, buf)
}

async function renderReel(imagePath, outPath) {
  // The source image is the complete, already-composited ad — gpt-image-1
  // renders the headline, body copy, CTA, agent info, and fine print
  // directly onto it (see lib/ads/creative.ts's image prompt). There is no
  // separate clean background anywhere, so this never draws new text: doing
  // so would duplicate what's already baked into the image. All the motion
  // in this video comes from the camera, not from added captions.
  //
  // Background: the same image, scaled to fill the 9:16 frame and heavily
  // blurred, so a square source never letterboxes with bare black bars.
  // Foreground: the same image, animated with zoompan — a purpose-built
  // Ken Burns filter that counts its own output frames (the `on` variable).
  //
  // Uses the canonical zoompan pattern: a single static input frame
  // (`-loop 1`, no `-framerate`) with `d` set to the ENTIRE clip's frame
  // count, letting zoompan generate every output frame itself and the
  // `max(1.0, ...)` clamp naturally hold the fully-revealed state for the
  // remainder. Two earlier variants were tried and rejected after actually
  // rendering and comparing real frames (not just assumed correct): a
  // manual `t`-based crop filter never advanced past its t=0 state at all
  // on a looped image, and feeding zoompan a pre-repeated 30fps input
  // stream with `d=1` advanced `on` unpredictably faster than real time.
  // This pattern — matching what FFmpeg's own documentation and every
  // working example use for "static image to Ken Burns video" — produced
  // a reveal that measurably lands at the intended second when checked.
  const startZoom = 1 / REVEAL_START_FRACTION
  const totalFrames = DURATION_SEC * FPS
  const revealFrames = REVEAL_SECONDS * FPS
  const zoomStep = (startZoom - 1) / revealFrames

  const filter = [
    `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=30,eq=brightness=-0.08[bg]`,
    `[0:v]scale=1600:1600:force_original_aspect_ratio=increase,crop=1600:1600,` +
      `zoompan=z='if(eq(on\\,0)\\,${startZoom.toFixed(4)}\\,max(1.0\\,zoom-${zoomStep.toFixed(6)}))':` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${FOREGROUND_SIZE}x${FOREGROUND_SIZE}:fps=${FPS}[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[base]`,
  ].join(';')

  const args = [
    '-y',
    '-loop', '1', '-i', imagePath,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', filter,
    '-map', '[base]', '-map', '1:a',
    '-t', String(DURATION_SEC),
    '-r', String(FPS),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    outPath,
  ]

  console.log('Running FFmpeg...')
  await execFileAsync(FFMPEG_BIN, args)
}

async function uploadReel(localPath, adId) {
  const buf = readFileSync(localPath)
  const storagePath = `reels/${adId}.mp4`
  const { error } = await supabase.storage
    .from('ad-creatives')
    .upload(storagePath, buf, { contentType: 'video/mp4', upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = supabase.storage.from('ad-creatives').getPublicUrl(storagePath)
  return data.publicUrl
}

async function getPageToken() {
  const res = await fetch(`${GRAPH}/${META_PAGE_ID}?fields=access_token&access_token=${META_ACCESS_TOKEN}`)
  const json = await res.json()
  if (!json.access_token) {
    throw new Error(json.error?.message ?? 'Could not get a page access token')
  }
  return json.access_token
}

function buildCaption(ad) {
  return [ad.headline, '', ad.body_copy, '', 'Link in bio to get your free quote.', '', ad.post_hashtags ?? '']
    .filter(line => line !== undefined)
    .join('\n')
    .trim()
}

async function publishReel(videoUrl, ad, pageToken) {
  const igIdRes = await fetch(`${GRAPH}/${META_PAGE_ID}?fields=instagram_business_account&access_token=${pageToken}`)
  const igIdJson = await igIdRes.json()
  const igId = igIdJson.instagram_business_account?.id
  if (!igId) throw new Error('No Instagram business account linked to this Facebook page')

  const containerRes = await fetch(`${GRAPH}/${igId}/media`, {
    method: 'POST',
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption: buildCaption(ad),
      access_token: pageToken,
    }),
  })
  const container = await containerRes.json()
  if (!container.id) {
    throw new Error(container.error?.message ?? `Container creation failed (HTTP ${containerRes.status})`)
  }

  // Reel processing takes noticeably longer than a photo — poll for up to
  // ~3 minutes rather than the ~10s used for photo containers.
  let statusCode = 'IN_PROGRESS'
  for (let attempt = 0; attempt < 36 && statusCode === 'IN_PROGRESS'; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 5000))
    const statusRes = await fetch(`${GRAPH}/${container.id}?fields=status_code&access_token=${pageToken}`)
    const statusJson = await statusRes.json()
    statusCode = statusJson.status_code ?? 'ERROR'
    console.log(`Container status: ${statusCode} (attempt ${attempt + 1})`)
  }
  if (statusCode !== 'FINISHED') {
    throw new Error(`Reel container never finished processing (status: ${statusCode})`)
  }

  const publishRes = await fetch(`${GRAPH}/${igId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: container.id, access_token: pageToken }),
  })
  const published = await publishRes.json()
  if (!published.id) {
    throw new Error(published.error?.message ?? `Publish failed (HTTP ${publishRes.status})`)
  }
  return published.id
}

async function main() {
  const args = process.argv.slice(2)
  const renderOnly = args.includes('--render-only')
  const adIdArg = args.find(a => !a.startsWith('--'))
  const ad = adIdArg ? await fetchAdById(adIdArg) : await fetchNextAdForReel()

  if (!ad) {
    console.log('No eligible ad found (need is_organic_post=true, status=live, image_url set, no reel yet).')
    return
  }
  console.log(`Making a Reel from: ${ad.ad_type} — "${ad.headline}" (${ad.id})`)

  const workDir = mkdtempSync(path.join(tmpdir(), 'mrb-reel-'))
  try {
    const imagePath = path.join(workDir, 'source.png')
    const outPath = path.join(workDir, 'reel.mp4')

    await downloadImage(ad.image_url, imagePath)
    await renderReel(imagePath, outPath)
    console.log(`Rendered: ${outPath}`)

    if (renderOnly) {
      console.log('--render-only set, stopping before upload/publish.')
      return
    }

    console.log('Uploading...')
    const videoUrl = await uploadReel(outPath, ad.id)
    console.log(`Uploaded: ${videoUrl}`)

    const pageToken = await getPageToken()
    const mediaId = await publishReel(videoUrl, ad, pageToken)
    console.log(`Published! Instagram media id: ${mediaId}`)

    await supabase.from('ads').update({ reel_media_id: mediaId, reel_video_url: videoUrl }).eq('id', ad.id)
    await supabase.from('auto_action_log').insert({
      kind: 'reel', ad_type: ad.ad_type, ad_id: ad.id,
      status: 'published', result: { instagramMediaId: mediaId, videoUrl },
      reason: 'Generated and published locally via local/make-reel.mjs',
    })
  } catch (err) {
    console.error('FAILED:', err.message)
    await supabase.from('auto_action_log').insert({
      kind: 'reel', ad_type: ad.ad_type, ad_id: ad.id,
      status: 'failed', reason: err.message,
    })
    process.exitCode = 1
  } finally {
    if (renderOnly) {
      console.log(`(kept for inspection: ${workDir})`)
    } else {
      rmSync(workDir, { recursive: true, force: true })
    }
  }
}

main()
