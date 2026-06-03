---
phase: 03-template-renderer-chat-delivery
plan: 02
subsystem: ui
tags: [google-chat, cards-v2, renderer, variants, degraded, reliability, tdd]

# Dependency graph
requires:
  - phase: 03-template-renderer-chat-delivery
    plan: 01
    provides: CardsV2Payload + RenderContext + renderTemplate "card" path + the three card fixtures
provides:
  - "renderTemplate full variant cover — degraded / per-designer-miss / holiday / closure / leave — every state posts (REL-01, MSG-04)"
  - "RenderContext.leaveNotes — the optional per-designer half-day-leave carrier (D-22, domain untouched)"
  - "six committed expected-JSON fixtures pinning the always-posts + leave variants"
affects: [03-03-chat-delivery, 05-llm-renderer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordered variant cascade short-circuits BEFORE the figures-bearing card (holiday > closure > degraded > card)"
    - "Degraded path returns a complete postable CardsV2Payload with no rows/bar/button and never throws (REL-01)"
    - "Data-driven source naming: the degraded body interpolates ctx.sourceErrors, never a hardcoded 'Productive'"
    - "Presentation-only context (leaveNotes) carries half-day detail so src/domain stays untouched (mirrors tentativeNotes)"

key-files:
  created:
    - src/render/__tests__/fixtures/degraded.json
    - src/render/__tests__/fixtures/couldnt-read-one.json
    - src/render/__tests__/fixtures/holiday.json
    - src/render/__tests__/fixtures/closure.json
    - src/render/__tests__/fixtures/on-leave.json
    - src/render/__tests__/fixtures/half-day-leave.json
  modified:
    - src/render/variants.ts
    - src/render/verdict.ts
    - src/render/rows.ts
    - src/render/renderMessage.ts
    - src/render/cards.ts
    - src/render/__tests__/renderMessage.test.ts

key-decisions:
  - "Verdict 'I could only read one/two designer(s) tonight.' is keyed off missingDesigners.length (1→one, 2→two) per the locked UI-SPEC line 161 + plan Task 1 fixture; replaced plan-01's missing===total-1 logic which never fired with a single miss"
  - "missingDesigners>0 forces isBusy=true so the 🤖 couldn't-read row renders inside the normal card path (D-19), never as a top-level variant"
  - "A fully-on-leave designer only renders its minimal ⚪ row when the night is ALREADY busy; an otherwise-clean night with one on leave stays clean (D-13/D-17 — leave never drives rows or verdict)"
  - "leaveNotes is the half-day carrier on RenderContext (Open Item 2 'On leave until midday · {X}h booked'); the domain is not touched"

requirements-completed: [MSG-04, MSG-05, MSG-07, REL-01]

# Metrics
duration: 14min
completed: 2026-06-04
---

# Phase 3 Plan 02: Renderer Variant Coverage Summary

**Completes the renderer's always-posts spine — degraded (source unreachable, named from data), per-designer 🤖 miss, public holiday, studio closure, and full/half-day leave rows — each pinned to a committed JSON fixture via deepStrictEqual; 140 tests green, tsc clean.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-04
- **Completed:** 2026-06-04
- **Tasks:** 2 (Task 1 TDD RED → GREEN; Task 2 fixture-pins behavior introduced by Task 1's GREEN)
- **Files created:** 6 (all fixtures)
- **Files modified:** 6

## Accomplishments
- **Degraded variant (D-18 / REL-01):** header + verdict/body only, no rows/week-bar/button. The unreachable source is named verbatim from `ctx.sourceErrors` (escaped), so a future Calendar source reads "Couldn't reach Calendar tonight." The path never throws — it always returns a complete postable payload.
- **Per-designer miss (D-19 / MSG-07):** a 🤖 "couldn't read" row renders for any `report.missingDesigners` entry, inside the normal card; the other designers show real rows; the verdict stays nameless. Never fakes an empty/zero figure.
- **Holiday (D-20) + closure (D-21):** each a single warm `textParagraph` with the locked copy and the date label interpolated + escaped; no rows, bar, or button. Cascade precedence proven by test (holiday wins even when `sourceErrors` is also set).
- **Leave rows (D-22):** a `status:"off"` designer renders the minimal `⚪ {Name} — on leave / Full day off.` and nothing more; a half-day leave renders a normal availability row plus a greyed note from `ctx.leaveNotes`.
- All six new fixtures pass `assert.deepStrictEqual`; full suite green (140 tests, 0 fail); `tsc --noEmit` clean.

## Task Commits

1. **Task 1 (RED): failing degraded + per-designer-miss fixtures + tests** — `e81c8d4` (test)
2. **Task 1 (GREEN): degraded + per-designer-miss variants** — `91cd3e3` (feat)
3. **Task 2: pin holiday / closure / on-leave / half-day-leave fixtures + tests** — `a8527cd` (test)

## Files Created/Modified
- `src/render/__tests__/fixtures/degraded.json` — locked source-unreachable card (no rows/bar/button)
- `src/render/__tests__/fixtures/couldnt-read-one.json` — 🤖 missing-designer row + nameless verdict
- `src/render/__tests__/fixtures/holiday.json` / `closure.json` — warm message-only cards
- `src/render/__tests__/fixtures/on-leave.json` — minimal ⚪ full-day-off row inside a busy night
- `src/render/__tests__/fixtures/half-day-leave.json` — normal availability row + greyed leave note
- `src/render/renderMessage.ts` — added `renderHoliday`/`renderClosure`/`renderDegraded` paths + `cardHeader`/`payloadFrom` helpers; passes `missingDesigners`/`leaveNotes` into `buildRow`
- `src/render/rows.ts` — `missingDesignerRow` (🤖); off-day short-circuit to the minimal row; half-day `leaveNotes` line; locked "on leave / Full day off." copy
- `src/render/verdict.ts` — could-only-read branch keyed off `missingDesigners.length`
- `src/render/variants.ts` — `isBusy` true when `missingDesigners` present
- `src/render/cards.ts` — `RenderContext.leaveNotes` optional carrier; reworded a doc comment to keep the data-driven-source grep clean
- `src/render/__tests__/renderMessage.test.ts` — six new scenario tests + the cascade-precedence test

## Decisions Made
- **Verdict count source.** The plan + UI-SPEC line 161 pin the "one designer missing" → "I could only read one designer tonight." pairing, and the plan Task 1 fixture has exactly one missing designer. Plan-01's verdict guard (`missing === total - 1`) would only fire with two missing, so it never matched the locked fixture. Replaced it with a count-driven branch (`length 1 → "one designer"`, `length 2 → "two designers"`) — the wording the fixture and acceptance criteria enforce.
- **On-leave only shows when already busy.** D-13/D-17 keep an otherwise-clean night clean even with someone on leave (leave never drives rows or the verdict). The on-leave fixture therefore pairs the leave designer with an underbooked colleague so the rows section renders; the leave row itself is the minimal ⚪ line.
- **leaveNotes as the half-day carrier.** Per UI-SPEC Open Item 2, the "On leave until midday · {X}h booked" note needs absence detail `StudioReport` doesn't carry. Added `RenderContext.leaveNotes` (optional, escaped on insertion) — `src/domain` untouched (verified by `git diff`), mirroring the plan-01 `tentativeNotes` approach.

## Deviations from Plan

None — plan executed as written. One grep nuance handled (mirrors the 03-01 precedent): the Task 1 acceptance check `grep -n '"Productive"' src/render/*.ts` was tripping on a plan-01 doc comment (`e.g. "Productive"`) in `cards.ts`, not on the degraded body. The comment was reworded to "e.g. the booking source" — no code behaviour changed; the degraded source label is genuinely data-driven from `ctx.sourceErrors`.

## TDD Gate Compliance
- **Task 1** followed a clean RED → GREEN: the degraded + per-designer-miss fixtures/tests were committed failing (`e81c8d4`, 3 subtests failing), then the implementation made them pass (`91cd3e3`).
- **Task 2** could not produce a true intermediate RED: making Task 1's `renderMessage` coherent required introducing the full ordered cascade (holiday/closure paths) and the leave-row logic in the same GREEN — a non-card variant can no longer `throw`. Task 2's commit therefore pins that behavior with four fixtures + tests that passed on first run. Each fixture is hand-authored, distinct expected JSON deep-equalled against the output (verified, not auto-captured), so the gate's intent — locked, drift-proof output — holds. Splitting the cascade across two commits with intermediate `throw`s would have been contrived.

## Known Stubs
None introduced by this plan. (The plan-01 `AVATAR_PNG_URL` placeholder — resolved in plan 03-04 — is unchanged and out of scope here.)

## Threat Flags
None. No new network endpoints, auth paths, file access, or schema changes. All dynamic strings (`sourceErrors`, `dateLabel`, `backDayLabel`, `leaveNotes`) are HTML-escaped before insertion (T-03-04). The degraded path returns a complete payload and never throws (T-03-05). No packages installed (T-03-SC).

## Next Phase Readiness
- `renderTemplate` now covers every state — plan 03-03 (`postToChat`) and the `src/index.ts` composition root can rely on a payload being produced for any input, including total source failure (REL-01).
- The `RenderContext` shape is stable and extended only additively (`leaveNotes?`), so the plan-05 LLM renderer still drops in behind the identical `RenderMessage` signature.

## Self-Check: PASSED
- All 6 created fixtures + 6 modified files verified present on disk.
- All three task commits (`e81c8d4`, `91cd3e3`, `a8527cd`) verified in git log.
- `npx tsc --noEmit` clean; `npm test` green (140 tests, 0 fail).

---
*Phase: 03-template-renderer-chat-delivery*
*Completed: 2026-06-04*
