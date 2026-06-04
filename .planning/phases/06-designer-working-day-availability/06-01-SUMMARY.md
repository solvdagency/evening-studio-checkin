---
phase: 06-designer-working-day-availability
plan: 01
subsystem: domain
tags: [capacity, rollup, availability, tdd, trust-critical]
requires:
  - "src/domain/capacity.ts availableMinutes/computeDesignerDay (the choke point)"
  - "src/domain/report.ts computeStudioReport (composition root)"
provides:
  - "availableMinutes(rosteredMinutesForDay, absenceMinutesForDay) — rostered-minutes basis"
  - "computeDesignerDay(designerId, bookings, rosteredMinutesForDay, absenceMinutesForDay)"
  - "StudioReportInput.rosteredMinutes(designerId, dateKey) lookup contract"
affects:
  - "Plan 06-02 (Productive ingestion) supplies the rosteredMinutes lookup"
  - "Plan 06-03 (rendering) reads the resulting off/underbooked statuses"
tech-stack:
  added: []
  patterns:
    - "safeMinutes coercion applied to BOTH availableMinutes inputs (non-finite -> 0)"
    - "injected-deps determinism: rosteredMinutes lookup mirrors holidays/roster injection"
    - "omitted optional input = flat TARGET_MINUTES fallback (degrade-safe)"
key-files:
  created: []
  modified:
    - "src/domain/capacity.ts"
    - "src/domain/types.ts"
    - "src/domain/report.ts"
    - "src/domain/__tests__/capacity.test.ts"
    - "src/domain/__tests__/report.test.ts"
decisions:
  - "D-02/D-03: available minutes derive from rostered minutes, not flat TARGET_MINUTES"
  - "D-04: a 0-rostered day reuses the existing \"off\" status — no new DayStatus enum value"
  - "D-07: rest-of-week rollup (CAP-05) uses real per-weekday rostered minutes"
  - "D-06: a missing/0 rostered entry resolves to 0 — never fabricates 450"
metrics:
  duration_min: 3
  tasks: 2
  files: 5
  completed: "2026-06-04"
requirements: [CAP-06]
---

# Phase 6 Plan 01: Rostered-Minutes Capacity Basis Summary

Moved the single capacity choke point off the flat 450-minute constant onto each designer's real rostered minutes, then threaded that basis through `computeDesignerDay` and the rest-of-week rollup so a non-standard week (e.g. off Wed & Fri) is never flagged underbooked on an unworked day — the trust-critical arithmetic core of CAP-06.

## What Was Built

**Task 1 (TDD RED -> GREEN): rostered-minutes basis for `availableMinutes` + `computeDesignerDay`**
- `availableMinutes(rosteredMinutesForDay, absenceMinutesForDay)` now returns `Math.max(0, safeMinutes(rostered) - safeMinutes(absence))`. The basis is rostered minutes, not `TARGET_MINUTES`.
- `safeMinutes` is applied to BOTH inputs — non-finite rostered OR absence coerces to 0, never NaN/Infinity (D-19 / T-06-01).
- `computeDesignerDay` gained a `rosteredMinutesForDay` argument; a 0-rostered day yields `availableMin === 0`, which the UNCHANGED `classifyDay` already maps to `"off"` (D-04 — no new enum value, `classifyDay`/`bookedMinutes`/`DesignerResult` untouched).
- Capacity test suite extended to the new signatures + new cases (0-rostered -> off, rostered 450 with nothing booked -> underbooked, non-finite coercion on both args).

