---
phase: 01-core-math-clock
plan: 03
subsystem: domain
tags: [typescript, rollup, studio-report, composition, node-test, tsx, esm, pure-functions]

# Dependency graph
requires:
  - "01-01: src/domain/clock.ts (nextWorkingDay, restOfWeekWindow), src/domain/types.ts (DesignerId, Booking, Absence, HolidaySet)"
  - "01-02: src/domain/capacity.ts (availableMinutes, bookedMinutes, computeDesignerDay, DesignerResult)"
provides:
  - "Top-level output contract StudioReport (targetDay, window, designers, rollup, missingDesigners)"
  - "computeStudioReport(input): the single function Phase 2 feeds and Phase 3 renders"
  - "StudioReportInput / DatedBooking / DatedAbsence / StudioRollup input+output shapes"
  - "Rest-of-week rollup: open vs total minutes net of time-off, open floored per day-slot"
  - "Roster-gap detection via explicit assessedDesigners signal (missingDesigners)"
affects: [02-productive-pull, 03-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compose clock window (01-01) + per-designer capacity (01-02); never re-create their math"
    - "Optional per-window-day date on bookings/absences; undated entry = the target day"
    - "Rollup sums over (window day x rostered designer); open floored at 0 per day-slot so one overbooked day never shows negative studio open"
    - "missingDesigners = roster minus assessedDesigners; omitted assessedDesigners means whole roster assessed (empty pull is present-but-empty, NOT a gap)"
    - "Pure/deterministic: now injected, no system clock, no I/O, non-finite minutes coerced to 0 upstream in capacity helpers"

key-files:
  created:
    - src/domain/report.ts
    - src/domain/__tests__/report.test.ts
  modified: []

key-decisions:
  - "StudioReport shape follows the <interfaces> recommendation: { targetDay: ISO string; window: ISO string[]; designers: DesignerResult[]; rollup: { openHours, totalHours, openMin, totalMin }; missingDesigners: DesignerId[] }"
  - "Input carries an OPTIONAL assessedDesigners signal to distinguish present-but-empty (no gap, D-19) from absent-from-the-pull (gap, D-18) — omitting it means the whole roster was assessed"
  - "Date dimension added via local DatedBooking/DatedAbsence (optional date), NOT by mutating the shared Booking/Absence types — keeps the Phase-1 domain contract stable for other consumers"
  - "Rollup open is floored at 0 PER DAY-SLOT (Math.max(0, available - confirmed)); the per-designer overbooked early-warning lives in designers[] (D-06), not in the studio total"

patterns-established:
  - "report.ts is the composition layer — it calls prior-plan functions only, adds no new arithmetic primitives"
  - "Undated booking/absence normalised to the target-day key before per-designer + rollup computation"

requirements-completed: [CAP-05]

# Metrics
duration: ~4min
completed: 2026-06-02
---

# Phase 1 Plan 03: Studio Rollup & StudioReport Assembly Summary

**Pure, deterministic `computeStudioReport` that composes the working-day clock and per-designer capacity into the system's top-level `StudioReport` — a rest-of-week open-vs-total rollup net of time-off, target-day per-designer results, and an explicit roster-gap list — proven by 20 new node:test cases (59 total green) covering CAP-05 and decisions D-07/D-08/D-09/D-10/D-18/D-19.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-02 (execution session)
- **Completed:** 2026-06-02
- **Tasks:** 1 (TDD)
- **Files created:** 2

## Accomplishments

- `report.ts` exports `computeStudioReport(input): StudioReport` plus the input/output contracts (`StudioReportInput`, `DatedBooking`, `DatedAbsence`, `StudioRollup`, `StudioReport`). It is the single object the rest of the system consumes — Phase 2 feeds its inputs, Phase 3 renders it.
- **Rest-of-week rollup (CAP-05 / D-09):** sums `availableMinutes(absence)` over (window day × rostered designer) for `totalMin`, and `Σ max(0, available − confirmed)` for `openMin`. Confirmed-only (tentative never closes the gap, D-04/D-05). Hours are display-only 0.25h-rounded via `round.ts`; the `*Min` fields stay exact.
- **Clock composition (D-07 / D-08 / D-10):** derives `targetDay = nextWorkingDay(now, holidays)` and `window = restOfWeekWindow(targetDay, holidays)` — Tue target → 4-day Tue–Fri window; Friday-evening run → Mon target → 5-day window; a holiday in the window is excluded and contributes 0.
- **Roster gap (D-18 / T-01-06):** an explicit optional `assessedDesigners` input names which designers the pull actually covered; `missingDesigners = roster − assessedDesigners`. Omitting it means the whole roster was assessed, so an empty/quiet pull is present-but-empty (no gap), exactly per the D-19 empty-input contract.
- **Graceful degradation (D-19 / T-01-07 / T-01-08):** never throws — NaN/Infinity minutes are coerced to 0 by the capacity helpers; an empty roster or empty arrays still produce a well-formed report; identical inputs yield deep-equal output (no system clock, no I/O, no randomness).
- All plan acceptance criteria asserted with concrete values: Tue rollup totalMin 5400 / 90h; holiday-in-window 4050; Friday-rollover 6750; missing-designer names the third id without throwing; empty-input each underbooked with openMin 450 and missingDesigners []; determinism via `deepEqual`; NaN-booking does not throw.

## Task Commits

Task 1 followed the RED → GREEN TDD cycle, each committed atomically:

1. **Task 1 (RED): failing studio rollup + StudioReport tests** — `d9642ba` (test)
2. **Task 1 (GREEN): computeStudioReport implementation** — `daf4cda` (feat)

The GREEN commit folded in two small test-contract/comment adjustments (see Deviations) and prettier formatting; the full suite was re-verified green before committing.

## Files Created/Modified

- `src/domain/report.ts` — `computeStudioReport`; exports `StudioReport`, `StudioReportInput`, `StudioRollup`, `DatedBooking`, `DatedAbsence`. Composition layer over clock + capacity; adds no new arithmetic primitives.
- `src/domain/__tests__/report.test.ts` — 20 assertions across target-day/window derivation, rollup totals (net of time-off, confirmed-only, overbooked-floored, tentative-ignored), holiday-in-window, Friday rollover, per-designer results, missing-designer gap, determinism, NaN/empty tolerance.

## Decisions Made

- **`StudioReport` shape:** followed the `<interfaces>` recommendation exactly — `{ targetDay: string (ISO); window: string[] (ISO); designers: DesignerResult[]; rollup: { openHours, totalHours, openMin, totalMin }; missingDesigners: DesignerId[] }`. Exported and kept stable for Phase 2/3.
- **`assessedDesigners` as the gap signal:** the plan's two anchor cases are in tension at the array level — the 2-of-3 case wants C flagged when "absent from input," while the empty-roster case wants NO gaps for `bookings=[]`/`absences=[]`. Reconciled by making the gap depend on an explicit `assessedDesigners` list (who the pull reached) rather than inferring presence from whether a designer happens to appear in a booking/absence array. Omitting it assumes the whole roster was assessed, satisfying the empty-input contract (D-19); Phase 2 will pass only successfully-pulled designers, satisfying D-18. This is the honest model: "present-with-no-bookings" (assessed, zero entries) vs "absent-from-the-pull" (not assessed) are now structurally distinct, not guessed.
- **Date dimension via local `DatedBooking`/`DatedAbsence`:** the rollup needs per-(designer, day) data, but the shared `Booking`/`Absence` types are intentionally date-free (single attributed day). Rather than mutate the shared contract (which other consumers depend on), `report.ts` defines local extensions with an optional `date`; an undated entry is normalised to the target day. Keeps scope tight and the Phase-1 domain contract unchanged.
- **Rollup open floored per day-slot:** `Math.max(0, available − confirmed)` per (day × designer) so a single overbooked day cannot make the studio total look negative. The unclamped overbooked signal still surfaces per-designer in `designers[]` (D-06) where it is the actionable nudge; the studio rollup answers "how much open capacity remains," which cannot be negative.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test correctness] Replaced array-presence missing-designer detection with an explicit `assessedDesigners` signal**
- **Found during:** Task 1 (GREEN — two D-19 sub-tests failed against the first implementation)
- **Issue:** My initial implementation inferred "missing" from whether a designer appeared in any booking/absence array. That made the empty-input case (`bookings=[]`, `absences=[]`) flag ALL three designers as missing — contradicting the plan's explicit contract that an empty pull for the full roster yields `missingDesigners = []` (present-but-empty, not absent).
- **Fix:** Added an optional `assessedDesigners` field to `StudioReportInput`; `missingDesigners = roster − assessedDesigners`, with omission meaning "whole roster assessed." Updated the missing-designer test to pass `assessedDesigners: [A, B]` (the pull reached only A and B) — the honest signal Phase 2 will supply. Both D-19 sub-tests now pass alongside the D-18 gap test.
- **Files modified:** `src/domain/report.ts`, `src/domain/__tests__/report.test.ts`
- **Committed in:** `daf4cda` (Task 1 GREEN commit)

