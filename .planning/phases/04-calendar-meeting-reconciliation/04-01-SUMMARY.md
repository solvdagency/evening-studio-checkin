---
phase: 04-calendar-meeting-reconciliation
plan: 01
subsystem: calendar-ingestion
tags: [calendar, googleapis, dwd, zod-boundary, productive, open-q1]
requires:
  - "src/productive/client.ts::Result (reused, not redefined)"
  - "src/productive/gather.ts::GatherResult (extended)"
  - "src/domain/clock.ts::nextWorkingDay (pure)"
  - "src/holidays.ts::buildHolidaySet/yearsForWindow"
  - "googleapis ^173 (new dep)"
provides:
  - "src/calendar/auth.ts::buildCalendarClient(saKey, subject) + loadSaKey()"
  - "src/calendar/schemas.ts::CalendarEventResource (tolerant safeParse-only)"
  - "src/calendar/client.ts::listDayEvents (Result, non-throwing)"
  - "src/calendar/gather.ts::gatherCalendar → CalendarResult { eventsByDesigner, sourceErrors }, FilteredEvent, CalendarGatherDeps"
  - "GatherResult.bookedClientsByDesignerDay (Open Q1 resolved)"
  - "src/config.ts: MEETING_IGNORE_LIST, ClientAlias, CLIENT_ALIAS_MAP, DESIGNER_CALENDAR_EMAILS, WORK_DAY_START/END"
affects:
  - "src/calendar/filter.ts + reconcile.ts (plan 03 — consume FilteredEvent + bookedClientsByDesignerDay)"
  - "src/calendar/spike.ts (plan 02 — reuse buildCalendarClient + the config seeds)"
  - "src/index.ts (later — wire gatherCalendar as an additive source; NOT this plan)"
tech-stack:
  added: ["googleapis ^173.0.0 (Google Calendar v3 client, bundles google-auth-library JWT)"]
  patterns:
    - "Non-throwing Result boundary (reused from productive/client.ts)"
    - "Tolerant zod .safeParse boundary (mirrors productive/schemas.ts)"
    - "Degrade-via-sourceErrors additive source (mirrors productive/gather.ts)"
    - "Injected stubbable fetcher for offline/credential-free determinism"
key-files:
  created:
    - "src/calendar/auth.ts"
    - "src/calendar/schemas.ts"
    - "src/calendar/client.ts"
    - "src/calendar/gather.ts"
    - "src/calendar/__tests__/schemas-client.test.ts"
    - "src/calendar/__tests__/gather.test.ts"
    - "src/calendar/__fixtures__/events-day.json"
  modified:
    - "package.json (+ googleapis ^173.0.0)"
    - "package-lock.json"
    - "src/config.ts (+ calendar config constants)"
    - "src/productive/gather.ts (+ bookedClientsByDesignerDay)"
    - "src/productive/__tests__/gather.test.ts (+ 2 Open Q1 assertions)"
decisions:
  - "Calendar layer imports the PURE domain helpers (nextWorkingDay) + types (DesignerId/STUDIO_ZONE) exactly as the sibling productive/gather.ts does — the real trust boundary is 'ingestion never recomputes hours + domain never imports ingestion', which holds. See Deviations."
  - "bookedClientsByDesignerDay resolved from the already-fetched bookings `included` via task→project→company linkage — NO second Productive call (Open Q1)."
  - "gatherCalendar emits ALL validated events (no filtering yet) — mechanical filters + ignore-list are plan 03."
metrics:
  tasks: 3
  files_created: 7
  files_modified: 5
  tests_total: 168
  completed: "2026-06-04"
---

# Phase 4 Plan 01: Calendar Ingestion + Open Q1 Summary

The one new external surface of Phase 4 — an unattended, degradable Google Calendar read for the three designers, built as a non-throwing twin of `src/productive/` — plus the resolution of Open Question 1: each designer's target-day booked-client company set, surfaced from data the Productive pull already fetched.

## What Was Built