**Task 2: thread rostered minutes through `computeStudioReport` (CAP-05 rollup fix)**
- Added `StudioReportInput.rosteredMinutes?: (designerId, dateKey) => number`. Omitting it falls back to a flat `TARGET_MINUTES` day (preserves the pre-CAP-06 contract for simple callers).
- Both the target-day per-designer path and the rest-of-week rollup loop now resolve rostered minutes via the lookup; a not-rostered window day contributes 0 to `totalMin` (D-07) — no fabricated 450 (D-06).
- `TARGET_MINUTES` JSDoc re-documented in `types.ts` as the standard 7.5h reference/fallback (value unchanged at `450 as const`; still the mapper percentage basis).
- Report test suite: existing standard-week assertions kept green via a flat `rosteredMinutes: () => 450` default, plus new cases proving the not-rostered exclusion in both the target-day result and the rollup, absence-on-rostered-day subtraction, omitted-default fallback, and unknown-entry -> 0.

## TDD Gate Compliance

- RED: `b041ad4` — `test(06-01)` failing capacity cases on the new signatures (confirmed 13 failures before implementation).
- GREEN: `ff1c317` — `feat(06-01)` capacity implementation (24/24 capacity tests pass).
- GREEN (Task 2): `0d4fbaa` — `feat(06-01)` report threading (full domain suite 70/70).
- No REFACTOR commit needed — no cleanup required beyond the GREEN changes.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations; no authentication gates. The only beyond-the-letter touch was removing the now-unused `TARGET_MINUTES` import from `capacity.ts` (it is no longer referenced there) and updating the `availableMin` field JSDoc on `DesignerResult` to describe the rostered basis — both required to keep the GREEN change compiling cleanly and accurate, within the changed function's scope.

## Verification

- `node --import tsx --test "src/domain/__tests__/capacity.test.ts"` — 24/24 pass.
- `node --import tsx --test "src/domain/__tests__/report.test.ts" "src/domain/__tests__/capacity.test.ts"` — 50/50 pass.
- `node --import tsx --test "src/domain/**/*.test.ts"` — full domain suite 70/70 pass.
- `node --import tsx --test "src/**/*.test.ts"` — whole project 274/274 pass (no regressions in productive/render/calendar from the signature change).
- `npx tsc --noEmit` — exit 0 (no out-of-domain callers; the plan's `<interfaces>` claim of NONE confirmed).
- `DayStatus` line in `capacity.ts` is unchanged: exactly `"off" | "underbooked" | "overbooked" | "ok"` — no new enum value (D-04).
- `TARGET_MINUTES = 450` non-comment occurrence count in `types.ts` = 1 (constant value unchanged).

## Success Criteria

- [x] availableMinutes basis is rostered minutes, not flat TARGET_MINUTES (SC-1 foundation).
- [x] A not-rostered target day yields "off", never "underbooked" (SC-2 foundation).
- [x] Rest-of-week rollup uses real per-weekday rostered minutes (SC-3 / CAP-05 fix).
- [x] All arithmetic exact integer minutes, non-finite coerced, fully unit-tested (SC-5).

## Notes for Downstream Plans

- **Plan 06-02 (Productive ingestion)** must supply the `rosteredMinutes` lookup: parse `person.availabilities`, derive per-weekday minutes (hours x 60), and build a `(designerId, dateKey) => minutes` function. Returning 0 for a not-rostered weekday or an unparseable designer is the contract — the report degrades safely (D-06), it never invents capacity.
- **Plan 06-03 (rendering, D-05)** reads the resulting `"off"` status for routine non-working days; the renderer resolves the "not in {day}" wording without any new status value (the status model stays `"off"`).

## Self-Check: PASSED

- FOUND: src/domain/capacity.ts (modified — rosteredMinutesForDay signature)
- FOUND: src/domain/report.ts (modified — rosteredMinutes lookup)
- FOUND: src/domain/types.ts (modified — TARGET_MINUTES re-documented)
- FOUND: src/domain/__tests__/capacity.test.ts (modified)
- FOUND: src/domain/__tests__/report.test.ts (modified)
- FOUND commit: b041ad4 (RED)
- FOUND commit: ff1c317 (GREEN Task 1)
- FOUND commit: 0d4fbaa (Task 2)
