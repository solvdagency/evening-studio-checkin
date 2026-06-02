---
phase: 01-core-math-clock
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/domain/types.ts
  - src/domain/clock.ts
  - src/domain/capacity.ts
  - src/domain/round.ts
  - src/domain/report.ts
  - src/domain/__tests__/clock.test.ts
  - src/domain/__tests__/round.test.ts
  - src/domain/__tests__/capacity.test.ts
  - src/domain/__tests__/report.test.ts
  - package.json
  - tsconfig.json
  - .prettierrc.json
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 1 is the project's trust boundary: pure capacity arithmetic and working-day clock math. The implementation is well-documented, the test suite passes (59/59), and the core arithmetic correctly keeps everything in integer minutes with display-only rounding. The deterministic / non-throwing contracts are largely honoured.

However, adversarial tracing surfaced real defects. The most consequential are silent data-loss paths where inputs that don't match the computed window get dropped without any signal (off-window bookings, duplicate roster IDs double-counting, negative-minute inputs sailing through the "defensive" coercion that only guards non-finite values), plus an asymmetric rounding bug on negative (overbooked) hour figures. None are remote-exploitable security holes (this is a pure, I/O-free domain layer), so there are no Critical findings — but several Warnings directly threaten the "numbers must be exact or the team stops reading the message" constraint, which is the entire point of this phase.

## Warnings

### WR-01: Negative minutes pass through `safeMinutes` and corrupt every figure

**File:** `src/domain/capacity.ts:67-69`, used at `availableMinutes:77`, `bookedMinutes:92`, and `report.ts:154`
**Issue:** `safeMinutes` only guards against non-finite values (`NaN`/`Infinity`). A finite *negative* number passes through unchanged. The module's own header (capacity.ts:11-13) and the `Booking`/`Absence` contracts implicitly assume minutes ≥ 0, and Phase 2 maps raw Productive `time` fields (minutes/day) into these — a sign error, a bad subtraction upstream, or a malformed API payload yielding `-60` would silently:
- inflate `availableMinutes` above the 450 target (`Math.max(0, 450 - (-60)) = 510`),
- subtract from confirmed/tentative sums in `bookedMinutes`,
- produce a negative `openMin`/`totalMin` in the rollup.

This violates the trust constraint: a figure like "8.5h available" on a 7.5h target would appear with no warning. The header claims "non-finite minute values are coerced to 0 so a NaN/Infinity can never reach a surfaced figure" — but the more realistic bad input (a negative minute) is not handled at all.

**Fix:** Clamp to non-negative as well as finite, since every minute quantity in this domain is physically non-negative:
```ts
function safeMinutes(minutes: number): number {
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}
```
(Or `Math.max(0, Number.isFinite(minutes) ? minutes : 0)`.) Add tests for `availableMinutes(-60)`, `bookedMinutes([booking(-60, false)])`.

### WR-02: Bookings/absences attributed to a date outside the computed window are silently dropped

**File:** `src/domain/report.ts:195-202` (rollup loop), `181-187` (per-designer)
**Issue:** The rollup iterates `window × roster` and pulls bookings whose `date` matches a window key. Any booking/absence whose `date` does NOT fall on a window day (e.g. a weekend date, a holiday that was removed from the window, or a date in a different week) is never summed into anything — it vanishes silently. Verified: a confirmed 450-min booking dated `2026-06-06` (a Saturday) for a Tue-target run produced `openMin` unchanged (1800 for a 1-designer/4-day window minus nothing), i.e. the booking was dropped with no `missingDesigners` entry and no other signal.

This is a silent-partial-result risk of the same class the `missingDesigners` check (D-18) was built to prevent: data was pulled, attributed to a real day, and then discarded. For a learner-maintained Phase 2 that derives `date` from Productive `started_on`, an off-by-one or a holiday-list mismatch between the clock and the upstream pull would quietly hide booked work.

**Fix:** At minimum, document this as an explicit contract (caller must only pass window-day dates) AND add a defensive count of dropped entries surfaced on the report, or assert in tests that off-window dates are rejected/counted. The robust option: track which input rows matched no slot and expose a `droppedEntries: number` (or similar) on `StudioReport` so a mismatch can't pass unnoticed.

