---
phase: 01-core-math-clock
plan: 01
subsystem: testing
tags: [typescript, luxon, node-test, tsx, esm, timezone, dst]

# Dependency graph
requires: []
provides:
  - "Locked-stack project scaffold (package.json type=module, strict ESM tsconfig, prettier)"
  - "Shared domain types: DesignerId, Booking, Absence, WorkingDay, HolidaySet"
  - "Domain constants STUDIO_ZONE (Australia/Sydney) and TARGET_MINUTES (450)"
  - "Pure working-day clock: nextWorkingDay, isWorkingDay, restOfWeekWindow"
affects: [01-02-capacity, 01-03-rollup, 02-productive-pull]

# Tech tracking
tech-stack:
  added: [luxon@^3.7.2, "@types/luxon@^3.7.1", "typescript@~5.9.3", tsx@^4.22.4, prettier@^3.8.3]
  patterns:
    - "Inject `now: DateTime` — never call DateTime.now() in pure functions (SCHED-04)"
    - "Holidays as ReadonlySet<\"yyyy-MM-dd\"> studio-zone keys, not Set<DateTime>"
    - "Single weekend/holiday skip loop — Friday->Monday emerges with no special-case branch"
    - "Compute in exact integer minutes; convert/round only at the display edge (deferred to plan 02)"
    - "node:test + node --import tsx --test as the test host (no Jest/Vitest)"

key-files:
  created:
    - package.json
    - tsconfig.json
    - .prettierrc.json
    - src/domain/types.ts
    - src/domain/clock.ts
    - src/domain/__tests__/clock.test.ts
  modified: []

key-decisions:
  - "STUDIO_ZONE and TARGET_MINUTES defined as named constants in types.ts (not a separate config.ts); functions stay parameterised so purity is preserved"
  - "WorkingDay is a thin alias for luxon DateTime anchored to startOf('day') in the studio zone, documented rather than wrapped"
  - "Removed tsconfig `types: [node, luxon]` array so tsc type-checks without @types/node, keeping the locked package set to exactly four"

patterns-established:
  - "Pattern 1: inject the clock; holidays as Set<yyyy-MM-dd> string keys"
  - "Pattern 2: Friday->Monday via single skip loop, no branch"
  - "Pattern 6: restOfWeekWindow anchored on `5 - weekday` Friday, one rule covers Tue-run and Monday-rollover"

requirements-completed: [SCHED-03, SCHED-04]

# Metrics
duration: ~20min
completed: 2026-06-02
---

# Phase 1 Plan 01: Scaffold & Working-Day Clock Summary

**Locked-stack ESM/TypeScript scaffold plus a pure, DST-safe luxon working-day clock (nextWorkingDay / isWorkingDay / restOfWeekWindow) with 12 passing node:test cases, including the three mandatory Friday→Monday, holiday-eve, and Sydney DST-boundary tests.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-02 (execution session)
- **Completed:** 2026-06-02
- **Tasks:** 2
- **Files modified:** 6 created (plus package-lock.json)

