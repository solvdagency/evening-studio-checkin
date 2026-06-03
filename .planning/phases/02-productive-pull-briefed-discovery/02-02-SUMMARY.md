---
phase: 02-productive-pull-briefed-discovery
plan: 02
subsystem: ingestion
tags: [productive, mappers, holidays, date-holidays, luxon, capacity, D-09, D-11, D-07, D-13]

# Dependency graph
requires:
  - phase: 01-core-math-clock
    provides: "Booking/Absence/HolidaySet contracts, TARGET_MINUTES, isWorkingDay — the mapper targets and reuses these"
  - phase: 02-productive-pull-briefed-discovery
    plan: 01
    provides: "Corrected zod boundary schemas (no booking_type/approval_status; service vs event relationship), confirmed org-id 34092, captured /bookings fixture"
provides:
  - "src/holidays.ts — buildHolidaySet(years, closures) + yearsForWindow: NSW public holidays + studio closures → clock-compatible HolidaySet (D-13)"
  - "src/productive/mappers.ts — minutesOnDay (D-09 all 3 methods), workingDaysInRange (reuses clock), mapToBookingsAndAbsences (service→Booking / event→Absence, D-11/D-07/D-12)"
  - "Proven end-to-end slice: raw /bookings fixture → Booking[]/Absence[]/HolidaySet → computeStudioReport without throwing"
