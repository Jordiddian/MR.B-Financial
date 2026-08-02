// Client-safe config only. Nothing server-only (Supabase service role key,
// API secrets) may ever be re-exported from this file, and this file must
// never be imported by anything in lib/ads/ or other server-only modules.
//
// lib/ads/creative.ts's LANDING_URL is the server-side source of truth for
// the landing site link — do not import that module into a client
// component. It instantiates a Supabase client with the service role key at
// module load time, and bundling that into client JS is exactly the kind of
// mistake this file exists to prevent.

export const PUBLIC_LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || 'https://mrb-site-beta.vercel.app'