## Accomplishments
- Project scaffold installs only the four locked packages (luxon, @types/luxon, typescript@~5.9.3, tsx, prettier dev-only) — no zod, no date-holidays, no test framework. `package.json` is ESM with the `node --import tsx --test` test script wired.
- Shared domain contract (`DesignerId`, `Booking`, `Absence`, `WorkingDay`, `HolidaySet`, `STUDIO_ZONE`, `TARGET_MINUTES`) that plans 02/03 and Phase 2 implement against — no implementation logic in types.
- Pure working-day clock: `nextWorkingDay` (weekend + injected-holiday skip), `isWorkingDay`, `restOfWeekWindow` (target-day through that week's Friday, holidays excluded). All luxon calendar-day math; no `DateTime.now()`, no native `Date`.
- The three ROADMAP success-criterion-3 tests pass: Friday→Monday (2026-06-08), holiday-eve (2026-06-11), and the Sydney 2026 DST-end boundary (Fri 2026-04-03 → Mon 2026-04-06, skipping the 04-05 changeover).

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold + shared domain types** - `f77d3a4` (feat)
2. **Task 2 (TDD RED): failing clock tests** - `d350a65` (test)
3. **Task 2 (TDD GREEN): clock implementation** - `16a58b2` (feat)
4. **Task 2 (cleanup): prettier formatting** - `59dff49` (style)

_Task 2 followed the RED → GREEN → format TDD cycle._

## Files Created/Modified
- `package.json` - ESM project, locked deps, `test` + `format` scripts
- `tsconfig.json` - strict nodenext ESM, target es2023, noEmit (tsx runs directly)
- `.prettierrc.json` - formatting config (semis, double quotes, printWidth 100)
- `src/domain/types.ts` - DesignerId, Booking, Absence, WorkingDay, HolidaySet, STUDIO_ZONE, TARGET_MINUTES
- `src/domain/clock.ts` - nextWorkingDay, isWorkingDay, restOfWeekWindow (pure luxon)
- `src/domain/__tests__/clock.test.ts` - 12 tests across the three functions

## Decisions Made
- **Config-constant placement:** `STUDIO_ZONE`/`TARGET_MINUTES` live in `types.ts` as named constants (documented in a header comment) rather than a separate `config.ts`. Phase 1 has no runtime/secret config and only two invariants; a dedicated module would be ceremony. Functions stay parameterised (holidays passed in), so purity/testability is intact. A thin `config.ts` can be added in Phase 2 when real runtime config appears.
- **`WorkingDay` is a documented alias for luxon `DateTime`** anchored to `startOf("day")` in the studio zone, rather than a wrapper type — avoids ceremony while the clock guarantees the anchoring invariant.
- **Quarter-hour rounding (D-16) NOT implemented here** — it belongs to plan 02 (capacity), which surfaces the figures. This plan deliberately ships only the clock + scaffold + types.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed `types: ["node", "luxon"]` from tsconfig**
- **Found during:** Task 1 (scaffold verification)
- **Issue:** `npx tsc --noEmit` errored with TS2688 "Cannot find type definition file for 'node'" because `@types/node` is not in the locked package set (the plan locks exactly four packages and `node:test`/`node:assert` types are not pulled in by an explicit `types` array without `@types/node`).
- **Fix:** Removed the explicit `types` array from `tsconfig.json` so tsc no longer demands `@types/node`. tsx runs the tests regardless; tsconfig now type-checks clean. The locked package set is unchanged (no new dependency added).
- **Files modified:** `tsconfig.json`
- **Verification:** `npx tsc --noEmit` exits 0; `npm test` passes all 12 cases.
- **Committed in:** `f77d3a4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking config issue)
**Impact on plan:** The fix kept the locked-stack constraint intact (no `@types/node` added) while making tsc usable. No scope creep; behaviour unchanged.

## Issues Encountered
- Minor prettier formatting drift in the two source files after authoring (line-wrapped signatures that fit within printWidth 100). Resolved by running the project's own `prettier --write` and committing as a `style` commit; all tests re-verified passing afterward.

## TDD Gate Compliance
Plan type is `tdd`. Gate sequence satisfied in git log:
1. RED — `test(01-01)` commit `d350a65` (tests fail; clock.ts absent)
2. GREEN — `feat(01-01)` commit `16a58b2` (all 12 tests pass)
3. (optional) REFACTOR/style — `style(01-01)` commit `59dff49` (formatting only, tests still green)

## User Setup Required
None - no external service configuration required. Phase 1 is pure in-memory logic.

## Next Phase Readiness
- `targetDay` and the rest-of-week window are available for plan 02 (capacity) and plan 03 (rollup) to consume.
- Shared types are importable: plan 02 implements available/booked/open + classification against `Booking`/`Absence`/`TARGET_MINUTES`; plan 03 composes the clock window with capacity for the studio rollup.
- Quarter-hour rounding (D-16) and the `StudioReport` assembly are still to be built (plans 02/03).
- No blockers.

## Self-Check: PASSED

All 7 created files verified present on disk; all 4 task commits (`f77d3a4`, `d350a65`, `16a58b2`, `59dff49`) verified in git history.

---
*Phase: 01-core-math-clock*
*Completed: 2026-06-02*
