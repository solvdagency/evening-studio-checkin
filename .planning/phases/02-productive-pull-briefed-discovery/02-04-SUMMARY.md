---
phase: 02-productive-pull-briefed-discovery
plan: 04
subsystem: ingestion
tags: [productive, gather, composition-root, sourceErrors, assessedDesigners, D-06, D-08, BRIEF-01, BRIEF-02, BRIEF-03, SC-4]

# Dependency graph
requires:
  - phase: 01-core-math-clock
    provides: "computeStudioReport + StudioReportInput contract (assessedDesigners present-but-empty vs absent semantics) gather feeds; nextWorkingDay/restOfWeekWindow for the window"
  - phase: 02-productive-pull-briefed-discovery
    plan: 01
    provides: "Result<T> client + fetchAllPages, zod boundary schemas (BookingResource, WorkflowStatusResource, ProjectResource), confirmed org-id 34092"
  - phase: 02-productive-pull-briefed-discovery
    plan: 02
    provides: "mapToBookingsAndAbsences (service/event split, per-day minutes D-09), buildHolidaySet + yearsForWindow"
  - phase: 02-productive-pull-briefed-discovery
    plan: 03
    provides: "buildBriefedPositionMap + isBriefed, assessBriefs + AssessBookingInput/BriefFlag, live-confirmed include chain + project_type_id D-06 signal"
provides:
  - "src/productive/gather.ts — gather(deps): the ingestion composition root; one call → { bookings, absences, briefFlags, holidays, assessedDesigners, sourceErrors }"
  - "Proven end-to-end against LIVE Productive: gather → computeStudioReport produces real per-designer hours, rollup, and brief flags"
  - "LIVE-CORRECTED include set: person,service,event,task,task.workflow_status,task.project,task.project.company (the prior task,*-only set dropped every booking)"
