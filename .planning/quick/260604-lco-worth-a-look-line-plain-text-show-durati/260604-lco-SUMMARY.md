---
phase: quick-260604-lco
plan: 01
subsystem: calendar + render
tags: [calendar, reconcile, render, cards-v2, presentation, pilot-feedback]
requires:
  - "FilteredEvent (src/calendar/gather.ts)"
  - "reconcileMeetings (src/calendar/reconcile.ts)"
  - "renderTemplate / RenderContext (src/render/)"
provides:
  - "humanizeDuration(minutes) — pure presentation-only duration label"
  - "FilteredEvent.durationMinutes (start↔end diff, no clock)"
  - "WorthALookItem = { title; durationMinutes? } (no start/link)"
  - "Plain-text 📅 line: '📅 {title} · {duration}, not in Productive'"
affects:
  - "MSG-06 (deep-link removed — intentional override)"
  - "D-14 (sub-line wording changed — intentional override)"
tech-stack:
  added: []
  patterns:
    - "Duration is a display transform (humanizeDuration), never capacity/hour math (trust rule, mirrors round.ts)"
    - "durationMinutes computed from the event's own RFC3339 start/end — no system clock read"
key-files:
  created:
    - src/calendar/duration.ts
    - src/calendar/__tests__/duration.test.ts
  modified:
    - src/calendar/schemas.ts
    - src/calendar/gather.ts
    - src/calendar/reconcile.ts
    - src/render/rows.ts
    - src/render/cards.ts
    - src/calendar/__fixtures__/labelled-events.json
    - src/calendar/__fixtures__/events-day.json
    - src/calendar/__tests__/gather.test.ts
    - src/calendar/__tests__/reconcile.test.ts
    - src/calendar/__tests__/reconcile-render.e2e.test.ts
    - src/render/__tests__/renderMessage.test.ts
    - src/render/__tests__/fixtures/worth-a-look.json
decisions:
  - "📅 flagged-meeting line is plain muted text ending 'not in Productive' — no <a href>, no 'worth a look' (Liam's chosen mockup line)"
  - "Half-hour-or-less durations read as '30 min' (not '0.5 hours'); dedicated src/calendar/duration.ts helper"
metrics:
  duration: ~20min
  completed: 2026-06-04
---

# Quick 260604-lco: Worth-a-look line → plain text, show duration Summary

Reworked the flagged-meeting calendar sub-line per Liam's pilot feedback: it now renders as plain muted text `📅 {title} · {duration}, not in Productive` (no hyperlink, no "worth a look"), with the meeting's humanized duration replacing the start time — fed by a new end→durationMinutes data path through schemas → gather → reconcile → render and a pure `humanizeDuration` helper.

## What changed

- **`src/calendar/duration.ts` (new):** pure `humanizeDuration(minutes)` — rounds to nearest minute, then bands: whole hours ("1 hour"/"2 hours"), exact half hours h≥1 ("1.5 hours"), sub-hour ("30 min", "45 min"), mixed ("1h 15m"). Documented as presentation-only (trust rule), no clock, no capacity math. TDD: RED commit then GREEN.
- **`schemas.ts`:** added optional `end: EventDateTime` to `CalendarEventResource` (reuses the existing tolerant `.loose()` shape; drift on `end` still skips the event, never throws — T-04-03).
- **`gather.ts`:** `FilteredEvent.durationMinutes?` computed from the event's own `start.dateTime → end.dateTime` (RFC3339 offsets carry the zone; plain luxon diff, `Math.round`). Undefined when not timed or end missing. No system-clock read.
- **`reconcile.ts`:** `WorthALookItem` is now `{ title; durationMinutes? }` — `start` and `link` removed; the push carries `event.durationMinutes`.
- **`rows.ts`:** 📅 loop rebuilt as plain muted text — `📅 {muted(escaped title)} · {muted(humanized duration)}, {muted("not in Productive")}`. When `durationMinutes` is missing/non-finite the duration segment is omitted → `📅 {title}, not in Productive` (never "undefined"/"NaN"). Title still escaped (T-04-11); no `<a href>`.
- **`cards.ts`:** `RenderContext.worthALook` type → `{ title; durationMinutes? }`, docblock updated to the new plain-text format.
- **Fixtures/tests:** added `end` to the timed golden events (COVERED 30 min, WORTH 60 min, events-day FDC 60 min); rewrote `worth-a-look.json` to carry `durationMinutes` (60 + 90 for the XSS-title entry); updated gather/reconcile/e2e/renderMessage tests to assert the new line (no hyperlink, no "worth a look", duration + "not in Productive"), plus a new missing-duration test.

## Traceability note (intentional overrides)

This change **intentionally OVERRIDES MSG-06** (the deep-linked title is removed — the card never contains the htmlLink for a flagged item anymore) and **changes the D-14 sub-line wording** (duration + "not in Productive" instead of start time + "worth a look"), per Liam's direct pilot feedback: the deep link wasn't useful in the pilot, and duration + "not in Productive" reads more like an actionable nudge.

## Acceptance verification

- Flagged line renders `📅 {escaped title} · {humanized duration}, not in Productive` with NO `<a href>` and NO "worth a look" (e.g. `📅 FDC IPO Launch Check-In · 1 hour, not in Productive`). ✓
- Missing `durationMinutes` → `📅 {escaped title}, not in Productive`, no "undefined"/"NaN", no stray " · ". ✓
- Both golden cases still resolve: IPO Launch flagged (60 min → "1 hour"), Quick FDC NOT flagged (covered). ✓
- Trust boundary intact: no hour/capacity math touched; durationMinutes is a start↔end diff, not a clock read; runNightly remains the single clock boundary. ✓

## Deviations from Plan

None — plan executed exactly as written. The one in-flight fix was a test-only regex that didn't account for the `</font>` tag between the escaped title and the comma; corrected the assertion (no production change).

## Finish gates

- `npm test`: 240 passed, 0 failed (71 suites). ✓
- `npx tsc --noEmit`: clean, 0 errors. ✓

## Known Stubs

None.

## Self-Check: PASSED

- Created files exist: `src/calendar/duration.ts`, `src/calendar/__tests__/duration.test.ts` — FOUND.
- Commits exist: 500c8de (RED test), e8cfd0e (humanizeDuration), 78b7362 (data path), a36601e (render) — all on HEAD.