affects: [02-04-gather, productive-ingestion, capacity-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mapper boundary: raw Productive shapes never cross into src/domain — only Booking/Absence leave mappers.ts (one-way, type-only domain imports)"
    - "Defensive minute math mirrors capacity.safeMinutes: NaN/null→0, unknown method→0, method-3 divisor guarded >0 — never throws"
    - "HolidaySet keys derived from h.start via luxon toISODate in STUDIO_ZONE, never raw h.date (Pitfall 4)"
    - "Reuse over re-derive: workingDaysInRange calls clock.isWorkingDay; mappers import TARGET_MINUTES from domain"

key-files:
  created:
    - src/holidays.ts
    - src/holidays.test.ts
    - src/productive/mappers.ts
    - src/productive/__tests__/mappers.test.ts
  modified: []

key-decisions:
  - "Open Q3 RESOLVED: holidays in a method-3 booking's date range DO reduce the working-days divisor — a closed day is not a day the total spreads across; consistent with the clock."
  - "Work-vs-absence (D-11) is read from the service vs event RELATIONSHIP, not a booking_type attribute (honoring 02-01's corrected live schema): populated service → Booking, populated event → Absence."
  - "Mapper input type RawBookingForMapping is a structural type matching the corrected zod schema shape (no booking_type/approval_status); the stale src/productive/types.ts RawBookingAttributes was NOT used and is now out of date (flagged below, left untouched per scope)."
  - "Person id is read from the person relationship linkage; in the live fixture person is { meta: { included: false } } so designerId resolves empty — gather (02-04) must include person or group by queried person_id. Not a mapper bug; documented for the next plan."

patterns-established:
  - "yearsForWindow(targetDay) → [year, year+1] so a Dec→Jan window always has both years' holidays loaded"
  - "Date-only string comparison (started_on <= dayKey <= ended_on) for range containment — exact, zone-irrelevant"

requirements-completed: [BRIEF-01]

# Metrics
duration: 12min
completed: 2026-06-03
---

# Phase 2 Plan 02: Productive Mappers & Holiday Set Summary

**Validated Productive bookings now normalize to exact per-day minutes across all three booking methods (D-09) and split cleanly into Phase-1 `Booking[]`/`Absence[]`, while NSW public holidays + studio closures produce a clock-compatible `HolidaySet` — the capacity half of the pipeline runs end-to-end into `computeStudioReport`.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 (both `type=auto`, `tdd=true`)
- **Files:** 4 created, 0 modified
- **Tests:** 29 new (9 holidays + 20 mappers); full suite 95/95 green; `tsc --noEmit` clean

## Accomplishments

- **`src/holidays.ts`** — `buildHolidaySet(years, closures)` constructs `new Holidays("AU","NSW")`, enumerates the given years, filters `type === "public"`, and derives each key from `h.start` via luxon `toISODate()` in `STUDIO_ZONE` (NOT the raw `h.date` "YYYY-MM-DD HH:mm:ss" — Pitfall 4). Committed `STUDIO_CLOSURES` merge into the same set. `yearsForWindow(targetDay)` returns `[year, year+1]` so a December-Friday run targeting January still has next-year holidays.
- **`src/productive/mappers.ts`** — three exports:
  - `minutesOnDay(attrs, dayKey, workingDays)` — D-09: method 1 `time`, method 3 `total_time / workingDays` (guarded `> 0`), method 2 `round((percentage/100) * 450)`, unknown → 0; target day outside `[started_on, ended_on]` → 0; all numeric inputs through `safe(...)` (NaN/null → 0).
  - `workingDaysInRange(started_on, ended_on, holidays)` — counts inclusive weekdays excluding holidays by reusing the Phase-1 clock's `isWorkingDay`; inverted range → 0.
  - `mapToBookingsAndAbsences(rawBookings, targetDayKey, holidays)` — splits `service` → `Booking[]`, `event` → `Absence[]`; `isTentative ⟺ draft===true` (D-07); all non-canceled absences count (D-12); canceled defensively skipped; neither-linkage bookings dropped. Output is clean domain types only.
- **End-to-end smoke (recommended in plan):** mapped the real captured `bookings-page.json` (6 bookings) → `Booking[]`/`Absence[]` + `buildHolidaySet` → `computeStudioReport` with no throw. The method-3 480-min/Jun 3–4 booking correctly yields 240 min on the Jun-4 target; Jun-3-only bookings yield 0 on the Jun-4 target. Confirms the D-09 math against live data.

## Task Commits

1. **Task 1: Holiday set (D-13)** — `acbf4ca` (feat)
2. **Task 2: Per-day minutes + Booking/Absence mappers (D-09/D-11/D-07)** — `b7dc426` (feat)

(Each task wrote test + implementation together; RED was confirmed by running the test against the missing module before each implementation, then GREEN.)

## Decisions Made

- **Open Q3 resolved — holidays reduce the method-3 divisor.** A day the studio is closed is not a day a total-hours booking spreads across, and it keeps `workingDaysInRange` consistent with the clock's `isWorkingDay`. Unit-tested: `2026-06-03→04` with `2026-06-04` as a holiday → divisor 1.
- **Work-vs-absence from the relationship, not an attribute.** Per plan 02-01's live probe the `/bookings` response has no `booking_type` attribute, so D-11 is determined by which relationship is populated (`service` = work, `event` = absence). This honors the corrected schema; the plan's `<behavior>` wording ("booking_type=service/event") is satisfied by the relationship mechanism.
- **Mapper input type.** Defined a local structural `RawBookingForMapping` matching the corrected zod schema shape rather than importing the stale `src/productive/types.ts RawBookingAttributes` (which still carries the non-existent `booking_type`/`approval_status` — see Issues).

## Deviations from Plan

None — both tasks executed as written. The only adaptation is using the `service`/`event` relationship for the D-11 split instead of a `booking_type` attribute, which is mandated by 02-01's corrected live schema (the prior-wave authority the plan itself defers to), not a deviation from intent.

## Known Stubs

None. Both modules are fully wired and tested. (The unresolved `designerId` in the fixture smoke check is a missing upstream `include=person`, owned by 02-04 — not a stub in this plan's code.)

## Issues Encountered

- **Stale `src/productive/types.ts`.** `RawBookingAttributes` there still declares `booking_type: string` and `approval_status: number | null`, which plan 02-01 proved do not exist on the live resource. The mapper deliberately does NOT consume that interface (it uses the corrected schema shape instead), so there is no runtime impact. Left untouched per scope discipline. **Follow-up:** a later plan (likely 02-04) should reconcile `src/productive/types.ts` with the corrected `schemas.ts`, or drop the unused raw interface, to avoid future confusion.
- **Fixture `person` not sideloaded.** Live bookings return `person: { meta: { included: false } }`, so `mapToBookingsAndAbsences` resolves an empty `designerId` for the fixture and the smoke-check designers show zero confirmed minutes. This is expected: the gather query (02-04) must add `include=person` (or attribute bookings by the queried `person_id`) for designer IDs to match the roster. Flagged for 02-04; the mapper reads `person.data.id` correctly when present.

## Threat Surface

All four plan threats are mitigated and unit-tested:

- **T-02-05** (raw shapes leaking into domain): `grep -rl "productive" src/domain` returns nothing; mappers emit only `Booking`/`Absence`; domain imports are `import type` only.
- **T-02-06** (divide-by-zero / NaN in D-09): `workingDays > 0` guard, `safe(...)` coercion, `default → 0`; tested with `workingDaysInRange=0`, `NaN total_time`, `null` figures.
- **T-02-07** (holiday key mismatch, Pitfall 4): keys from `h.start` via `toISODate()`; test asserts `2026-01-26` matches the clock format and flips `isWorkingDay` to false.
- **T-02-08** (wrong tentative signal): `isTentative ⟺ draft===true`; `grep "approval_status" src/productive/mappers.ts` finds only an explanatory comment, not code.

## Next Phase Readiness

- The capacity half of the pipeline is real: validated raw bookings → exact per-day minutes → `Booking[]`/`Absence[]` → `computeStudioReport`, end-to-end, no throw.
- **For 02-04 (gather):** add `include=person` (or group bookings by the queried `person_id`) so `designerId` resolves to the roster; wire `STUDIO_CLOSURES` + `yearsForWindow(targetDay)` into `buildHolidaySet`; reconcile or drop the stale `src/productive/types.ts` raw interface.
- No blockers.

## Self-Check: PASSED

- Files: src/holidays.ts, src/holidays.test.ts, src/productive/mappers.ts, src/productive/__tests__/mappers.test.ts — all FOUND.
- Commits: acbf4ca, b7dc426 — both present in git log.
- Verification: full suite 95/95, `tsc --noEmit` exit 0, acceptance greps confirmed, end-to-end smoke ran without throwing.

---
*Phase: 02-productive-pull-briefed-discovery*
*Completed: 2026-06-03*