affects: [phase-03-render, productive-ingestion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composition root with injected deps (now + fetchPages) — deterministic + offline-testable, mirrors computeStudioReport's injected-now"
    - "Never throws across the boundary: every source failure (client error, zod drift, missing credential) accumulates into sourceErrors and degrades"
    - "assessedDesigners carries ONLY designers a successful pull reached — a failed pull → empty → report names the whole roster as missingDesigners"
    - "Per-window-day dated Booking/Absence (date tag) so the report rollup attributes minutes; brief flags are target-day-only (D-08)"
    - "D-06 isClient via project_type_id===2 (client), parsed through ProjectResource.safeParse; unresolved → fail-safe internal (no false client flag)"

key-files:
  created:
    - src/productive/gather.ts
    - src/productive/__tests__/gather.test.ts
  modified: []

key-decisions:
  - "LIVE BUG FIX: the gather /bookings include MUST carry person,service,event in addition to the brief chain. With task,task.* only, service/event/person arrive as { meta: { included: false } }, the mapper drops every booking (live pull returned 0 from a working 200), and designerId is empty. Corrected set resolves work-vs-absence, roster match, and the brief chain in one call."
  - "A no-task booking can only be brief-flagged when isClient is known. Since isClient comes from task→project→project_type_id (services link via deal, not project — 02-03), a booking with NO task has no project to test → treated fail-safe internal (suppressed). Conservative: avoids false 'no-task' client flags on internal work; accepts that a genuinely-client no-task booking would not flag. Matches 02-03's 'treat unresolved fail-safe, do not crash'."
  - "Workflow statuses are a SEPARATE /workflow_statuses?include=workflow call (the brief-chain include sideloads statuses WITHOUT their workflow linkage — wf=none live). That call builds BOTH the Briefed-position map and the statusId → {workflowId, position} index a task's status id is resolved through (02-03 decision, confirmed live)."

patterns-established:
  - "gather is the ingestion-tier twin of computeStudioReport — a single composition root that assembles pure pieces and degrades (sourceErrors) rather than throwing"

requirements-completed: [BRIEF-01, BRIEF-02, BRIEF-03]

# Metrics
duration: ~25min
completed: 2026-06-03
---

# Phase 2 Plan 04: Gather Composition Root & Live End-to-End Summary

**A single `gather()` call now pulls the three designers' bookings + absences over the target→Friday window, validates every response at the zod boundary, resolves the brief chain, and assembles exactly what Phase 3 needs — and the full pipeline runs end-to-end against LIVE Productive, producing real per-designer hours and correctly-briefed flags, while never throwing across the boundary.**

## Performance

- **Duration:** ~25 min (incl. live diagnosis + fix of the include-set bug)
- **Tasks:** 2 (1 `type=auto tdd=true`, 1 `checkpoint:human-verify` — the SC-4 UI hand-check, paused for the user)
- **Files:** 2 created, 0 modified (Phase 1 domain untouched)
- **Tests:** 7 new (gather); full suite 118/118 green; `tsc --noEmit` exit 0

## Accomplishments

- **`src/productive/gather.ts`** — `gather(deps)` composition root. Injected deps `{ now, fetchPages? }` (fetchPages defaults to the real `fetchAllPages`, stubbable for offline tests). Pipeline:
  1. `buildHolidaySet(yearsForWindow(now), STUDIO_CLOSURES)` → target day + rest-of-week window (mirrors `computeStudioReport`'s clock derivation).
  2. `fetchAllPages("/bookings", query)` with `filter[person_id]=686717,686712,686716`, `filter[after]=targetKey`, `filter[before]=lastWindowKey`, `filter[canceled]=false`, and the corrected include set. On a Result error → push to `sourceErrors`, return a degraded-but-well-formed result.
  3. `BookingResource.safeParse` per entry (drift → skip + sourceErrors note).
  4. Separate `/workflow_statuses?include=workflow` call → `buildBriefedPositionMap` + a `statusId → {workflowId, position}` index (a task exposes only its status id; its workflow is resolved through this index). A wf-statuses error degrades brief resolution only — capacity still computes.
  5. `ProjectResource.safeParse` over the sideloaded projects → `projectId → isClient` (project_type_id===2). Raw projects JSON never crosses the boundary (T-02-18).
  6. Per window day, `mapToBookingsAndAbsences(rawBookings, dayKey, holidays)`, tagging each output with `date` (DatedBooking/DatedAbsence) so the report's rollup attributes minutes correctly.
  7. `assessBriefs` over the TARGET-day work bookings → `BriefFlag[]` (D-08 target-day only).
  8. `assessedDesigners` = the designers a successful pull reached (the queried roster on success; empty on a failed pull → report surfaces missingDesigners).
- **`src/productive/__tests__/gather.test.ts`** — 7 offline tests with a stubbed fetcher: happy path (empty sourceErrors, all three assessed), dated output, client-error degrade (empty bookings + non-empty sourceErrors, no throw), wf-statuses error degrades brief-only, partial pull → `report.missingDesigners` names the whole roster, end-to-end `computeStudioReport` produces a well-formed report (target 2026-06-04, no missing), and a never-throws-when-everything-fails assertion.

## SC-4 Live Hand-Check — AWAITING USER CONFIRMATION

**This is a `checkpoint:human-verify` gate. The numbers + flags below were gathered from LIVE Productive by running the full `gather → computeStudioReport` pipeline. The UI comparison requires the user's eyes — it has NOT been self-approved.** No token or full auth URL was printed in any probe; all temporary probe scripts were deleted (not committed).

**Run:** `now` = 2026-06-03 evening (studio zone) → **target day 2026-06-04**, window `2026-06-04, 2026-06-05`. Source errors: **none**. Raw pull: **6 bookings, 0 absences** for the three designers.

| Designer | Status | Available | Booked | Tentative | Open |
|----------|--------|-----------|--------|-----------|------|
| Liam Mills | ok | 7.50h | 7.50h | 0.00h | 0.00h |
| Anisha Gittins | underbooked | 7.50h | 0.00h | 0.00h | 7.50h |
| Ella Wright | underbooked | 7.50h | 4.50h | 0.00h | 3.00h |

**Rest-of-week rollup (net of time-off):** Total 45.00h, Open 33.00h.
**Missing designers:** none. **Assessed:** all three.

**Brief flags:** **none** — and this is a true negative, not a suppression bug, verified against the live brief chain:
- Liam's target-day booking → task 17993738, project 943726 `project_type_id=1` (internal) → correctly **suppressed** (D-06).
- Ella's two client target-day bookings → tasks 18157763 (project 681461, type 2 = client; status 111230 "Briefed" pos 2, non-empty brief) and 18160726 (project 938043, type 2 = client; status 101563 "Briefed" pos 3, non-empty brief) → both **fully briefed** → no flag (D-02 at/past Briefed + D-04 non-empty).
- The separate `/workflow_statuses` call resolved 75 statuses, **6 "Briefed" columns** (matches 02-03 exactly), and resolved each task's status → workflow + position correctly.

**What the USER must confirm in the Productive UI for 2026-06-04 (resume signal: "numbers + flags agree", or list each discrepancy with the UI value):**
1. Liam ~7.5h booked (full day), Anisha 0h booked, Ella ~4.5h booked / 3h open (within 0.25h rounding).
2. No designer has time-off on 2026-06-04 (the pipeline saw 0 absences — confirm none is hidden).
3. The two flagged-as-briefed Ella client jobs (tasks 18157763 "STR_050 Federal Budget — Media Analysis" and 18160726 "Provide design files for 'level 1 water restriction' icon") genuinely sit at/past the Briefed column with a filled brief — i.e. correctly NOT flagged.
4. Liam's "Liams Booking Time for Ai" is genuinely internal (correctly NOT flagged), and no PM name appears anywhere.

## Task Commits

1. **Task 1: gather composition root** — `07ec385` (feat) [test + impl together; behavior pinned by 7 offline tests against the captured fixture, GREEN]
2. **Task 2 (Rule 1 fix surfaced by the live probe): correct include set** — `8f28974` (fix)

**Plan metadata:** committed separately with STATE/ROADMAP/REQUIREMENTS updates.

## Decisions Made

- **Separate /workflow_statuses call is required** (not a deep include): the bookings brief-chain include sideloads each status WITHOUT its `workflow` linkage (`wf=none` live), so the statusId→workflow index can only be built from `/workflow_statuses?include=workflow`. Confirmed live; matches 02-03.
- **No-task bookings fail-safe to internal** (suppressed) because isClient is only knowable via task→project→project_type_id. Conservative against false client flags (see key-decisions).
- **assessedDesigners on a successful pull = the queried roster.** A designer with zero rows is present-but-empty (assessed, underbooked with full open), NOT missing — only a FAILED pull yields empty assessedDesigners and surfaces the roster as missing (T-02-15 honored).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] gather /bookings include set dropped every booking (live)**
- **Found during:** Task 2 (the SC-4 live probe)
- **Issue:** The include set written from the 02-03 guidance was `task,task.workflow_status,task.project,task.project.company` — it omitted `person`, `service`, and `event`. Against live Productive those relationships then arrive as `{ meta: { included: false } }`, so `mapToBookingsAndAbsences` (which splits on the `service`/`event` linkage) dropped ALL 6 bookings and `designerId` resolved empty. The live pull returned a clean HTTP 200 with data but gather produced 0 bookings — a silent empty-result bug exactly of the class the phase guards against.
- **Fix:** Corrected the include to `person,service,event,task,task.workflow_status,task.project,task.project.company`. Re-ran the live probe: 6 bookings now map, designerIds resolve to the roster, capacity + brief flags compute correctly.
- **Files modified:** src/productive/gather.ts
- **Verification:** Live probe now returns real per-designer hours; `tsc --noEmit` exit 0; 118/118 tests green (the offline fixture tests use the 02-01 fixture which already had service/event linkages, so they passed before and after — the bug only manifested against the live include behavior, which is why the live gate caught it).
- **Committed in:** `8f28974`

**Total deviations:** 1 auto-fixed (Rule 1 bug — the exact value of the SC-4 live gate: catching include/relationship drift that the fixture could not).

## Known Stubs

None. `gather` is fully wired against live Productive. The one deliberate conservatism — no-task bookings fail-safe to internal — is documented above, not a stub.

## Threat Surface

All five plan threats are mitigated:
- **T-02-14** (a failed call crashing the run): client Result + per-entry safeParse; every failure → sourceErrors; gather has no reachable throw; tested with forced errors (incl. all-sources-fail).
- **T-02-15** (partial pull masquerading as complete): assessedDesigners carries only reached designers; a failed pull → empty → `report.missingDesigners` names the roster; tested.
- **T-02-16** (token leaking in a debug print): probe scripts printed figures/names/counts only, never the token or full auth URL; deleted, not committed.
- **T-02-17** (numbers disagreeing with the UI): SC-4 hand-check is a blocking gate — **paused for the user**, not self-approved.
- **T-02-18** (unvalidated /projects JSON): projects parsed via `ProjectResource.safeParse`; drift → skip (fail-safe internal), never a thrown crash.

No new threat surface: gather adds outbound GETs (bookings, workflow_statuses) already covered by the Result client; no new auth path, no new schema at a trust boundary beyond the existing zod gate.

## Next Phase Readiness

- The phase's end-to-end spine is complete: one `gather()` call → live data → `computeStudioReport` → a well-formed StudioReport with exact capacity numbers and correct brief flags. Phase 3 consumes `{ bookings, absences, briefFlags, holidays, assessedDesigners, sourceErrors }`.
- **Blocking on:** the SC-4 UI hand-check (user confirmation that the printed figures + flags match the Productive UI for the target day). Code is complete; only the human eyes-on comparison remains.
- Carried tech-debt unchanged: `src/productive/types.ts` still declares the stale `booking_type`/`approval_status` raw interface (unused by any code path). Left untouched per scope; a future cleanup can drop it.

## Self-Check: PASSED

- Files: src/productive/gather.ts, src/productive/__tests__/gather.test.ts — both FOUND.
- Commits: 07ec385, 8f28974 — both present in git log.
- Verification: full suite 118/118, `tsc --noEmit` exit 0, acceptance greps confirmed (ProjectResource.safeParse on the projects path, all key pieces composed, no reachable throw, sourceErrors present, `grep -rl productive src/domain` empty), live gather → computeStudioReport ran clean.
- Temp probe scripts removed; no secret values in committed files.

---
*Phase: 02-productive-pull-briefed-discovery*
*Completed: 2026-06-03 (SC-4 hand-check awaiting user confirmation)*