- **`googleapis ^173.0.0`** added as a committed dependency (verified still latest on npm at plan time; package.json + lockfile reconciled).
- **Calendar config** in `src/config.ts` (committed, non-secret): `MEETING_IGNORE_LIST` (D-07 specific phrases), `ClientAlias` + `CLIENT_ALIAS_MAP` (FDC seed, D-03/D-09), `DESIGNER_CALENDAR_EMAILS` (three live-confirmed emails keyed by person id), `WORK_DAY_START`/`WORK_DAY_END` (D-08). A SECRET docblock documents that the SA key is read from `process.env.GOOGLE_SA_KEY`, never committed.
- **`src/calendar/auth.ts`** — `loadSaKey()` (degrade-on-missing/malformed, never logs the key) + `buildCalendarClient(saKey, subject)` minting a per-designer DWD client via `google.auth.JWT` with the read-only `calendar.readonly` scope (RESEARCH Pattern 1).
- **`src/calendar/schemas.ts`** — `CalendarEventResource`, tolerant `.loose()`, `id` required and everything else optional; `safeParse`-only (no `.parse` wrapper exported).
- **`src/calendar/client.ts`** — `listDayEvents(client, timeMin, timeMax)` wraps `events.list({ singleEvents: true, … })` and returns a `Result`; any thrown client becomes `{ ok: false, error }` and the error string carries no SA-key material (T-04-01). Reuses `Result` from `productive/client.ts` (no redefinition).
- **`src/calendar/gather.ts`** — `gatherCalendar(deps)` derives the target day with the SAME `nextWorkingDay` derivation as Productive, builds an Australia/Sydney day window, loops the three designer emails calling an injectable `fetchEvents`, validates each event, maps survivors to a clean `FilteredEvent`, and degrades per designer via `sourceErrors`. Never throws; reads no system clock (only injected `now`).
- **`GatherResult.bookedClientsByDesignerDay`** — Open Q1 resolved: a `Record<DesignerId, Set<string>>` built from the already-fetched bookings `included` (task→project→company linkage), no second `/bookings` call. Every assessed designer initialised to an empty Set; `{}` on a degraded pull. Domain `Booking` left untouched.

## How It Was Verified

- `node --import tsx --test "src/**/*.test.ts"` → **168/168 pass** (calendar boundary + gather tests added; no Productive regression).
- TDD gates per task: RED `test(...)` commit then GREEN `feat(...)` commit for Tasks 2 and 3.
- Boundary checks: `listDayEvents` returns a Result and never throws; the error string contains no `private_key`/`BEGIN`; no `console.*` statements in the calendar layer; `gatherCalendar` reads no system clock; `GOOGLE_SA_KEY` is read only in `auth.ts`.
- Prettier: all touched files conform to the committed style.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Calendar layer imports pure domain helpers/types (resolves a plan-internal contradiction)**
- **Found during:** Task 3.
- **Issue:** The plan's `<verification>` line states "`src/calendar/` imports nothing from `src/domain/`", while the Task 3 `<action>` and `<interfaces>` explicitly require using `nextWorkingDay(now, holidays)` (from `src/domain/clock.ts`) and the `DesignerId` type (from `src/domain/types.ts`) "so calendar and productive agree on tomorrow." These two instructions cannot both be satisfied literally.
- **Resolution:** Followed the more specific action instruction. `gatherCalendar` imports only the PURE clock helper + `DesignerId`/`STUDIO_ZONE` types — identical to what the sibling `src/productive/gather.ts` already does. The actual trust boundary (CONTEXT line 177 / RESEARCH line 271/506) is *"`src/domain` must not import ingestion layers, and ingestion must never recompute hours"* — both hold: nothing in `src/domain` imports the calendar layer, and `gatherCalendar` recomputes no minutes.
- **Files:** `src/calendar/gather.ts`.
- **Commit:** 88a4272.

**2. [Rule 2 - Critical] Productive gather test fixture built inline for the company chain**
- **Found during:** Task 3.
- **Issue:** The existing `bookings-page.json` fixture's `included` carries only `services`/`tasks`, and the tasks' `project` relationship is `{meta:{included:false}}` — so it cannot exercise the task→project→company linkage `bookedClientsByDesignerDay` depends on.
- **Resolution:** Added a self-contained test that builds a booking + `included` (task→project→company id `1333899`) inline, asserting the company id lands in the designer's target-day Set and that a designer with no client booking gets an empty (not undefined) Set. No production fixture was altered.
- **Files:** `src/productive/__tests__/gather.test.ts`.
- **Commit:** 88a4272.

### Authentication Gates

None — the live calendar read is not exercised in this plan (all tests use a stubbed `fetchEvents`; no network/credentials needed). The `GOOGLE_SA_KEY` secret chain was already provisioned (STATE.md, 2026-06-04).

## Known Stubs

None. `gatherCalendar` deliberately emits ALL validated events with no mechanical filtering — that is the documented Task 3 scope (filters are plan 03), not a stub: the full event shape is intentionally surfaced for the spike (plan 02) and the filter/reconcile work (plan 03).

## Notes for Downstream Plans

- Plan 03's `filter.ts`/`reconcile.ts` consume `FilteredEvent` (which carries `startDateTime`/`startDate`/`eventType`/`responseStatusSelf`/`attendeeCount` for the mechanical filters) + `bookedClientsByDesignerDay`.
- `gatherCalendar` is NOT yet wired into `src/index.ts` — that composition (additive source + `sourceErrors` concat) is a later plan, consistent with this plan's `files_modified`.
- The solo-event representation (A1) and the alias-map breadth (A3) remain spike-pinned (plan 02) by design.

## Self-Check: PASSED

All 7 created files present on disk; all 5 task commits (cf37472, 213baaf, 0cb80a3, aa184fe, 88a4272) exist in git history. Full suite 168/168 green.
