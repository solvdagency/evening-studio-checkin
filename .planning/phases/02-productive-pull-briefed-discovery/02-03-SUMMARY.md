---
phase: 02-productive-pull-briefed-discovery
plan: 03
subsystem: ingestion
tags: [productive, briefed, workflow-status, brief-flags, D-02, D-03, D-04, D-06, BRIEF-01, BRIEF-02, BRIEF-03]

# Dependency graph
requires:
  - phase: 01-core-math-clock
    provides: "DesignerId branded type + the pure-function/fail-safe house style isBriefed mirrors"
  - phase: 02-productive-pull-briefed-discovery
    plan: 01
    provides: "Corrected zod boundary schemas, tolerant Relationship shape, ProjectResource company signal, confirmed org-id 34092"
  - phase: 02-productive-pull-briefed-discovery
    plan: 02
    provides: "Booking/Absence mappers; service-vs-event relationship work-vs-absence split"
provides:
  - "src/productive/briefed.ts — buildBriefedPositionMap (resolve Briefed position by NAME per workflow, D-01/D-03) + isBriefed (at-or-past + non-empty, D-02/D-04)"
  - "src/productive/brief.ts — BriefFlag output shape + assessBriefs (three failure modes by job/task, never PM, BRIEF-01/02/03)"
  - "schemas.ts WorkflowStatusResource (status + workflow relationship linkage)"
  - "LIVE-CONFIRMED: single-call include chain task,task.workflow_status,task.project,task.project.company (A7)"
  - "LIVE-CONFIRMED: Briefed positions SOLVD Standard=3, Design Retainers=2 (D-01), resolved by name"
  - "LIVE-CORRECTED: D-06 internal/client signal is project_type_id (internal=1, client=2), NOT company-absence"
