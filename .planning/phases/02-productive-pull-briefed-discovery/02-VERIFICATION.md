---
phase: 02-productive-pull-briefed-discovery
verified: 2026-06-03T00:00:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 2: productive-pull-briefed-discovery Verification Report

**Phase Goal:** Real Productive data flows into trusted typed domain objects, and the studio's actual "briefed" convention is discovered and confirmed against live data so brief flags are correct from night one.
**Verified:** 2026-06-03
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Live Productive auth works; org-id confirmed (34092) | VERIFIED | 02-01-SUMMARY confirms HTTP 200 on `GET /people/686717` with X-Organization-Id=34092; captured fixture exists at `src/productive/__fixtures__/bookings-page.json` |
| 2 | Bookings/absences pulled, validated at a zod boundary (degrade-don't-throw), mapped to Booking[]/Absence[] contracts | VERIFIED | `BookingResource.safeParse` + `AllocationResource.safeParse` on every entry; `mapToBookingsAndAbsences` splits service→Booking / event→Absence; no bare `throw` reachable in client.ts, mappers.ts, gather.ts |
| 3 | The "Briefed" workflow column is resolved dynamically by name, and brief flags emit for all three failure modes (BRIEF-01/02/03) | VERIFIED | `buildBriefedPositionMap` matches on `name === "Briefed"` never on id; `assessBriefs` emits `"no-task"` / `"not-briefed"` / `"blank-brief"`; 16 briefed+brief tests pass |
| 4 | Tentative work is captured from /allocations and flagged shaky without counting as booked (D-07 revision + live-confirmed gap fix) | VERIFIED | gather pulls `/allocations` with set-difference against confirmed ids; `booking_type === "service"` allocation-only rows synthesized with `draft:true`; they flow into `tentativeMin`/`shaky` via unchanged Phase-1 capacity machinery |
| 5 | Internal-vs-client signal uses project_type_id (live-confirmed D-06 revision), not company-absence | VERIFIED | `indexProjects` in gather.ts: `isClientByProject.set(parsed.data.id, typeId === 2)`; 02-03-SUMMARY documents the live contradiction that forced this correction (SOLVD's own internal project has a company record) |
| 6 | CR-01 resolved: canceled allocations are not synthesized as tentative work | VERIFIED | allocationsQuery includes `filter[canceled]=false`; gather loop also checks `a.attributes.canceled === true` (defense-in-depth); `AllocationAttributes` captures `canceled` field; gather test "CR-01: a CANCELED allocation-only record is NOT synthesized" passes |
| 7 | CR-02 resolved: partial pull does not masquerade as complete; non-rostered rows are dropped | VERIFIED | `ROSTER` set + `seen` set in gather.ts; both bookings and allocations loops check `!ROSTER.has(personId)`; `assessedDesigners` derived from `seen`, not static roster; test "CR-02: a row with a missing person link does not count its designer as assessed" passes |
| 8 | A network/shape failure accumulates into sourceErrors and degrades, never crashing the run | VERIFIED | Every fetchPages call wrapped in Result check → `sourceErrors.push(...)` + degrade return or continue; wf-statuses failure degrades brief resolution only; gather has no bare throw; forced-error test in gather.test.ts passes |
| 9 | The src/domain → src/productive boundary is intact (domain never imports productive) | VERIFIED | `grep -rl "productive" src/domain/` returns nothing |
| 10 | NSW public holidays + studio closures produce a clock-compatible HolidaySet | VERIFIED | `holidays.ts` derives keys from `h.start` via luxon `toISODate()` in STUDIO_ZONE (not raw `h.date`); holiday tests pass including known key "2026-01-26" (Australia Day) |
| 11 | D-07: isTentative for work bookings is draft===true, not approval_status | VERIFIED | `grep "approval_status" src/productive/mappers.ts` returns only a doc comment (no code); `isTentative: a.draft === true` in mappers.ts line 165 |
| 12 | SC-4 live hand-check: gather → computeStudioReport produces capacity numbers and brief flags that agree with the Productive UI | VERIFIED | User confirmed "numbers + flags agree" (per task instructions: SC-4 hand-check performed and confirmed — Anisha 3.5h tentative, Ella 4.5h, Liam full); 02-04-SUMMARY records agreement table |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/productive/client.ts` | Result<T> client, env auth headers, pagination | VERIFIED | `authHeaders()` reads only from `process.env`; `fetchAllPages` paginates until `current_page >= total_pages`; no bare throw |
| `src/productive/schemas.ts` | zod boundary with corrected field names; ProjectResource, AllocationResource | VERIFIED | Uses `booking_method_id`, `draft`, `canceled`; exports `ProjectResource`, `AllocationResource`, `WorkflowStatusResource`, `JsonApiPage`; no `.parse` wrapper exported |
| `src/productive/types.ts` | Ingestion-internal raw types, no domain import | VERIFIED | No import statements; doc header warns not to use in domain |
| `src/config.ts` | Person IDs 686717/686712/686716, base URL, NSW region, closures | VERIFIED | All three IDs present; no auth token in code lines |
| `.env.example` | Secret-name template, no values | VERIFIED | Contains `PRODUCTIVE_AUTH_TOKEN=` and `PRODUCTIVE_ORG_ID=` with empty values |
| `src/productive/mappers.ts` | minutesOnDay (3 methods), workingDaysInRange, mapToBookingsAndAbsences | VERIFIED | All three booking_method_id cases; method-3 divisor guarded > 0; service→Booking / event→Absence split |
| `src/holidays.ts` | buildHolidaySet(NSW) + yearsForWindow | VERIFIED | Uses `h.start` via luxon, not `h.date`; merges STUDIO_CLOSURES |
| `src/productive/briefed.ts` | buildBriefedPositionMap + isBriefed | VERIFIED | Maps by name "Briefed"; no hardcoded status ids in code; position >= briefedPos (D-02 at-OR-past) |
| `src/productive/brief.ts` | BriefFlag + assessBriefs (three failure modes, no PM) | VERIFIED | All three reasons present in code; no PM field; `grep -iE "pm\|manager\|owner\|approver"` finds only doc comments |
| `src/productive/gather.ts` | Composition root; sourceErrors; assessedDesigners; /allocations; /projects via zod | VERIFIED | Composes all pieces; ROSTER gate + seen set; ProjectResource.safeParse on included projects; CR-01 + CR-02 fixes in place |
| `src/productive/__fixtures__/bookings-page.json` | Real captured /bookings page | VERIFIED | File exists; 6 bookings from a real 200 response; no secrets |
| `src/productive/__tests__/` | schemas, mappers, briefed, gather tests | VERIFIED | 4 test files; 128/128 pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `client.ts` | `process.env.PRODUCTIVE_AUTH_TOKEN / PRODUCTIVE_ORG_ID` | `authHeaders()` reads from env | WIRED | Code lines contain `process.env.PRODUCTIVE_AUTH_TOKEN` and `process.env.PRODUCTIVE_ORG_ID` |
| `client.ts` | `schemas.ts JsonApiPage` | `safeParse` on every page | WIRED | `JsonApiPage.safeParse(res.value)` in `fetchAllPages` |
| `mappers.ts` | `src/domain/types.ts` | imports TARGET_MINUTES + type Booking/Absence/DesignerId | WIRED | `import { TARGET_MINUTES } from "../domain/types.ts"` and `import type { Absence, Booking, DesignerId, HolidaySet }` |
| `mappers.ts` | `src/domain/clock.ts` | isWorkingDay for method-3 divisor | WIRED | `import { isWorkingDay } from "../domain/clock.ts"` |
| `holidays.ts` | `src/domain/clock.ts` | produces HolidaySet consumed by isWorkingDay | WIRED | Returns `ReadonlySet<string>` keyed by `toISODate()` — same format clock consumes |
| `briefed.ts` | `/workflow_statuses` position data | buildBriefedPositionMap resolves by name | WIRED | `s.attributes.name !== BRIEFED_STATUS_NAME` guard; `map.set(workflowId, s.attributes.position)` |
| `brief.ts` | `BriefFlag.reason` | no-task / not-briefed / blank-brief discrimination | WIRED | All three literal reason values in `assessBriefs` code |
| `gather.ts` | `src/domain/report.ts computeStudioReport` | produces StudioReportInput-shaped output (bookings, absences, assessedDesigners) | WIRED | `GatherResult` shape matches `StudioReportInput`; gather.test.ts feeds output into `computeStudioReport` and asserts well-formed report |
| `gather.ts` | `client/schemas/mappers/briefed/brief/holidays` | composes all smaller pieces | WIRED | All six imported and called in order; fetchAllPages, BookingResource.safeParse, AllocationResource.safeParse, mapToBookingsAndAbsences, buildBriefedPositionMap, assessBriefs, buildHolidaySet all present in gather.ts |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `gather.ts` | `rawBookings` | `fetchAllPages("/bookings", ...)` → `BookingResource.safeParse` | Yes — real Productive API, live-confirmed HTTP 200 | FLOWING |
| `gather.ts` | `rawBookings` (tentative) | `fetchAllPages("/allocations", ...)` → `AllocationResource.safeParse` → set-difference | Yes — live-confirmed Anisha 3.5h tentative captured | FLOWING |
| `gather.ts` | `briefedMap` | `fetchAllPages("/workflow_statuses", ...)` → `indexWorkflowStatuses` | Yes — 75 statuses live, 6 "Briefed" columns confirmed | FLOWING |
| `gather.ts` | `isClientByProject` | sideloaded projects in bookings `included` → `ProjectResource.safeParse` | Yes — project_type_id signal live-confirmed | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npm test` | 128/128 pass, 0 fail | PASS |
| TypeScript typecheck clean | `npx tsc --noEmit` | Exit 0, no output | PASS |
| briefed tests pass in isolation | `node --import tsx --test src/productive/__tests__/briefed.test.ts` | 16/16 pass | PASS |
| gather tests pass in isolation | `node --import tsx --test src/productive/__tests__/gather.test.ts` | 14/14 pass | PASS |
| Old schema field names absent from code | `grep -n "is_draft\|is_canceled\|booking_method[^_]" src/productive/schemas.ts` (non-comment lines only) | No matches | PASS |
| No approval_status in mapper code | `grep -n "approval_status" src/productive/mappers.ts` (non-comment lines) | No matches | PASS |
| No hardcoded status ids in briefed.ts code | `grep -n "101563\|111230" src/productive/briefed.ts` (non-comment lines) | No matches | PASS |
| No PM references in brief.ts code | `grep -iE "pm\|manager\|owner\|approver" src/productive/brief.ts` (non-comment lines) | No matches | PASS |
| No bare throw in production source | `grep -n "throw " src/productive/*.ts src/holidays.ts` (non-comment lines) | No matches | PASS |
| Domain boundary intact | `grep -rl "productive" src/domain/` | No files returned | PASS |
| No secrets in committed files | `grep -rIE "X-Auth-Token: [^$\"]" src/ .env.example` (non-comment code lines) | No matches | PASS |
| CR-01 filter on allocations query | `grep -n "filter\[canceled\]=false" src/productive/gather.ts` | 2 matches (lines 370 + 430) | PASS |
| CR-02 ROSTER gate present | `grep -n "ROSTER\|seen" src/productive/gather.ts` | ROSTER set + seen set, both loops check | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no conventional `scripts/*/tests/probe-*.sh` files exist. Phase relied on human-verify checkpoint gates (Tasks 4 of 02-01, Task 3 of 02-03, Task 2 of 02-04) and offline unit tests for verification.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BRIEF-01 | 02-01, 02-02, 02-03, 02-04 | For each booking on the target day, the check verifies a task is linked | SATISFIED | `assessBriefs` emits `reason: "no-task"` for bookings with `b.task === null`; test "confirmed booking with no task → no-task flag" passes |
| BRIEF-02 | 02-03, 02-04 | For each booking, the check verifies the task is marked "briefed" per the studio's actual Productive convention (mapping discovered against live data) | SATISFIED | `buildBriefedPositionMap` + `isBriefed(position >= briefedPos)` resolved dynamically by name; live-confirmed SOLVD Standard=3 / Design Retainers=2; SC-2 hand-check verified 4 real bookings |
| BRIEF-03 | 02-03, 02-04 | Bookings flagged by job/task, never by PM | SATISFIED | `BriefFlag` interface has no PM field; `jobLabel` is project/task title only; code-level grep for pm/manager/owner/approver in brief.ts returns nothing |

All three phase requirement IDs BRIEF-01, BRIEF-02, BRIEF-03 are marked Complete in REQUIREMENTS.md traceability table. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/productive/types.ts` | 40-42 | Stale `RawBookingAttributes` declares `booking_type: string` and `approval_status: number \| null` which do not exist on the live API (IN-01 from code review) | Info | No runtime impact — nothing imports these fields for execution; mapper uses its own `RawBookingForMapping`. Flagged in 02-02 and 02-04 summaries as known tech-debt for a future cleanup. |
| `src/productive/gather.ts` | ~305 | Synthetic `"alloc-"` service linkage id sentinel (IN-02) | Info | Works because mapper only checks linkage presence, not id validity. One-line comment documents the sentinel. No execution bug. |
| `src/productive/gather.ts` | ~188 | Magic literal `2` for `project_type_id` client signal (IN-05) | Warning | The direction was disputed and resolved live (internal=1, client=2). A named constant `PROJECT_TYPE_CLIENT = 2` with a comment would prevent a future reader from flipping it. Not a bug; not a blocker. |
| `src/productive/briefed.ts` | 26, 70 | Case-sensitive exact match on "Briefed" status name (IN-04) | Warning | A trailing-space typo in the Productive UI would yield no Briefed column for that workflow → all its tasks flag as not-briefed (false positives, not false trust). Fail-safe direction is defensible but noisy. Not a blocker. |
| `src/productive/gather.ts` | 121-125 | `descriptionNonEmpty` strips HTML but not `&nbsp;` entities (WR-02) | Warning | A brief containing only `&nbsp;` would pass the D-04 blank-brief guard — a false-trust miss in the edge case. Realistic in Productive rich-text. Not a blocker for night-one correctness but worth addressing before production. |

No TBD/FIXME/XXX debt markers found in any phase-modified file.

---

### Human Verification Required

SC-4 live hand-check was performed and confirmed by the user against the Productive UI (Anisha 3.5h tentative/shaky, Ella 4.5h booked/3h open, Liam 7.5h full). Treated as DONE per task instructions. No further human verification items required.

---

### Gaps Summary

No gaps. All 12 must-have truths are verified, all artifacts are substantive and wired, both critical code review findings (CR-01 canceled-allocation inflation, CR-02 partial-pull masquerade) are resolved with tests confirming the fix, and the SC-4 live hand-check is confirmed.

Remaining items from the code review (WR-02 `&nbsp;` entity, WR-03 no page cap, WR-04 unencoded query params, WR-05 empty targetKey degrade, IN-04 case-sensitive name match, IN-05 magic literal, IN-01 stale types.ts) are robustness hardening items that do not block the phase goal. They are appropriate candidates for a Phase 3 or housekeeping plan.

---

_Verified: 2026-06-03_
_Verifier: Claude (gsd-verifier)_
