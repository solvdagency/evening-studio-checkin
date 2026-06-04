---
phase: 05-llm-renderer-optional
plan: 02
status: complete
requirements: [LLM-02]
date: 2026-06-04
---

# Phase 5 Plan 02: Fuzzy meeting keep/soften/drop judgment Summary

Slice-2 fuzzy meeting-judgment layer: the single Anthropic call's per-meeting
keep/soften/drop verdicts now adjudicate the deterministic reconciler's worth-a-look
flags, applied by pure TypeScript BEFORE rendering, behind a default-OFF toggle —
plus the offline flag-fairness eval harness over the Phase-4 labelled real meetings.
All four tasks complete: Tasks 1-3 built & committed; Task 4 (blocking human-verify)
APPROVED — the operator ran the harness live and confirmed flag fairness. LLM-02 is
validated.

## What was built (Tasks 1-3)

**`applyVerdicts(worthALook, verdicts)`** (`src/llm/applyVerdicts.ts`) — pure, never
throws. Keyed by the SAME stable flattened index `buildFacts` assigns. `keep`/no
verdict → unchanged; `soften` → kept, title replaced by the raw model `line`
(duration still from the item); `drop` → omitted. A verdict for an id that is not a
current index is a NO-OP. The output is always a (possibly reworded) SUBSET of the
input — it can only shrink or reword, never grow. The model can never invent a flag
(AI-SPEC §6 / T-05-05).

**Prompt extension** (`src/llm/prompt.ts`) — explicit keep/soften/drop semantics, the
precision-focused bias-to-silence rule (may soften/drop a borderline flag; never
harden, never invent, never drop genuine client work; when unsure, soften), and a new
inline few-shot of a borderline meeting → `soften`.

**Assemble seam** (`src/llm/assemble.ts`) — `assembleCardsV2(report, ctx, out,
applyMeetingJudgment = false)`. When the flag is on, `adjudicateWorthALook` flattens
`ctx.worthALook` in the identical buildFacts order, applies the verdicts via
`applyVerdicts`, and re-groups by designer before `renderTemplate` renders the rows.
When off (the default), `renderCtx === ctx` and the card is byte-identical to Slice 1.
Numbers/rows/week-bar/links are still sourced from the template either way.

**Default-OFF toggle** (`src/config.ts`) — `USE_LLM_MEETING_JUDGMENT`, read from
`process.env.USE_LLM_MEETING_JUDGMENT === "true"`, default `false`. Threaded through
`renderLlm.ts` (`assembleCardsV2(..., USE_LLM_MEETING_JUDGMENT)`); `index.ts` documents
that judgment only applies when BOTH `USE_LLM_RENDERER` and `USE_LLM_MEETING_JUDGMENT`
are on (judgment lives inside the LLM renderer, which only runs when `USE_LLM_RENDERER`
is on).

**Offline eval harness** (`scripts/eval-llm-renderer.ts`) — a one-off `tsx` script
(under `scripts/`, never matched by the `src` test glob, off-CI). Runs the REAL prompt
over the labelled genuine worth-a-look set using `process.env.ANTHROPIC_API_KEY`,
prints a keep/soften/drop pass/fail table, and exits non-zero on any `drop` of a
meeting labelled genuine client work (never-drop rule, T-05-06).

## Key files

**Created**
- `src/llm/applyVerdicts.ts` — pure keep/soften/drop; unknown ids no-op; subset-only
- `src/llm/applyVerdicts.test.ts` — toggle-OFF identity, keep/soften/drop, invent/drop-unknown no-ops, never-grows
- `src/llm/flagFairness.test.ts` — structural never-drop over the labelled genuine set
- `scripts/eval-llm-renderer.ts` — offline behavioural flag-fairness harness (dev key, off-CI)

**Modified**
- `src/llm/prompt.ts` — keep/soften/drop semantics + bias-to-silence + soften few-shot
- `src/llm/assemble.ts` — Slice-2 seam: `adjudicateWorthALook` + `applyMeetingJudgment` param
- `src/llm/renderLlm.ts` — pass `USE_LLM_MEETING_JUDGMENT` into `assembleCardsV2`
- `src/config.ts` — `USE_LLM_MEETING_JUDGMENT` constant, default OFF
- `src/index.ts` — documented the both-flags-on composition (no behaviour change)