### WR-03: `restOfWeekWindow` returns an empty array for a weekend target (no defensive handling)

**File:** `src/domain/clock.ts:55-62`
**Issue:** `const friday = targetDay.plus({ days: 5 - targetDay.weekday })`. For a Saturday target (weekday 6) this is `targetDay.plus({days: -1})` = the *previous* Friday, which is `< targetDay`, so the loop body never executes and the function returns `[]`. Same for Sunday (weekday 7 → `-2`). Verified empirically: both Saturday and Sunday targets return `[]`.

In normal flow `nextWorkingDay` never yields a weekend, so this is unreachable via `computeStudioReport`. But `restOfWeekWindow` is an exported function with no precondition stated in its signature, and an empty window would silently produce a `totalMin: 0` rollup — a "studio has zero capacity this week" report with no error. A reviewer cannot assume callers will always honour an undocumented invariant.

**Fix:** Either guard explicitly (clamp `friday` to be ≥ `targetDay`, or early-return `[]` only when the target itself is non-working, with a documented contract), or assert the precondition. A clamp keeps it total:
```ts
const daysToFriday = 5 - targetDay.weekday;
const friday = targetDay.plus({ days: daysToFriday < 0 ? 0 : daysToFriday });
```
and document that a weekend target yields just that day's working days (likely empty), so the degenerate case is intentional rather than accidental.

### WR-04: Negative (overbooked) hour figures round asymmetrically toward +infinity

**File:** `src/domain/round.ts:35-37`, consumed by `capacity.ts:151` (`openHours` for overbooked days)
**Issue:** `roundToQuarterHour` is documented as "round-half-up (toward +infinity)" and adds `+ 1e-9`. For positive figures this is the intended human "round up" behaviour. But `openMin` is explicitly unclamped and goes negative on overbooked days (capacity.ts:49, classifyDay D-06), and `openHours` is computed from it. For negative inputs, half-up-toward-+infinity means a 0.5 case rounds toward zero (e.g. `-0.125h → -0` per verification), and the `+1e-9` epsilon biases negatives the "wrong" way relative to magnitude. Verified: `roundToQuarterHour(-7.125)` returns `-7` (rounded toward zero / up), whereas the positive twin `7.125` returns `7.25` (rounded away from zero). An overbooked designer's displayed "over by" figure is therefore rounded inconsistently with the underbooked figure of the same magnitude.

For a trust-critical display this asymmetry will eventually produce a figure that doesn't reconcile with `openMin` for a reader doing mental math on an overbooked day.

**Fix:** Decide and document the intended behaviour for negative hours. If overbooked magnitude should round consistently, round on the magnitude and reattach the sign:
```ts
export function roundToQuarterHour(decimalHours: number): number {
  const sign = decimalHours < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(decimalHours) * 4 + 1e-9)) / 4;
}
```
Add tests pinning `-0.5`, `-7.125`, and the symmetric negative half-quarter cases.

### WR-05: Duplicate designer IDs in the roster double-count silently

**File:** `src/domain/report.ts:181-202`
**Issue:** `roster` is iterated directly in both the per-designer map and the rollup loop with no dedupe. A roster of `[A, A]` produces two `DesignerResult` entries for A and counts A's capacity twice in the rollup (verified: `openMin` 2700 instead of 1350 for one designer over the window, and `designers.length === 2`). The project monitors exactly three designers; a copy-paste error in the hardcoded config (CLAUDE.md notes IDs are hardcoded) would silently inflate studio totals by a whole designer's capacity with no error.

**Fix:** Dedupe the roster at the top of `computeStudioReport`, or assert uniqueness:
```ts
const roster = [...new Set(input.roster)];
```
Document that the roster is treated as a set. Add a test with a duplicated roster ID.

### WR-06: Off-window absences cannot reduce target-day availability but off-window bookings issue is asymmetric / untested

