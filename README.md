# Fathom Rebuild

A rebuild of [fathom.video](https://fathom.video) — the AI meeting notetaker — built in 24 hours.

**Live app:** [https://fathom-rebuild-sooty.vercel.app/]
**Walkthrough:** TODO — add Loom link before submitting
**Repo:** https://github.com/musharibnadeem4/fathom-rebuild

---

## What this is

Every call transcribed, diarized, summarized, and searchable — the core loop
Fathom is built around — plus a few things we chose to push further than
Fathom's own free-plan experience: a visible speaker/talk-time breakdown, and
post-call "coaching flags" (talk-time imbalance, unanswered questions,
objections, follow-up opportunities) rendered directly on the playback
scrubber.

Seeded with 5 real meetings — a two-person podcast interview, two mock
technical/CSS interviews, and a multi-speaker panel discussion — so the app
isn't an empty shell.

## What's built

**Core loop**
- Meetings list with search
- Synced video/audio player + transcript — click a line to seek, playback
  auto-highlights and scrolls the current line
- AI summary with 3 templates (General, Sales, One-on-One), each genuinely
  restructuring the content, not just relabeling it
- Action items with owner + timestamp (click to seek) — and, when the model
  isn't confident enough to commit to a real action item, a distinct
  "candidates worth reviewing" fallback instead of a dead empty state
- Share: a public link (no login required) and a named-recipient share
- Live upload: `/meetings/new` lets anyone drop in their own recording
  (audio/video, ≤12 minutes) and get it transcribed and analyzed for real,
  in the browser — not just pre-seeded content. Capped at 12 minutes since
  there's no background job queue; longer recordings go through the local
  seed script instead.

**Differentiators**
- Chapters — topic segments with timestamps, shown as a list and as markers
  on the scrubber
- Speaker timeline / talk-time breakdown, computed deterministically from
  diarization data
- Coaching flags — talk-time imbalance, unanswered questions, objections
  detected, follow-up opportunities. Computed once, after the call, and
  rendered as markers on the scrubber, explicitly labeled "post-call
  analysis" in the UI
- Ask This Meeting — question answering over the transcript, with
  timestamp citations that seek the player

## What's deliberately cut, and why

- **The recording bot** (joining a live Zoom/Meet/Teams call) is stubbed.
  Meetings are seeded via a local ingestion script or the live upload form
  instead of live capture. This was explicitly allowed by the brief, and we
  chose to spend the saved time on the meeting experience itself.
- **Live/streaming coaching** — Fathom's own docs note their real-time
  coaching is legacy functionality that needs updating for their newer
  bot-free capture flow. We built the *post-call* version of this instead
  (see Coaching flags above), which needed no live capture pipeline and let
  us ship 4 reliable signals instead of a shakier real-time version.
- **Real calendar OAuth**, billing, teams/permissions, multi-user auth — out
  of scope for a single-workspace demo.
- **Highlight → shareable clip** (Tier 3) — not built. Prioritized hardening
  the core loop and the coaching-flags differentiator instead.
- Filler words, pace, confidence indicators, interruption detection,
  contradiction detection, buying-intent/negotiation-moment detection — all
  named and cut from the coaching-flags scope to keep the 4 shipped signals
  reliable rather than shipping many shallow ones.

## Known limitations

- We were not able to test Fathom's own UI on a true 8-person, hour-long
  call directly (impractical to gather that many participants in the time
  available). Chapters, the speaker timeline, and coaching flags at that
  scale are our own design, informed by what we *did* confirm works on
  shorter calls (highlights, transcript sync, annotations), extended to the
  scale the brief flags as the case that matters most. Full detail in
  `RESEARCH.md`.
- No rate limiting on the live "Ask This Meeting" and upload endpoints —
  fine for a demo, would need guarding before any real multi-user use.

## Architecture

- Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui (Base UI)
- Postgres via Supabase, Drizzle ORM
- Supabase Storage for media files
- AssemblyAI for transcription + speaker diarization
- Google Gemini for summaries, chapters, action items, coaching flags, and
  Ask This Meeting
- Deployed on Vercel

One shared pipeline (`src/lib/pipeline.ts`) powers both ingestion paths:
the local seed script (`scripts/seed.ts`, for longer files) and the live
upload route (for files ≤12 minutes, uploaded directly from the browser to
Supabase Storage via a signed URL to avoid serverless request-body limits).

No auth — a single shared "demo workspace." Every meeting is publicly
viewable at its own URL, matching the requirement that the live link works
for someone not signed in.

## Running locally

```bash
npm install
# copy .env.example to .env.local and fill in:
# DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
# SUPABASE_SERVICE_ROLE_KEY, ASSEMBLYAI_API_KEY, GEMINI_API_KEY
npx drizzle-kit push
npm run dev
```

To seed a local recording:
```bash
npx tsx scripts/seed.ts <path-to-media-file> "<meeting title>"
```

capture was set up and verified. See `RESEARCH.md` for the Fathom product
research that shaped what we built, and `FEATURES.md` for the full build
order and scope decisions.
