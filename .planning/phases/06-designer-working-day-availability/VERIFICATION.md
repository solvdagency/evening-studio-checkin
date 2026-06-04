---
phase: 06-designer-working-day-availability
verified: 2026-06-04T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 6: Designer Working-Day Availability Verification Report

**Phase Goal:** Available hours for the target day reflect each designer's REAL working-day pattern
read from Productive (e.g. a 4-day or non-standard week), not a flat 7.5h every weekday — so a
designer is never flagged underbooked on a day they aren't rostered, and a non-working day is
mentioned without a flag.

**Verified:** 2026-06-04
**Status:** GOAL ACHIEVED
**Re-verification:** No — initial verification

---

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Rostered-minutes basis flows end-to-end: `g.rosteredMinutes` wired into `StudioReportInput.rosteredMinutes` at the composition root | VERIFIED | `src/index.ts:247` — `rosteredMinutes: g.rosteredMinutes` confirmed by grep; `computeStudioReport` uses it directly |
| 2 | Boundary correctly parses the live wire shape: JSON-encoded string of positional tuples | VERIFIED | `src/productive/schemas.ts:222-269` — `AvailabilityPeriod` is a `z.tuple().rest().transform()`; `PersonResource.availabilities` uses `z.preprocess(parseAvailabilitiesJson, ...)`; commit `a042430` |
| 3 | No flat-7.5h fallback anywhere in the availability path | VERIFIED | `grep "450\|TARGET_MINUTES" src/productive/gather.ts` returns only a doc comment; `TARGET_MINUTES` usage in `mappers.ts:124` is for booking-method-2 percentage calculation only (correct, unrelated to availability) |
| 4 | A non-working day renders "not in &lt;Weekday&gt;" with no open-time flag | VERIFIED | `src/index.ts:137-139` derives the note; `src/render/rows.ts:134-136` short-circuits the "off" branch, emitting `statusLine(d, escapedName, leaveNote)` with `offNote`; weekday name is `escapeHtml`-protected (T-06-07) |
| 5 | Test suite 305/305 green, `tsc --noEmit` exit 0 | VERIFIED | `npm test` output: `# tests 305 / # pass 305 / # fail 0`; `npx tsc --noEmit` produced no output (exit 0) |
| 6 | All hour/capacity arithmetic is deterministic code — no LLM involvement | VERIFIED | `src/domain/capacity.ts`, `src/domain/report.ts`, `src/productive/gather.ts`, `src/productive/mappers.ts` contain zero LLM calls; the only LLM reference in `report.ts` is a comment ("the LLM/renderer never recomputes them") |