affects: [02-04-gather, productive-ingestion, brief-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Briefed resolution mirrors capacity.classifyDay: pure, ordered, D-cited, fail-safe-default (undefined -> false)"
    - "Briefed position resolved dynamically by status NAME 'Briefed' per workflow — status ids never hardcoded (D-03)"
    - "BriefFlag carries no PM field; jobLabel is project/task title only (BRIEF-03) — enforced by code-level grep guard"
    - "assessBriefs takes pre-resolved isClient / isTargetDay / task-status so it stays pure and unit-testable (gather resolves the chains)"

key-files:
  created:
    - src/productive/briefed.ts
    - src/productive/brief.ts
    - src/productive/__tests__/briefed.test.ts
  modified:
    - src/productive/schemas.ts

key-decisions:
  - "A7 RESOLVED: include=task,task.workflow_status,task.project,task.project.company resolves the whole chain in ONE /bookings call — no follow-up /tasks fetch needed. A task's workflow_status relationship gives its current status id directly."
  - "Task workflow id is NOT exposed on the task (no workflow_id attribute; status's workflow rel is included:false). Resolve a task's workflow via a one-time /workflow_statuses?include=workflow call that indexes statusId -> {workflowId, position} AND builds the Briefed-position map. 02-04 must make this call."
  - "D-01 CONFIRMED live: SOLVD Standard Workflow Briefed=position 3, SOLVD Design Retainers Briefed=position 2 (map of 6 workflows), resolved by name dynamically."
  - "D-06 CORRECTED live: company-absence is UNRELIABLE for SOLVD — the internal 'Solvd Ai' project IS linked to a company (SOLVD Agency's own record). The reliable signal is project_type_id (live: internal=1, client=2), via task -> project (NOT service -> project; services link via deal)."

patterns-established:
  - "isBriefed fail-safe default (workflow missing from map -> false) is the briefed analogue of Phase 1's floor-at-0 / coerce-NaN-to-0 instinct"
  - "Live-data correction of a research assumption recorded in the module doc-header (as 02-01 did with the schema)"

requirements-completed: [BRIEF-01, BRIEF-02, BRIEF-03]

# Metrics
duration: 6min
completed: 2026-06-03
---

# Phase 2 Plan 03: Briefed Resolution & Brief Flags Summary

**The studio's actual "Briefed" convention is now resolved dynamically per workflow by column name (SOLVD Standard=3, Retainers=2, live-confirmed), and each confirmed client target-day booking reports task-linked / briefed / blank-brief by job/task (never PM) — with the internal/client signal corrected against live data from the unreliable company-absence to `project_type_id`.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 3 (2 `type=auto tdd=true`, 1 `checkpoint:human-verify` run as a self-served live probe)
- **Files:** 3 created, 1 modified
- **Tests:** 16 new (briefed + brief); full suite 111/111 green; `tsc --noEmit` exit 0

## Accomplishments

- **`src/productive/briefed.ts`** — `buildBriefedPositionMap(statuses)` builds `Map<workflowId, position>` by matching the status NAME `"Briefed"` and keying on the status's `workflow` relationship id; the live status ids (101563/111230/…) are never hardcoded (D-03). `isBriefed(taskStatus, map)` returns true only when `position >= briefedPos` (D-02 at-OR-past) AND `descriptionNonEmpty` (D-04), and false when the workflow is absent from the map (D-03 fail safe).
- **`src/productive/brief.ts`** — exported `BriefFlag` interface (per-field documented, no PM field) and `assessBriefs(bookings, briefedMap)` emitting one flag per confirmed client target-day booking that is not fully briefed: `no-task` (BRIEF-01/D-10) / `not-briefed` (BRIEF-02) / `blank-brief` (D-04). Tentative (D-05), internal (D-06), and non-target-day (D-08) bookings are suppressed.
- **`schemas.ts`** — added `WorkflowStatusResource` carrying the `workflow` relationship linkage (the status→workflow key the Briefed map needs).
- **Live verification probe (Task 3)** — confirmed the include chain, the Briefed positions, the briefed verdicts against real tasks, and corrected the D-06 signal. Probe scripts were temporary and removed (never committed); only safe structural facts were printed (no token, no full URL with auth).

## Live Verification Results (Task 3 — human-verify gate, self-served)

**A7 — include chain depth: RESOLVED (single call).**
`GET /bookings?...&include=task,task.workflow_status,task.project,task.project.company` returns `tasks`, `workflow_statuses`, `projects`, and `companies` all sideloaded in one call. A task's `workflow_status` relationship resolves directly to a status id; the status carries `position`. No follow-up `/tasks` fetch is needed. **02-04 must use this include set.**

**Briefed map — D-01 CONFIRMED (resolved by name):**
| Workflow | Briefed position |
|----------|------------------|
| SOLVD Standard Workflow | **3** |
| SOLVD Design Retainers | **2** |
| SOLVD Accounts & Operations | 2 |
| Media Bookings | 2 |
| Standard Workflow | 4 |
| Training & Staff Development | 4 |

Matches D-01 exactly for the two known workflows. Built by NAME from `/workflow_statuses` (75 statuses, 6 with a "Briefed" column).

**SC-2 hand-check — verdicts agree with live UI semantics (4 real bookings):**
| Task | Status (pos) | Workflow | descNonEmpty | Verdict |
|------|--------------|----------|--------------|---------|
| Collect Props from attic | Complete (9) | SOLVD Standard | yes | **briefed** (past-Briefed, D-02 case live) |
| STR_050 Federal Budget | Briefed (2) | SOLVD Design Retainers | yes | **briefed** |
| Provide design files (water restriction) | Briefed (3) | SOLVD Standard | yes | **briefed** |
| Liams Booking Time for Ai | Not Started (1) | Ai Workflow | no | **not briefed** |
Plus 2 bookings with **no task** → would flag `no-task` (BRIEF-01). The past-Briefed "Complete" case proves D-02 works against live data (a `== Briefed` check would have wrongly flagged it).

**D-06 — internal/client signal: CONTRADICTION found and corrected live.**
The known internal booking "Liams Booking Time for Ai" → project **"Solvd Ai"** has `company = YES (SOLVD Agency)` and `project_type_id = 1`. So **company-absence (the RESEARCH-recommended primary signal) does NOT work for SOLVD** — internal projects carry SOLVD's own company record. The reliable signal is **`project_type_id`**: internal "Solvd Ai" = **1**; all three client projects (Hunter Water, STREEM) = **2**. This resolves the disputed enum direction live: **internal=1, client=2**. The resolution chain is **task → project → project_type_id**, NOT service → project (services expose only a `deal` relationship, no `project`). `assessBriefs` is unchanged — it still takes a pre-resolved `isClient` boolean; only 02-04's derivation of that boolean must use `project_type_id`, documented in `brief.ts`.

**No secret value was printed in any probe output.**

## Task Commits

1. **RED — failing tests (Tasks 1+2 share briefed.test.ts)** — `07a13f6` (test)
2. **Task 1: dynamic Briefed map + isBriefed (D-02/D-03/D-04)** — `b5a665e` (feat) [GREEN]
3. **Task 2: BriefFlag emission, three failure modes (BRIEF-01/02/03)** — `fb730e6` (feat) [GREEN]
4. **Task 3 outcome: live-confirmed D-06 signal correction** — `8d3b324` (docs)

**Plan metadata:** committed separately with STATE/ROADMAP/REQUIREMENTS updates.

## Decisions Made

- **Single-call include is sufficient (A7).** Confirmed live; 02-04 gathers tasks, statuses, projects, and companies in one `/bookings` call plus one `/workflow_statuses?include=workflow` call.
- **Task workflow is resolved via its current status id, not a task attribute.** Tasks expose no `workflow_id`; the status's `workflow` relationship is `included:false`. The one-time `/workflow_statuses?include=workflow` call indexes both `statusId → {workflowId, position}` (to find a task's workflow + position) and the Briefed-position map. Documented for 02-04.
- **D-06 signal is `project_type_id`, not company-absence** (live correction — see above).
- **blank-brief vs not-briefed ordering.** A not-briefed task is classified `blank-brief` only when it is at/past Briefed but blank; a task before the Briefed column is `not-briefed` even if also blank (its actionable failure is the status). Unit-tested.

