@AGENTS.md

# Fathom Rebuild — Project Context

## What this is
A rebuild of fathom.video (AI meeting notetaker) for a 24h assignment.
Full brief and feature list are in RESEARCH.md and FEATURES.md — read those first.

## Stack
- Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui
- Postgres via Supabase, accessed with Drizzle ORM
- Supabase Storage for media files
- AssemblyAI for transcription + diarization (speaker labels, word timestamps)
- Google Gemini (Flash model) for summaries, chapters, action items, coaching
  flags, and Ask-this-meeting — all via API, JSON output
- Deployed on Vercel

## Capture layer
The recording bot is STUBBED. There is no live meeting capture. Meetings are
seeded from pre-recorded audio/video files via a local ingestion script
(scripts/seed.ts), which runs transcription + all AI passes ONCE and writes
results to the DB. The live app only reads from the DB — it does not call
AssemblyAI or Gemini at request time, except for the "Ask this meeting" feature
and template regeneration, which are the only live AI calls.

## Data model
See db/schema.ts (Drizzle). Do not change the schema without confirming with me
first — several features depend on exact field names.

## Conventions
- Server Components by default. Client Components only where interactivity is
  needed (video player, transcript sync, search input).
- All AI-generated content (summaries, chapters, flags) stored as JSON in the
  DB, never regenerated on page load.
- No auth. Single shared "demo workspace" — every meeting is publicly viewable
  at its own URL. This is intentional per the brief (link must open for
  non-logged-in users).
- Commit after every working feature. Do not let uncommitted work pile up.

## What NOT to build
Live recording bot, calendar OAuth (real), billing, teams/permissions, live
streaming coaching (coaching flags are computed post-hoc, see FEATURES.md).