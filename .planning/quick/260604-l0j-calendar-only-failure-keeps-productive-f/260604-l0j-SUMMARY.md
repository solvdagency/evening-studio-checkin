---
phase: quick-260604-l0j
plan: 01
subsystem: render / orchestration
tags: [reliability, REL-01, MEET-04, calendar-degrade, trust-boundary]
requires: [src/render/cards.ts, src/index.ts, src/render/renderMessage.ts, src/calendar/gather.ts]
provides:
  - "RenderContext.calendarUnavailable (presentation-only boolean)"
  - "Independent Calendar vs Productive degrade in buildRenderContext"
  - "One muted calendars-unavailable note in the normal-card path"
affects: [src/render/renderMessage.ts, src/index.ts]
tech-stack:
  added: []
  patterns:
    - "Calendar and Productive degrade independently; calendar failure no longer collapses the card"
key-files:
  created: []
  modified:
    - src/render/cards.ts
    - src/index.ts
    - src/render/renderMessage.ts
    - src/render/__tests__/renderMessage.test.ts
    - src/__tests__/runNightly.test.ts
decisions:
  - "Calendar failure is a presentation-only boolean (calendarUnavailable), never a top-level variant — Productive figures stay trusted (REL-01)."
  - "Raw cal.sourceErrors (incl. the GOOGLE_SA_KEY reason) logged to console only via console.warn — never into the card or the webhook URL (T-L0J-01)."
metrics:
  duration: 18min
  completed: 2026-06-04
---

# Phase quick-260604-l0j Plan 01: Calendar-only failure keeps Productive figures Summary

Split calendar degrade from figures degrade so a Calendar-only outage posts the NORMAL card with real Productive figures plus one muted note, instead of collapsing to the 🤖 degraded card and leaking the GOOGLE_SA_KEY error with a doubled "Couldn't reach" prefix.

## What Was Built

- **`RenderContext.calendarUnavailable?: boolean`** (src/render/cards.ts) — a presentation-only flag, documented inline. It drives one muted note in the normal card and never selects a variant; it carries no raw error text.
- **Independent degrade in `buildRenderContext`** (src/index.ts) — `ctx.sourceErrors` now receives `g.sourceErrors` (Productive only). `cal.sourceErrors` is no longer merged into the degrade list; instead `calendarUnavailable` is threaded from `cal.sourceErrors.length > 0` (conditionally assigned only when true, so existing snapshot fixtures stay byte-identical). A guarded `console.warn` logs the verbatim `cal.sourceErrors` to the Actions console only.
- **Muted note in the normal-card path** (src/render/renderMessage.ts) — when `ctx.calendarUnavailable` is truthy, one muted `textParagraph` ("couldn't check calendars tonight — meeting flags skipped") is pushed into the verdict section. Not added to the degraded/holiday/closure paths (they return early). A calendar-only failure yields empty `worthALook` → no 📅 lines, automatically.

## Behaviour (acceptance bar)

- Productive/figures failure → 🤖 degraded card, returns 0 (REL-01, unchanged).
- Calendar-only failure (figures intact) → NORMAL card with real figures, NO 📅 lines, ONE muted note, posts, returns 0. Never contains "GOOGLE_SA_KEY", raw per-designer calendar error text, or a doubled "Couldn't reach" prefix.
- Both fail → 🤖 degraded card (Productive dominates), no calendar noise appended.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Split calendar degrade from figures degrade — add calendarUnavailable | a2accc1 |
| 2 | Render one muted calendars-unavailable note in the normal-card path only | 1e9db69 |
| 3 | Update orchestration tests — calendar-only normal card, productive degrades | afb98a5 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] runNightly case (b) stub yielded a 📅 line on a "failed" calendar**
- **Found during:** Task 3
- **Issue:** The shared `stubCalendarResult(sourceErrors)` helper always returns the WORTH golden event in `eventsByDesigner[LIAM]`, regardless of the sourceErrors argument. Driving case (b) through it produced a 📅 worth-a-look line even though the calendar had "failed", failing the `no 📅` assertion. A real per-designer calendar failure yields no events, only a sourceError.
- **Fix:** Built the case (b) calendar result inline by spreading `stubCalendarResult([...])` and overriding `eventsByDesigner` to empty arrays — modelling a realistic outage. Did NOT add a new stub builder (per plan's "reuse the helpers" instruction); reused the existing helper and adjusted the one unrealistic field.
- **Files modified:** src/__tests__/runNightly.test.ts
- **Commit:** afb98a5

## Threat Surface

No new threat surface introduced. The change reduces information disclosure (T-L0J-01): the GOOGLE_SA_KEY reason and raw calendar error text no longer reach the posted card — they are confined to `console.warn` in the Actions log. Tests assert the posted JSON never contains "GOOGLE_SA_KEY", "Calendar for", or a doubled "Couldn't reach" prefix on both the calendar-only and degraded paths.

## Verification

- `npx tsc --noEmit` — clean (0 errors).
- `npm test` — 225 pass / 0 fail (66 suites), up from 221 (+4 new tests).
- `src/calendar/__tests__/reconcile-render.e2e.test.ts` — green (2/2).
- variants.ts unchanged (already keys on sourceErrors only). Deterministic capacity/report/clock code untouched.

## Self-Check: PASSED

- FOUND: src/render/cards.ts (calendarUnavailable field)
- FOUND: src/index.ts (Productive-only sourceErrors + calendarUnavailable thread)
- FOUND: src/render/renderMessage.ts (muted note)
- FOUND: commit a2accc1
- FOUND: commit 1e9db69
- FOUND: commit afb98a5
