# Fathom Product Research

Explored fathom.video on the free plan. Screenshots referenced below are in
/recon (not committed — see note at bottom).

## What we verified directly (single-person, ~1 min test call)
- Meeting page layout: video player left, summary/transcript/ask-fathom tabs
  below it, action items + annotations + share on the right rail.
- Summary has a template switcher (General, Sales, One-on-One confirmed) —
  each template genuinely restructures content, not just relabels it.
- Transcript is a scrollable list of speaker-labeled bubbles, synced to
  playback position.
- Highlighting mid-call creates a timestamped annotation, visible both in the
  right rail and inline in the transcript.
- "Ask Fathom" exists as a dedicated tab next to Summary/Transcript.
- Search box exists on the transcript tab.
- Two share modes: public "Copy Share Link", and a named-recipient share
  modal with a permission-level dropdown, which emails the recipient a full
  recap (confirmed via real email receipt, external, non-logged-in).

## Gaps observed
- Action items showed "None detected. Add manually on transcript tab" on a
  thin call — a dead end, not a helpful fallback.
- Speaker/talk-time analytics are reduced to a single "Monologues: 0" number.
  No visible per-speaker breakdown or timeline in what we saw.
- Fathom's own docs admit real-time coaching is legacy functionality (talk
  time %, monologue detection) and needs updating for their newer bot-free
  capture experience — confirms this is a genuinely underbuilt area, not
  just something we happened to miss.

## What we could NOT verify
We did not observe Fathom's UI on a long (~1h), multi-speaker (8-person) call
directly — gathering that many participants wasn't practical in the time
available. Everything about chapters, speaker-timeline behavior, and coaching
at that scale is our own design, informed by what the single-person UI
confirmed exists (highlights, transcript sync, annotations), extended to the
scale the assignment brief flags as the case that matters most.

## Decisions this drove
1. Action items get a "candidate suggestion" fallback instead of a dead
   empty state.
2. Speaker timeline + talk-time breakdown gets built as a first-class,
   visible feature, not buried as a single number.
3. "Coaching flags" (talk-time imbalance, unanswered question, objection
   detected, follow-up opportunity) are computed ONCE per meeting in the
   batch pipeline and rendered as markers on the playback scrubber — explicit
   post-hoc analysis, not live capture, since the capture layer is stubbed.
4. Capture layer (the actual bot joining a live call) is stubbed. Meetings
   are seeded from real pre-recorded audio/video instead. This was a
   deliberate scope decision to protect time for the differentiated features
   above, and is stated plainly in the walkthrough video.