**Score:** 6/6 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/capacity.ts` | `availableMinutes(rosteredMinutesForDay, absenceMinutesForDay)` — rostered basis | VERIFIED | Signature confirmed; basis is `Math.max(0, safeMinutes(rostered) - safeMinutes(absence))`; no `TARGET_MINUTES` import |
| `src/domain/report.ts` | `StudioReportInput.rosteredMinutes?: (designerId, dateKey) => number` | VERIFIED | Field present at line 92; used in `computeStudioReport` at lines 187-188 and 209/221 (per-designer and rollup) |
| `src/productive/schemas.ts` | `AvailabilityPeriod` tuple+transform; `PersonResource.availabilities` preprocess | VERIFIED | `AvailabilityPeriod` at line 222 — `z.tuple([string, string|null, z.array(z.number())]).rest(...).transform(...)`; `PersonResource` at line 264 with `z.preprocess(parseAvailabilitiesJson, ...)` |
| `src/productive/mappers.ts` | `availabilityToWeekdayMinutes`, `rosteredMinutesForWeekday` | VERIFIED | Both functions present and substantive: period selection, 7/14-element handling (D-08), `safe(h)*60` math, Mon=0..Sun=6 indexing via `dt.weekday - 1` |
| `src/productive/gather.ts` | `/people` pull (step 7b) + `rosteredMinutes` lookup on `GatherResult` | VERIFIED | Lines 584-651: dedicated `/people?filter[id]=...` call, `PersonResource.safeParse` per entry, `availabilityToWeekdayMinutes` mapping, all-zero exclusion (D-06), `rosteredMinutes` closure at line 634; returned at line 684 |
| `src/index.ts` | `rosteredMinutes: g.rosteredMinutes` in `StudioReportInput`; `leaveNotes` derivation | VERIFIED | Line 247 wires the field; lines 131-139 build `leaveNotes` with "not in {targetWeekday}" for `status === "off" && rosteredMinutes(...) === 0` |
| `src/render/rows.ts` | `statusLine` `offNote` argument; `buildRow` "off" branch reads `leaveNotes` | VERIFIED | `statusLine` at line 60 accepts optional `offNote`; "off" branch at line 68-70 emits `escapeHtml(offNote)` when present; `buildRow` at line 129 reads `ctx.leaveNotes?.[d.designerId]` and passes it into the "off" short-circuit at line 135 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `gather.ts` `/people` pull | `GatherResult.rosteredMinutes` | `availabilityToWeekdayMinutes` → closure at line 634 | WIRED | Lookup built from `availabilityByDesigner` map; returned in the result object |
| `GatherResult.rosteredMinutes` | `StudioReportInput.rosteredMinutes` | `src/index.ts:247` `rosteredMinutes: g.rosteredMinutes` | WIRED | Exact assignment confirmed by grep |
| `StudioReportInput.rosteredMinutes` | `computeDesignerDay` per designer | `report.ts:209` `rosteredMinutesFor(designerId, targetKey)` | WIRED | Also used in rollup loop at line 221 |
| `report.designers[].status === "off"` | `leaveNotes[designerId] = "not in {day}"` | `index.ts:137-139` conditional | WIRED | Condition: `status === "off" && rosteredMinutes(d.designerId, report.targetDay) === 0` |
| `leaveNotes` | `statusLine(d, escapedName, leaveNote)` | `buildRow` "off" short-circuit at rows.ts:135 | WIRED | The off-branch passes `leaveNote` into `statusLine` which emits `escapeHtml(offNote)` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `gather.ts` `/people` step | `availabilityByDesigner` | Live `/people?filter[id]=...` → `PersonResource.safeParse` | Yes — real Productive API response, tuples parsed and transformed | FLOWING |
| `report.ts` `computeStudioReport` | `rosteredMinutesFor(designerId, dateKey)` | `input.rosteredMinutes` closure backed by `availabilityByDesigner` | Yes — per-weekday minutes from parsed live availability periods | FLOWING |
| `rows.ts` `buildRow` | `leaveNote` / "not in {Weekday}" | `ctx.leaveNotes[designerId]` set in `buildRenderContext` from the `status === "off" && rosted === 0` check | Yes — derived from real report output, not hardcoded | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `npm test` | 305 tests, 305 pass, 0 fail | PASS |
| TypeScript compilation clean | `npx tsc --noEmit` | exit 0, no output | PASS |
| Wiring line present | `grep "rosteredMinutes: g.rosteredMinutes" src/index.ts` | line 247 | PASS |
| No flat-450 availability fallback in gather | `grep "450\|TARGET_MINUTES" src/productive/gather.ts` | single doc-comment line only | PASS |
| `DayStatus` unchanged | `grep "DayStatus =" src/domain/capacity.ts` | `"off" \| "underbooked" \| "overbooked" \| "ok"` — no new value | PASS |
| Live-shape regression test exists | `grep "LIVE_AVAILABILITIES_STRING" src/productive/__tests__/gather.test.ts` | verbatim live payload at line 840 | PASS |
| Fix commit exists | `git show a042430 --stat` | `fix(06-02): parse live availabilities JSON-string-of-tuples shape` — touches schemas.ts + gather.test.ts | PASS |

---

## Anti-Patterns Found

None. Scan of phase-modified files (`src/domain/capacity.ts`, `src/domain/report.ts`,
`src/productive/schemas.ts`, `src/productive/mappers.ts`, `src/productive/gather.ts`,
`src/index.ts`, `src/render/rows.ts`) found:

- No `TBD`, `FIXME`, or `XXX` markers
- No stub returns (`return null`, `return []`, `return {}`)
- No hardcoded-empty props at call sites
- `TARGET_MINUTES` in `mappers.ts:124` is the booking-method-2 percentage basis — correct
  and unrelated to the availability capacity path (method 2 is a booking input, not an
  availability fallback)

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CAP-06 | Available hours reflect designer's actual working-day pattern; never flagged underbooked on a day not rostered; non-working day mentioned without a flag | SATISFIED | End-to-end: live availability parsed → rostered minutes → `computeDesignerDay` → "off" status → "not in {Weekday}" wording with no open-time flag; live smoke check approved 2026-06-04 |

---

## Deferred Follow-up (Not a Phase Failure)

**D-06 vs D-18 degrade-path tension** — reviewed with Liam 2026-06-04 and deliberately deferred.

When the `/people` availability pull fails (network error, parse failure, all-zero week), `gather`
pushes the error into `sourceErrors`. `selectVariant` (`src/render/variants.ts:28`, decision D-18)
treats any non-empty `sourceErrors` as a whole-card degraded variant, which defeats the D-06
per-designer intent — an availability-unreadable designer should show a 🤖 "couldn't read" row
inside the normal figures-bearing card, not trigger a full-card degrade.

This is trust-safe (still posts, invents no capacity, no silent skip), but lower-quality copy
(internal-sounding degrade text). Fixing it requires reopening the locked D-18 decision and
routing availability errors separately from figures (bookings) errors. Deferred as a scoped
follow-up task.

---

## Human Verification Required

None — the Task 3 blocking `checkpoint:human-verify` was run and approved by Liam on 2026-06-04
against live Productive and the TEST Chat space. The approved live card output was:

- `⚪ Anisha Gittins — not in Friday` (mentioned, no flag — CAP-06 SC-2)
- `🔴 Liam 5.5h open / 2.0h booked` (real rostered hours — CAP-06 SC-1)
- `🔴 Ella 3.5h open / 4.0h booked` (real rostered hours)
- Week rollup excludes Anisha's non-working days (CAP-06 SC-3)

---

## Summary

**GOAL ACHIEVED.** All six must-have truths are verified against the actual codebase.

The rostered-minutes pipeline is complete and correctly wired end-to-end:

1. Live availability read from Productive `/people` via a dedicated call (not a bookings sideload).
2. The live JSON-string-of-tuples wire shape is correctly handled at the zod boundary (commit
   `a042430` fixed the production bug caught by the smoke check; regression tests pin the exact
   live payload).
3. Per-weekday minutes flow through `GatherResult.rosteredMinutes` → `StudioReportInput.rosteredMinutes`
   → `computeDesignerDay` / rollup. No flat-450 fallback exists in the availability path.
4. A routine non-working day renders "not in {Weekday}" (HTML-escaped) with no open-time flag,
   reusing the existing "off" status with no new `DayStatus` value.
5. All arithmetic is deterministic — no LLM involvement anywhere in the capacity chain.
6. 305/305 tests pass; TypeScript compiles clean.

The one known quality gap (D-06 vs D-18 degrade-path tension) is trust-safe, was reviewed with
the user, and is deliberately deferred — it does not block the phase goal.

---

_Verified: 2026-06-04_
_Verifier: Claude (gsd-verifier)_
