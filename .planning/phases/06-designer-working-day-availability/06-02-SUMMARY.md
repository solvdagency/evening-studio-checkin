---
phase: 06-designer-working-day-availability
plan: 02
subsystem: productive-ingestion
tags: [capacity, availability, productive, zod-boundary, tdd, trust-critical]
requires:
  - "src/productive/gather.ts (the ingestion composition root)"
  - "src/productive/schemas.ts AllocationResource (the resource-schema shape to mirror)"
  - "src/productive/mappers.ts safe()/dayInRange (the math + containment discipline)"
  - "src/domain/report.ts StudioReportInput.rosteredMinutes (the Plan-01 contract this feeds)"
provides:
  - "PersonResource / AvailabilityPeriod zod schemas (safeParse, tolerant)"
  - "RawPersonResource / RawAvailability raw types (inside src/productive only)"
  - "availabilityToWeekdayMinutes(availabilities, dayKey) — period select + 7/14-element + hours×60"
  - "rosteredMinutesForWeekday(weekdayMinutes, dayKey) — Mon=0..Sun=6 indexing"
  - "GatherResult.rosteredMinutes(designerId, dateKey) — the live rostered-minutes lookup"
affects:
  - "Plan 06-03 (rendering) reads the resulting off/underbooked statuses"
  - "src/index.ts (Plan 03) passes g.rosteredMinutes into computeStudioReport"
tech-stack:
  added: []
  patterns:
    - "dedicated /people?filter[id]=... pull (D-01) — NOT a /bookings sideload; availabilities is a person attribute"
    - "per-designer D-06 degrade: assessedDesigners = bookings-coverage ∩ readable-availability"
    - "all-zero mapped week = no usable rostered data → designer treated as unknown, omitted (never silent 7-day-off)"
    - "safe(...) coercion on every working_hours entry (T-06-03); zod safeParse at the boundary (T-06-04)"
key-files:
  created: []
  modified:
    - "src/productive/schemas.ts"
    - "src/productive/types.ts"
    - "src/productive/mappers.ts"
    - "src/productive/gather.ts"
    - "src/productive/__tests__/mappers.test.ts"
    - "src/productive/__tests__/gather.test.ts"
    - "src/__tests__/runNightly.test.ts"
decisions:
  - "D-01: availabilities pulled via a dedicated /people?filter[id]=... call, not a /bookings sideload (open D-01 resolved in plan)"
  - "D-01: covering period selected by [started_on, ended_on]; ended_on null = open-ended"
  - "D-02: working_hours read Mon=0..Sun=6, minutes = round(hours×60); 0 → not rostered"
  - "D-06: unreadable OR no-usable-period designer omitted from assessedDesigners → 'couldn't read', never flat-450"
  - "D-08: 14-element identical → week 1 silently; differing → console.warn + week 1 (parity deferred)"
metrics:
  duration_min: 9
  tasks: 2
  files: 7
  completed: "2026-06-04"
requirements: [CAP-06]
---

# Phase 6 Plan 02: Productive Availability Ingestion Summary

Pulled each monitored designer's real working-day pattern from Productive `person.availabilities`, parsed it at the zod boundary, mapped it to exact per-weekday rostered minutes, and exposed a `rosteredMinutes(designerId, dateKey)` lookup on `GatherResult` — the live data half of CAP-06 that replaces the flat-450 assumption (Anisha off Wed & Fri now flows through as real 0-rostered days), with an unreadable designer degrading to "couldn't read" instead of inventing open time (D-06).

## What Was Built