**File:** `src/domain/report.ts:185, 197` and tests `report.test.ts`
**Issue:** Related to WR-02 but distinct: the absence/booking date-matching is exact-string equality (`b.date === dateKey`). There is no test covering an absence dated to a window day where the designer is NOT in `assessedDesigners`, nor a test for a booking/absence whose `date` is malformed (e.g. `"2026-6-9"` without zero-padding, or `"2026-06-09T00:00:00"`). Because matching is raw string equality against luxon's `toISODate()` output (always zero-padded `yyyy-MM-dd`), any upstream date string that isn't already in that exact canonical form silently fails to match and the entry is dropped (same data-loss class as WR-02). Phase 2 will produce these strings from Productive's `started_on`; the contract that they be canonical `toISODate()` form is undocumented and untested.

**Fix:** Document the exact-format requirement on `DatedBooking.date` / `DatedAbsence.date`, and either normalise dates through luxon on the way in or add a test asserting that a non-canonical date string is handled deterministically (rejected or normalised), not silently dropped.

## Info

### IN-01: `dayKey` swallows a null `toISODate()` into an empty-string key

**File:** `src/domain/report.ts:123-126`
**Issue:** `return day.toISODate() ?? ""`. `toISODate()` returns null only for an invalid `DateTime`. Coercing to `""` means an invalid target day would produce `targetDay: ""` and a window/booking key of `""` that could spuriously match an entry with `date: ""`. The comment asserts the input is always valid, which holds for the current internal callers, but the silent `""` fallback hides the invariant violation rather than surfacing it.
**Fix:** Since the comment guarantees non-null, this branch is dead defensively — prefer making it loud in dev (or returning a sentinel that can never match a real date) so a future invalid DateTime doesn't silently corrupt matching.

### IN-02: `nextWorkingDay` loop has no upper bound

**File:** `src/domain/clock.ts:39-45`
**Issue:** The `do/while` advances one day until `isWorkingDay` is true. If a caller injected a holiday set that (pathologically) marks every upcoming weekday as a holiday, the loop runs unbounded. In practice holiday sets are tiny and this never triggers, so it is informational — but a hard cap (e.g. break after 14 iterations and return the last day) would make the function total under adversarial input, consistent with the phase's "never throw / always produce a result" stance.
**Fix:** Add a defensive iteration cap with a documented fallback.

### IN-03: `package.json` metadata is scaffold-default

**File:** `package.json:4-5,14-15`
**Issue:** `"description": ""`, `"author": ""`, `"main": "index.js"` (there is no `index.js`; this is a TS/ESM project with no JS entry), and `"keywords": []` are unedited `npm init` defaults. The `main` field pointing at a non-existent file is harmless for this internal tool but is misleading.
**Fix:** Set `description`/`author`, and either remove `main` or point it at the real entry once one exists.

### IN-04: Test runner glob may miss future nested test dirs / no typecheck in CI scripts

**File:** `package.json:7`
**Issue:** `"test": "node --import tsx --test \"src/**/*.test.ts\""` runs tests but the project has no `typecheck` script (`tsc --noEmit`). Since the entire value proposition of TypeScript here (per CLAUDE.md) is catching field/nesting/null mistakes against gnarly JSON:API shapes, a `tsc --noEmit` gate would catch type regressions that `tsx` (which strips types without checking) does not. `tsx` does not type-check at runtime.
**Fix:** Add `"typecheck": "tsc --noEmit"` and run it alongside tests.

### IN-05: `availableMinutes` treats non-finite absence as "fully available" rather than "unknown"

**File:** `src/domain/capacity.ts:76-78`
**Issue:** A `NaN` absence becomes 0 absence → full 450 available (tested at capacity.test.ts:40-43). This is a deliberate documented choice (D-19), but it is the *optimistic* direction: a corrupted absence value makes a designer look maximally available rather than flagging uncertainty. Given the tool's purpose is to flag what needs sorting, silently treating bad data as "fully available" is the riskier default. Worth a second look as a product decision, not a code bug.
**Fix:** No code change required; confirm with the product owner that "bad absence data → assume fully available" is the intended degradation direction, and consider surfacing a data-quality flag.

---

_Reviewed: 2026-06-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
