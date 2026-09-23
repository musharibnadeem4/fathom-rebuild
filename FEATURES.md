# Feature List & Build Order

## Tier 1 — core loop (must be excellent)
1. Meetings list + cross-meeting search
2. Synced player + transcript (click line seeks video, playback highlights
   current line)
3. AI summary, 3 templates (General, Sales, One-on-One), precomputed at
   seed time
4. Action items — owner + timestamp link; candidate-suggestion fallback
   when confidence is low, instead of an empty state
5. Share — public link + named-recipient share, both viewable without login

## Tier 2 — differentiator (one combined transcript-analysis pass per meeting)
6. Chapters — topic segments with timestamps
7. Speaker timeline + talk-time breakdown — deterministic, computed from
   diarization data, no LLM needed
8. Coaching flags — talk-time imbalance, unanswered question, objection
   detected, follow-up opportunity. Computed post-hoc, rendered as markers
   on the scrubber synced to playback. Explicitly labeled in UI as
   "post-call analysis" — not a live feature.
9. Ask this meeting — Q&A over the transcript, answers cite timestamps

## Tier 3 — if time allows
10. Highlight → shareable clip (plays only the highlighted range)

## Explicitly out of scope
- Real recording bot / live meeting capture
- Real calendar OAuth (mocked "connected calendars" screen only, if built
  at all)
- Live/streaming coaching
- Filler words, pace, confidence indicators, interruption detection,
  contradiction detection, buying-intent/losing-interest/negotiation-moment
  detection — named and cut to keep the 4 shipped coaching signals reliable
- Billing, teams, permissions, multi-user auth