**2. [Rule 2 - Guard compliance] Reworded module-header prose to satisfy the no-system-clock grep guard**
- **Found during:** Task 1 (acceptance-criteria verification)
- **Issue:** Acceptance criterion requires `grep -v '^[[:space:]]*//' src/domain/report.ts | grep -c 'DateTime.now(\|new Date('` to return 0. The block-comment header described the determinism guarantee using the literal token `DateTime.now()`, which the line-comment-stripping grep counted (count 1).
- **Fix:** Reworded the comment to "the module never reads the system clock (no luxon-now call, no native date construction)" — same documented guarantee, no literal tokens. Grep returns 0. No code/behaviour change.
- **Files modified:** `src/domain/report.ts`
- **Committed in:** `daf4cda` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 test-contract correction reconciling D-18/D-19, 1 comment wording for the grep guard).
**Impact on plan:** No scope change. The `assessedDesigners` addition is an interface clarification the plan invited ("planner's discretion on input shape; document it") and is documented above as the stable contract for Phase 2.

## Issues Encountered

- **Pre-existing (out of scope): `npx tsc --noEmit` reports errors.** As noted in 01-01 and 01-02, `tsc --noEmit` flags `node:test`/`node:assert` module-not-found and `.ts`-extension import errors across all test files — the project's standing locked-stack trade-off (runs/tests via `tsx`, no `@types/node`). The plan's gate is `npm test` + grep assertions, all green. Not fixed (would require a stack-level tsconfig/@types change outside this plan's scope).

## TDD Gate Compliance

Plan type is `tdd`. Gate sequence satisfied in git log:
1. RED — `test(01-03)` `d9642ba` (report tests fail; `report.ts` absent → module load failure).
2. GREEN — `feat(01-03)` `daf4cda` (all 20 report tests pass; full suite 59 green).

No test passed unexpectedly during RED (the whole file failed to load with `report.ts` absent, confirming a true RED). No separate REFACTOR commit was needed — prettier formatting and the two adjustments were folded into GREEN with the full suite verified green.

## Verification Evidence

- `npm test` → 59 tests, 59 pass, 0 fail (clock 12 + round 8 + capacity 16 + report 20, plus suite roll-ups).
- `node --import tsx --test "src/domain/__tests__/report.test.ts"` → exit 0 (20 pass).
- Rollup: Tue 2026-06-09 target, 3 designers, no absences/bookings → `rollup.totalMin === 5400`, `rollup.totalHours === 90`, `rollup.openMin === 5400` asserted (CAP-05 / D-09).
- Holiday-in-window: holidays={2026-06-11} → window length 3, `rollup.totalMin === 4050` asserted (D-10).
- Friday-rollover: Mon 2026-06-08 target (from a Fri now) → `rollup.totalMin === 6750` asserted (D-08).
- Missing-designer: `assessedDesigners: [A, B]` → `missingDesigners` deep-equals `[C]`, no throw (D-18).
- Empty-input: full roster, no bookings → each designer `status === "underbooked"`, `openMin === 450`, `missingDesigners === []` (D-17 / D-19).
- Determinism: `assert.deepEqual(computeStudioReport(x), computeStudioReport(x))` passes (T-01-08).
- NaN-minutes booking and NaN-minutes absence each do not throw; `rollup.totalMin` stays finite (D-19 / T-01-07).
- `grep -v '^[[:space:]]*//' src/domain/report.ts | grep -c 'DateTime.now(\|new Date('` → 0 (no system clock, no native Date).
- `grep -c 'restOfWeekWindow' src/domain/report.ts` → 4 (clock window composed in).
- `prettier --check` on both new files → clean.

## User Setup Required

None — Phase 1 is pure in-memory logic; no external service configuration.

## Next Phase Readiness

- `StudioReport` + `computeStudioReport` are the stable, exported contract the rest of the system plugs into: Phase 2 (Productive ingestion) maps raw API responses into `roster` / `bookings` (`DatedBooking`) / `absences` (`DatedAbsence`) / `assessedDesigners` and calls `computeStudioReport`; Phase 3 (renderer) reads the `*Hours` fields, `designers[].status`/`shaky`, and `missingDesigners` to compose the on-brand Chat card.
- The `assessedDesigners` signal is the documented hook for Phase 2's degraded-message path (REL-01): a designer the pull fails to reach is named in `missingDesigners` rather than silently treated as fully open.
- Phase 1 (core-math-clock) is now complete — clock, capacity, rounding, and the StudioReport rollup are all built and tested. ROADMAP success criteria 3 (clock) and 4 (deterministic graceful degradation) are proven.
- No blockers.

## Self-Check: PASSED

Files verified present on disk: `src/domain/report.ts`, `src/domain/__tests__/report.test.ts`.
Task commits verified in git history: `d9642ba` (RED test), `daf4cda` (GREEN feat).

---
*Phase: 01-core-math-clock*
*Completed: 2026-06-02*