## Deviations from Plan

### Auto-fixed / live-corrected

**1. [Rule 2 — live correction] D-06 internal/client signal changed from company-absence to project_type_id**
- **Found during:** Task 3 (live human-verify probe)
- **Issue:** RESEARCH A2/A3 and the plan's `<interfaces>` named company-absence as the load-bearing internal-vs-client signal. Live data contradicts this for SOLVD: the internal "Solvd Ai" project IS linked to SOLVD Agency's own company, so company-absence would never flag it internal — every internal booking would be brief-flagged as client noise (defeating D-06).
- **Fix:** Recorded the reliable signal (`project_type_id`: internal=1, client=2, via task→project) in `brief.ts` doc-headers and the `isClient` field comment. No code change to `assessBriefs` — it already takes a pre-resolved `isClient` boolean, so the correction lands cleanly in 02-04's derivation.
- **Files modified:** src/productive/brief.ts
- **Committed in:** `8d3b324`

**2. [Rule 3 — supporting] Added WorkflowStatusResource schema**
- **Found during:** Task 1
- **Issue:** schemas.ts (02-01) had `WorkflowStatusAttributes` but no full resource schema carrying the `workflow` relationship the Briefed map keys on.
- **Fix:** Added `WorkflowStatusResource` (id + type + attributes + loose relationships with `workflow`). Tolerant, mirrors the existing schema style.
- **Files modified:** src/productive/schemas.ts
- **Committed in:** `b5a665e`

**Total deviations:** 1 live correction (D-06 signal — high-value, the whole point of the Task-3 gate), 1 supporting schema add. No scope creep.

## Known Stubs

None. Both modules are fully wired and unit-tested. `assessBriefs` intentionally takes pre-resolved `isClient` / `isTargetDay` / task-status inputs (purity boundary) — the resolution of those from raw Productive shapes is owned by 02-04 (gather), not a stub here.

## Issues Encountered

- The acceptance greps (`101563`/`111230` in briefed.ts; `pm|manager|owner|approver` in brief.ts) match only explanatory doc comments that name the forbidden things in order to forbid them — same situation 02-01 documented. Confirmed at the code level (non-comment lines): briefed.ts hardcodes no status ids; brief.ts has no PM field/variable. The `BriefFlag`-has-no-PM-field test also asserts this structurally.

## Threat Surface

All five plan threats are mitigated and tested:
- **T-02-09** (over-strict Briefed): D-02 at-or-past compare; unit test for the past-Briefed case; live SC-2 confirmed "Complete" (pos 9) reads as briefed.
- **T-02-10** (blank-brief false-trust): D-04 non-empty guard; unit test; live "Liams Booking Time for Ai" (blank) reads not-briefed.
- **T-02-11** (internal work flagged as noise): D-06 suppression via `isClient`; live signal corrected to `project_type_id` so internal IS detectable.
- **T-02-12** (surfacing a PM): `BriefFlag` has no PM field; code-level grep + a structural test assert it; `jobLabel` is project/task only.
- **T-02-13** (hardcoded status ids): D-03 dynamic name resolution; code-level grep confirms no literal status ids.

No new threat surface introduced (pure functions over pre-resolved inputs; no network/IO added in these modules).

## Next Phase Readiness

- **For 02-04 (gather):** use the live-confirmed include set `include=task,task.workflow_status,task.project,task.project.company` on `/bookings`, plus one `/workflow_statuses?include=workflow` call to build BOTH the Briefed-position map and the `statusId → {workflowId, position}` index (tasks don't expose their workflow id). Derive `isClient` from `project_type_id` (internal=1, client=2), NOT company-absence. Feed pre-resolved `AssessBookingInput`s to `assessBriefs`.
- BRIEF-01/02/03 are implemented and live-validated; the brief half of the pipeline is real.
- No blockers.

## Self-Check: PASSED

- Files: src/productive/briefed.ts, src/productive/brief.ts, src/productive/__tests__/briefed.test.ts — all FOUND; src/productive/schemas.ts modified.
- Commits: 07a13f6, b5a665e, fb730e6, 8d3b324 — all present in git log.
- Verification: full suite 111/111, `tsc --noEmit` exit 0, code-level greps confirm no hardcoded status ids / no PM field, live Task-3 probe confirmed all three assumptions (A7, D-01, D-06-corrected) + SC-2 hand-check.

---
*Phase: 02-productive-pull-briefed-discovery*
*Completed: 2026-06-03*
