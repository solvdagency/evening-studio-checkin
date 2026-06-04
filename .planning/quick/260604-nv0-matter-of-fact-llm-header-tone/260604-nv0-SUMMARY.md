---
quick_id: 260604-nv0
slug: matter-of-fact-llm-header-tone
date: 2026-06-04
status: complete
files_modified:
  - src/llm/prompt.ts
---

# Summary — 260604-nv0: Matter-of-fact LLM header tone

## What changed
`src/llm/prompt.ts` `SYSTEM_PROMPT` VOICE section:
- Removed the `Frame things as "worth sorting"` rule (it was nudging the model toward
  "worth X" tails like the reported "...open time tomorrow worth filling").
- Added a matter-of-fact rule: state what's open/outstanding plainly then stop; do
  NOT append value judgments or suggestions ("worth filling", "worth getting into the
  schedule", "worth a look") — leave the nudge implicit.
- Folded the no-blame guidance into a single "collective nudge, never blame" bullet.
- Updated the doc-comment above `SYSTEM_PROMPT` to match.

Cardinal trust rule, JSON contract, and few-shot examples left intact. No changes to
capacity, assembly, or any non-prompt logic (scope discipline).

## Verification
- `npm test` → 263 pass / 0 fail
- `npx tsc --noEmit` → clean

## Notes
- Did not re-run a live model render (would be another paid API call). The change is
  prompt-only; effect on tone is best confirmed on the next live test send.
- The Slice-2 `meetingVerdicts` example line ("...worth booking against.") was left as-is
  — it's a verdict-justification field, not the header, and outside this tone fix's scope.

## Self-Check: PASSED
