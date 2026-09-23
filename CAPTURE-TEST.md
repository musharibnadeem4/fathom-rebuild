# Capture Test

- Tool: Claude Code (VS Code extension)
- Model: Claude Sonnet 5 (execution)
- Mechanism: Claude Code hooks — `UserPromptSubmit` and `Stop` events, configured in
  `.claude/settings.json`, calling `.claude/hooks/capture.js`. The `Stop` handler
  retroactively patches the PROMPT entry's model field once the real model is known
  (UserPromptSubmit fires before the model is resolved, so it's unknowable at that
  point in isolation).
- Log files: `.agent-logs/<timestamp>_<session-id>.md`, one per session.

## Known limitation
If a session is interrupted before `Stop` fires, that turn's PROMPT entry keeps
`model: unknown`, since there is nothing to patch it with at that point. This is
an accepted trade-off rather than fabricating a value.

## Canary 1 (session, 18:07:33 UTC)
File: `.agent-logs/2026-09-23_18-07-33_66f128ef-f7ea-4287-963a-962558e0b921.md`

[LOG_ENTRY type=PROMPT num=1 session=66f128ef-f7ea-4287-963a-962558e0b921]
timestamp: 2026-09-23T18:07:33.472Z
model: unknown

CAPTURE TEST — 8x assignment, Musharib-2

[LOG_ENTRY type=RESPONSE num=1 session=66f128ef-f7ea-4287-963a-962558e0b921]
timestamp: 2026-09-23T18:07:35.733Z
model: unknown

This looks like a test message rather than an actual task — nothing here needs a
file edit, search, or tool call. Let me know what you'd actually like me to help
with in the Fanthom AI project.

## Canary 2 (session, 18:18:39 UTC — after the model-field fix)
File: `.agent-logs/2026-09-23_18-18-39_61f5ecdf-2a26-4774-8dde-2af42821c897.md`

[LOG_ENTRY type=PROMPT num=1 session=61f5ecdf-2a26-4774-8dde-2af42821c897]
timestamp: 2026-09-23T18:18:39.972Z
model: claude-sonnet-5

CAPTURE TEST — 8x assignment, Musharib-5

[LOG_ENTRY type=RESPONSE num=1 session=61f5ecdf-2a26-4774-8dde-2af42821c897]
timestamp: 2026-09-23T18:18:42.831Z
model: claude-sonnet-5

This looks like a test message rather than an actual task — there's nothing here
for me to act on. Could you clarify what you'd like me to do?

## What didn't work first
- Initial hook wrote `model: unknown` in frontmatter, PROMPT entries, and RESPONSE
  entries — the hook had no logic to resolve the model at all.
- After a first fix, frontmatter and RESPONSE entries correctly showed
  `claude-sonnet-5`, but PROMPT entries still showed `unknown`, since
  `UserPromptSubmit` fires before the model for that turn is resolved.
- Fix: added `patchPromptModel()`, called from the `Stop` handler, which rewrites
  the earlier PROMPT entry's `model: unknown` in place once `Stop` has resolved
  the real model for that turn.