**Task 1 (TDD): availabilities schema + raw type + per-weekday minutes mapper**
- `schemas.ts`: `AvailabilityPeriod` + `PersonResource` zod schemas mirroring `AllocationResource` — `id`/`type: "people"`/`.loose()` attributes carrying an optional `availabilities` array. `working_hours` length is NOT pinned (7 vs 14 is the mapper's job, D-08); `ended_on` nullable (D-01). safeParse-only (zero `.parse(` in the file).
- `types.ts`: `RawAvailability` / `RawPersonAttributes` / `RawPersonResource` in the JSDoc-heavy `RawBookingAttributes` style; documented as src/productive-only (boundary rule).
- `mappers.ts`: `availabilityToWeekdayMinutes(availabilities, dayKey)` selects the covering period (`ended_on === null || dayKey <= ended_on`, D-01); for `working_hours` length 7 uses it directly, length 14 compares week 1 vs week 2 (equal → week 1 silently, differing → `console.warn` + week 1, D-08), any other length → 7-element all-zero (defensive, T-06-04); each entry → `Math.round(safe(hours) * 60)` (T-06-03). `rosteredMinutesForWeekday(weekdayMinutes, dayKey)` derives the Mon=0..Sun=6 index from a luxon `DateTime` in `STUDIO_ZONE` (`.weekday - 1`), out-of-range/invalid-date → 0, never throws.
- 30 new mapper assertions pin: 7-element standard week, Anisha shape (0 on Wed/Fri, 450 Mon/Tue/Thu), 14-element identical → week 1, 14-element differing → week 1, non-finite → 0, unexpected length → all-zero, period selection with `ended_on: null`, a date before all periods → 0, and the full Mon..Sun weekday indexing.

**Task 2 (TDD): /people pull + per-designer degrade + rosteredMinutes lookup**
- `gather.ts`: a dedicated `/people?filter[id]=<roster>` pull (step 7b), each entry parsed via `PersonResource.safeParse` (indexProjects idiom). A successful person → `availabilityToWeekdayMinutes` → recorded in `availabilityByDesigner`. A failed pull degrades (sourceError, no designer added); a single-entry validation failure skips only that designer; a present designer whose mapped week is entirely zero (no usable period) is treated as unknown and skipped (never a silent 7-day-off).
- `assessedDesigners` is now the INTERSECTION of bookings-coverage AND readable-availability (D-06) — an availability-unreadable designer is omitted so the report names them in `missingDesigners`. No flat-450 fallback anywhere (grep gate clean).
- `GatherResult.rosteredMinutes(designerId, dateKey)` built from the per-weekday map (unknown designer/date → 0, never throws); the `degraded()` early-return exposes `rosteredMinutes: () => 0`.
- 8 new gather assertions: `/people` query scoping, happy-path rostered minutes (450 Liam/Ella, 0 Anisha Wed/Fri), end-to-end `computeStudioReport` showing Anisha "off" on a Friday target, failed-/people → all missing, single-entry-failure → only that designer missing, no-covering-period → 0 + omitted, unknown lookup → 0, and the bookings∩availability intersection.

## TDD Gate Compliance

Both tasks followed RED → GREEN within a single feat commit each (RED verified by running the test file before implementation existed; the new imports/fields forced failures, confirmed before writing the implementation):
- Task 1: RED confirmed (import of non-existent mapper functions failed); GREEN `e4721fc` — `feat(06-02)` schema + types + mapper, mappers 38/38.
- Task 2: RED confirmed (8 failures — `out.rosteredMinutes` undefined + new availability behaviour); GREEN `b1d6207` — `feat(06-02)` /people pull + lookup, gather 26/26.

No standalone `test(...)` commit was created — RED and GREEN were committed together per task (verified-failing-first, then implemented). Both feat commits exist; no REFACTOR commit needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] runNightly test stub missing the new required GatherResult field**
- **Found during:** Task 2 (tsc --noEmit after the GatherResult change)
- **Issue:** `src/__tests__/runNightly.test.ts` builds a mock `GatherResult` directly; adding the required `rosteredMinutes` field broke `tsc`.
- **Fix:** Added `rosteredMinutes: () => 450` to the stub (flat standard day) so the existing present-but-empty → underbooked render assertions hold; the per-designer availability behaviour is exercised in gather.test.ts.
- **Files modified:** src/__tests__/runNightly.test.ts
- **Commit:** b1d6207

### Beyond-the-letter judgement call (D-06)

The plan's Task-2 behaviour list states a present designer with no covering period → `rosteredMinutes` 0. The plan did not explicitly say whether such a designer is omitted from `assessedDesigners`. Honoring the D-06 must_have ("never invent capacity, never silently mislabel"), a designer whose mapped week is entirely zero (no usable rostered data) is treated as UNKNOWN and omitted — otherwise they would silently read as "off" every weekday (a fabricated 7-day-off week, arguably worse than "couldn't read"). This is recorded as a sourceError and pinned by the no-covering-period test. Open decision D-01 (dedicated /people pull vs bookings sideload) was resolved by the planner in the PLAN; implemented as written.

## Verification

- `node --import tsx --test "src/productive/__tests__/mappers.test.ts"` — 38/38 pass.
- `node --import tsx --test "src/productive/__tests__/gather.test.ts"` — 26/26 pass.
- Both target files together — 64/64 pass.
- `npm test` (whole project) — 300/300 pass, no regressions.
- `npx tsc --noEmit` — exit 0 (clean).
- `grep -c "\.parse(" src/productive/schemas.ts` — 0 (safeParse discipline intact).
- `grep -n "450\|TARGET_MINUTES" src/productive/gather.ts` — only the comment documenting the absence of a flat-fallback path; no new flat-450 availability path.

## Success Criteria

- [x] Per-designer per-weekday rostered minutes read from live Productive availabilities (SC-1).
- [x] 14-element format + period-covering-the-date handled (SC-3).
- [x] Availability-unreadable designer degrades safely to "couldn't read", run still produces a report (SC-4).
- [x] All mapping arithmetic exact integer minutes, non-finite coerced, fully unit-tested (SC-5).

## Notes for Downstream Plans

- **Plan 06-03 (rendering, D-05):** `src/index.ts` must add `rosteredMinutes: g.rosteredMinutes` to the StudioReportInput it builds (the field is now exposed on GatherResult). Anisha's Wed/Fri now arrive as `"off"` — the renderer resolves the "not in {day}" wording without a new status value.
- The mapper exports `availabilityToWeekdayMinutes` returning a date-free 7-element array; the date dimension is added by `rosteredMinutesForWeekday`. Re-use both rather than re-deriving weekday math.

## Threat Flags

None — no new security surface beyond the documented `/people` trust boundary already in the plan's threat register (T-06-03..T-06-06). The `/people` pull is read-only, scoped to three known person ids; every entry passes zod safeParse and every numeric passes `safe(...)`.

## Self-Check: PASSED

- FOUND: src/productive/schemas.ts (modified — PersonResource/AvailabilityPeriod)
- FOUND: src/productive/types.ts (modified — RawAvailability/RawPersonResource)
- FOUND: src/productive/mappers.ts (modified — availabilityToWeekdayMinutes/rosteredMinutesForWeekday)
- FOUND: src/productive/gather.ts (modified — /people pull + rosteredMinutes)
- FOUND: src/productive/__tests__/mappers.test.ts (modified)
- FOUND: src/productive/__tests__/gather.test.ts (modified)
- FOUND: src/__tests__/runNightly.test.ts (modified — stub fix)
- FOUND commit: e4721fc (Task 1 GREEN)
- FOUND commit: b1d6207 (Task 2 GREEN)
