---
phase: 01-core-math-clock
verified: 2026-06-03T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 1: Core Math & Clock Verification Report

**Phase Goal:** All capacity and working-day arithmetic exists as pure, deterministic, fully unit-tested functions — the trust boundary — with no network or external dependencies.
**Verified:** 2026-06-03
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Given typed booking and time-off inputs, the core computes each designer's available hours (7.5h minus time-off) and booked hours for the target day, and a studio rest-of-week rollup, with results verifiable by hand against the inputs | ✓ VERIFIED | `availableMinutes`, `bookedMinutes`, `computeDesignerDay`, and `computeStudioReport` are pure functions over typed inputs. Test `rollup.totalMin === 5400` (4 days × 3 designers × 450) is asserted. All math is in exact minutes and derivable by hand. |
| 2 | A designer booked below their available hours is returned as underbooked with the designer named and the open hours stated; tentative bookings are counted toward hours but carried as a distinct "shaky" flag | ✓ VERIFIED | `classifyDay(450, 420) === { status: "underbooked", openMin: 30 }` asserted. `computeDesignerDay` with 300 tentative and 0 confirmed returns `shaky: true`, `status: "underbooked"`, `openMin: 450`. Shaky is orthogonal to status and tested independently. |
| 3 | The clock derives the correct target day from the studio timezone (not the scheduler's clock), and a Friday run targets Monday — proven by passing tests for the Friday-to-Monday case, a holiday-eve case, and a DST-boundary case | ✓ VERIFIED | All three mandatory tests pass: Friday→Monday (`2026-06-08`), holiday-eve (`2026-06-11`), DST-boundary (`2026-04-06`). `DateTime.now()` and `new Date()` are absent from all domain files (grep returns exit 1 — no matches). `now` is always injected. |
| 4 | The same inputs always produce the same outputs (no randomness, no I/O), and partial/empty inputs degrade gracefully rather than throwing | ✓ VERIFIED | `assert.deepEqual(computeStudioReport(x), computeStudioReport(x))` passes. NaN booking and NaN absence tests do not throw and produce finite rollup totals. Empty roster and empty arrays produce well-formed `StudioReport` with no throws. No fetch, axios, fs, http, or process.env calls exist in any domain file. |

**Score:** 4/4 truths verified

### Deferred Items

None.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | ESM scaffold, locked deps, `npm test` script | ✓ VERIFIED | `"type": "module"`, test script `node --import tsx --test "src/**/*.test.ts"`, `luxon` in dependencies, `tsx`/`typescript~5.9.3`/`@types/luxon`/`prettier` in devDependencies. No zod, date-holidays, jest, vitest, axios. |
| `tsconfig.json` | Strict TypeScript config for ESM + tsx | ✓ VERIFIED | File exists; SUMMARY confirms `"strict": true`, `"noEmit": true`, `"module": "nodenext"`. |
| `src/domain/types.ts` | Shared domain types: DesignerId, Booking, Absence, WorkingDay, HolidaySet, STUDIO_ZONE, TARGET_MINUTES | ✓ VERIFIED | All six exports confirmed present. `STUDIO_ZONE = "Australia/Sydney"`, `TARGET_MINUTES = 450`. No implementation logic. |
| `src/domain/clock.ts` | `nextWorkingDay`, `isWorkingDay`, `restOfWeekWindow` (pure, luxon) — min 30 lines | ✓ VERIFIED | 63 lines. All three functions exported. Imports `DateTime` from `luxon`. No `DateTime.now()` or `new Date()`. |
| `src/domain/__tests__/clock.test.ts` | Friday→Monday, holiday-eve, and DST-boundary tests (contains `2026-04-06`) | ✓ VERIFIED | All three mandatory cases present. Grep for `2026-06-08\|2026-06-11\|2026-04-06` returns count 10 (multiple assertions per case). |
| `src/domain/round.ts` | `minutesToHours` + `roundToQuarterHour` | ✓ VERIFIED | Both functions exported. Header documents round-half-up, display-only. |
| `src/domain/capacity.ts` | `availableMinutes`, `bookedMinutes`, `classifyDay`, `computeDesignerDay` — min 30 lines | ✓ VERIFIED | 154 lines. All four functions exported plus `DayStatus` and `DesignerResult` types. Imports from `./types.ts` and `./round.ts`. No `draft`/`productive` tokens. No `DateTime.now()` or `new Date()`. |
| `src/domain/__tests__/capacity.test.ts` | off/underbooked/overbooked/ok + shaky + zero-bookings tests — contains `underbooked` | ✓ VERIFIED | All cases present and asserted. |
| `src/domain/report.ts` | `computeStudioReport` assembling clock window + per-designer capacity into `StudioReport` — min 30 lines | ✓ VERIFIED | 224 lines. Exports `computeStudioReport`, `StudioReport`, `StudioReportInput`, `StudioRollup`, `DatedBooking`, `DatedAbsence`. Calls `restOfWeekWindow` (4 occurrences confirmed). |
| `src/domain/__tests__/report.test.ts` | Rollup, Friday-rollover, holiday-in-window, missing-designer, empty-input, determinism tests — contains `missingDesigners` | ✓ VERIFIED | `missingDesigners` appears at lines 186, 198, 209, 225, 262. All required cases asserted with concrete values. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/domain/clock.ts` | luxon DateTime | `import { DateTime } from "luxon"` | ✓ WIRED | Confirmed at line 16 of clock.ts |
| `src/domain/clock.ts` | injected now (no system clock) | `now` passed as parameter; `DateTime.now()` never called | ✓ WIRED | Grep for `DateTime.now(` in domain files returns exit 1 (no matches) |
| `src/domain/capacity.ts` | `src/domain/types.ts` | `import type { Booking, DesignerId }` / `import { TARGET_MINUTES }` | ✓ WIRED | Confirmed at lines 16–17 of capacity.ts |
| `src/domain/capacity.ts` | `src/domain/round.ts` | `roundToQuarterHour` used for display figures | ✓ WIRED | Confirmed at lines 18 and 149–151 of capacity.ts |
| `src/domain/report.ts` | `src/domain/clock.ts` | `restOfWeekWindow` called at line 169 | ✓ WIRED | 4 occurrences of `restOfWeekWindow` in report.ts |
| `src/domain/report.ts` | `src/domain/capacity.ts` | `availableMinutes`, `bookedMinutes`, `computeDesignerDay` imported and called | ✓ WIRED | Confirmed at lines 33 and 181–186, 197–200 of report.ts |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers pure domain functions with no rendering layer. There is no component that displays dynamic data from a fetch or store; all data flows from injected function arguments to return values. The test suite is the data-flow proof: concrete inputs produce concrete, hand-verifiable outputs.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes (59 tests) | `npm test` | 59 pass, 0 fail, exit 0 | ✓ PASS |
| No system clock in domain files | `grep -n "DateTime\.now(" src/domain/*.ts` | No output (exit 1) | ✓ PASS |
| No native Date in domain files | `grep -n "new Date(" src/domain/*.ts` | No output (exit 1) | ✓ PASS |
| No network/I/O imports in domain layer | `grep -n "fetch\|axios\|fs\.\|http\|process\." src/domain/*.ts` | No output (exit 1) | ✓ PASS |
| Three mandatory date tests present | `grep -c "2026-06-08\|2026-06-11\|2026-04-06" src/domain/__tests__/clock.test.ts` | 10 | ✓ PASS |
| TypeScript locked to 5.x | `package.json` devDependencies | `"typescript": "~5.9.3"` | ✓ PASS |

---

### Probe Execution

No conventional probe scripts present (`scripts/*/tests/probe-*.sh` — not applicable for a pure domain-functions phase). No probes declared in PLAN frontmatter. Step skipped.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SCHED-03 | 01-01 | "Next working day" targets following weekday; Friday → Monday | ✓ SATISFIED | `nextWorkingDay` + Friday→Monday test asserting `"2026-06-08"` |
| SCHED-04 | 01-01 | All working-day logic computed from studio timezone, DST-safe | ✓ SATISFIED | Luxon anchors all math in `Australia/Sydney`; DST-boundary test (`2026-04-06`) passes; no `DateTime.now()` usage |
| CAP-01 | 01-02 | Available hours = 7.5h minus absence, per designer | ✓ SATISFIED | `availableMinutes(120) === 330`, `availableMinutes(450) === 0` asserted |
| CAP-02 | 01-02 | Booked hours computed from confirmed bookings | ✓ SATISFIED | `bookedMinutes` separates confirmed from tentative; `{ confirmed: 300, tentative: 120 }` asserted |
| CAP-03 | 01-02 | Underbooked designer flagged with name and open hours | ✓ SATISFIED | `classifyDay(450, 420) === { status: "underbooked", openMin: 30 }`; `DesignerResult` carries `designerId` |
| CAP-04 | 01-02 | Tentative bookings tracked as distinct shaky flag | ✓ SATISFIED | `confirmed 0 + tentative 300 → shaky: true, status: "underbooked"` asserted; shaky orthogonality tested |
| CAP-05 | 01-03 | Studio rest-of-week rollup: open hours vs total across remaining working days | ✓ SATISFIED | `rollup.totalMin === 5400` (Tue, 3 designers, 4 days), `4050` (holiday), `6750` (Friday rollover) asserted |

All 7 requirement IDs claimed by the three plans are satisfied. No orphaned requirements: REQUIREMENTS.md traceability table maps all 7 to Phase 1 and marks them Complete.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

Debt-marker scan (TBD, FIXME, XXX, TODO, HACK, PLACEHOLDER) returned no output across all domain source and test files. No inline `Math.round(h*4)/4` patterns present outside `round.ts`. No `draft`/`productive` tokens in `capacity.ts`. No empty-return stubs (`return null`, `return {}`, `return []`) present in implementation files.

---

### Human Verification Required

None. Phase 1 delivers pure, stateless functions with no UI, no external services, and no runtime behavior requiring human observation. All behaviors are fully exercised by the deterministic test suite.

---

### Gaps Summary

No gaps. All four observable truths are verified. All 10 required artifacts exist, are substantive (non-stub), and are wired to their dependencies. All 7 requirement IDs are satisfied. The test suite runs 59 tests with 0 failures on `npm test`. No debt markers. No network or I/O in the domain layer.

---

_Verified: 2026-06-03_
_Verifier: Claude (gsd-verifier)_