## Verification

- `npm test` → 319 pass / 0 fail (305 prior + 14 new Slice-2 assertions; no regression)
- `npx tsc --noEmit` → clean
- TDD: RED committed (88f76ff, tests fail — no `applyVerdicts.ts`) before GREEN (4aa039b)
- Toggle default OFF → byte-identical to Slice 1 (the prior Slice-1 byte-identity and
  worth-a-look render tests all still pass unchanged)
- `eval-llm-renderer` is NOT matched by the `npm test` glob (0 matches); harness parses,
  loads the labelled set, and its no-key guard exits cleanly before any network call
- Behavioural flag-fairness over the live model: PASSED — Task 4 human-verify checkpoint
  APPROVED. Operator ran `scripts/eval-llm-renderer.ts` against the live model
  (haiku-4-5) with the dev key: exit 0 / PASS. The one genuine client-work flag
  (`FDC IPO Launch Check-In`) was kept; drops-of-genuine = 0 — the never-drop rule
  holds. Toggle confirmed shipping OFF.

## Trust rule enforced in code

`applyVerdicts` only touches the worth-a-look title list — it never reads or emits a
number; durations stay sourced from the reconciler item, not the model. Numbers, rows,
week-bar and links remain byte-identical to the deterministic template regardless of
verdicts (T-05-08). The softened `line` is escaped exactly once at the renderer
boundary (`rows.ts` `escapeHtml`), not in `applyVerdicts` (T-05-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Block-comment `*/` broke the tsx transform of the harness**
- **Found during:** Task 3 (harness smoke-run)
- **Issue:** The header comment contained the literal src test-file glob, whose `*/`
  sequence prematurely closed the JSDoc block comment — esbuild failed with
  `Unexpected "*"`.
- **Fix:** Replaced the literal glob in the comment with the prose "the src test-file
  glob". No behavioural change; the harness now parses and runs.
- **Files modified:** `scripts/eval-llm-renderer.ts`
- **Commit:** 90d1c0d

### Scope/design notes (within scope discipline)

**2. `soften` carries the RAW model line into `title`, not pre-escaped.**
The plan's must_have wording said `escapeHtml(verdict.line)`. The card's single
escaping boundary is `rows.ts` (`escapeHtml(m.title)`), which runs once downstream;
pre-escaping in `applyVerdicts` as well would DOUBLE-escape the visible text (e.g.
`&amp;amp;`). To keep the card correct and preserve the single-escape invariant
(T-05-07), `applyVerdicts` sets the raw line and the renderer escapes it exactly once.
The structural test asserts this explicitly.

**3. `assembleCardsV2` gained an `applyMeetingJudgment` parameter (default false)**
rather than reading env directly, so it stays pure/testable; the toggle is read at the
`renderLlm.ts` wiring point (`USE_LLM_MEETING_JUDGMENT`) and threaded in. This matches
the project's injection style and keeps `assemble.ts` free of `process.env`.

## Task 4 — blocking human-verify checkpoint: APPROVED

LLM-02 is validated. The operator ran the offline harness with the dev key against the
live model (haiku-4-5) and confirmed flag fairness:

- `scripts/eval-llm-renderer.ts` → PASS, exit 0.
- The one genuine client-work flag (`FDC IPO Launch Check-In`) was KEPT.
- drops-of-genuine = 0 — the never-drop rule holds.
- The toggle ships OFF; with it OFF the card is byte-identical to Slice 1.

Resume signal received: "approved".

## Follow-up (do NOT act on now — gate before enabling the toggle in production)

The labelled reference set in `labelled-events.json` currently has only **1 genuine
case**, so the harness has not yet exercised `soften`/`drop` on borderline/overhead
meetings — only the never-drop (keep-genuine) path has been behaviourally proven.
**Before `USE_LLM_MEETING_JUDGMENT` is ever turned ON in production**, expand the
labelled set with 2–3 borderline/overhead cases and re-run `eval-llm-renderer.ts` to
confirm over-flagging actually drops (the soften/drop side of the rubric). Until then
the toggle stays OFF and Slice 2 is dormant.

## Self-Check: PASSED
