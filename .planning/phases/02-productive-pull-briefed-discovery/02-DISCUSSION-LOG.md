# Phase 2: Productive Pull & Briefed Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 2-productive-pull-briefed-discovery
**Areas discussed:** What "briefed" means, Discovery method, Designers & access, Holiday source wiring, What makes a booking shaky, Which bookings we pull, Brief-checking tentative jobs, Time-off / absence pull

---

## Area selection (round 1)

User selected all four offered areas: What "briefed" means, Discovery method, Designers & access, Holiday source wiring.

---

## What "briefed" means

| Option | Description | Selected |
|--------|-------------|----------|
| A task status/stage | Task moves into a specific workflow status | |
| A custom field | A field on the task PMs set when briefed | |
| A tag or label | PMs add a "briefed" tag | |
| I'm not 100% sure | Wants to look at live data together | ✓ |

**User's choice:** "I'm not 100% sure" — which is precisely why the roadmap mandated a live-data discovery spike.
**Notes:** Live read confirmed there is no "Briefed" custom field; "Briefed" exists as a workflow status (column) in 6 workflows. Design team uses SOLVD Standard Workflow + SOLVD Design Retainers. → CONTEXT D-01.

### Follow-up: how to define briefed in code

| Option | Description | Selected |
|--------|-------------|----------|
| Briefed or beyond | At/past the Briefed column counts (robust to forward progress) | ✓ |
| Exactly "Briefed" | Only tasks currently in the Briefed column | |
| Let me think about it | See a real example first | |

**User's choice:** Briefed or beyond. → CONTEXT D-02 / D-03.

### Follow-up: task content check (raised by user — "check the task has content")

| Option | Description | Selected |
|--------|-------------|----------|
| Status + empty guard | Briefed + linked task + non-empty description | ✓ |
| Status only (v1) | Status + linked task only | |
| Detect unfilled template | Fingerprint the blank template (brittle, quality-adjacent) | |

**User's choice:** Status + empty guard. → CONTEXT D-04. Unfilled-template detection deferred to LLM phase.
**Notes:** Live data showed a real "Briefed-but-blank-template" task ("R1 EDM Design"), validating the concern.

---

## Discovery method

| Option | Description | Selected |
|--------|-------------|----------|
| Live peek now | Read-only queries against live Productive in-session, lock mapping into CONTEXT | ✓ |
| Describe + verify later | Capture understanding now, spike during execution | |
| Live peek, you drive the UI | Liam reads back from the Productive UI | |

**User's choice:** Live peek now. Discovery executed during this discussion (read-only). Org confirmed SOLVD Agency.

---

## Designers & access

**Designers (free text):** Liam Mills, Anisha Gittins, Ella Wright (monitored 3). Dan + Lexie are the fluid two, not tracked.
**Resolved live to person IDs:** Liam 686717, Anisha 686712, Ella 686716. → CONTEXT D-14.
**Access:** User asked whether to share API keys; advised NOT to paste keys into chat — they belong in GitHub Actions secrets / gitignored `.env`. The in-session Productive connection (claude.ai integration) was already authenticated for the read-only discovery. → CONTEXT D-15.

---

## Holiday source wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Library + config list | date-holidays (NSW) + committed closures list | ✓ |
| Library only (NSW) | date-holidays only | |
| Productive company-wide | Pull closures from Productive | |

**User's choice:** Library + config list. → CONTEXT D-13.

---

## Area selection (round 2 — explore more)

User chose to explore more, then selected all four follow-up areas: Time-off / absence pull, Brief-checking tentative jobs, Which bookings we pull, What makes a booking shaky.

---

## What makes a booking shaky

**Grounded live:** Productive booking model has `is_draft` (confirmed=false / tentative=true) — the definitive shaky signal, mapping straight to Phase 1 `isTentative`. `approval_status` is a separate axis (mostly absence approval), not the work-booking tentative signal. → CONTEXT D-07.
**Notes:** All 7 current designer bookings were `is_draft=false`. Also surfaced booking_method variance (per-day vs total-hours) → CONTEXT D-09.

---

## Which bookings we pull

**Resolved from requirements + Phase 1 contract (not a multi-option question):** window = target day → that day's Friday (rollup window); brief checks only on target-day bookings; bookings with no task count toward hours AND trigger the missing-task flag. → CONTEXT D-08, D-10.

---

## Brief-checking tentative jobs

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmed only | Only brief-check confirmed bookings; tentative surfaced shaky, not brief-flagged | ✓ |
| Check tentative too | Brief-check tentative bookings as well | |

**User's choice:** Confirmed only. → CONTEXT D-05.

### Bundled: internal/non-client bookings

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude from brief flags | Skip brief checks on internal/non-billable work | |
| Treat like any booking | Brief-check everything | |
| Decide during planning | Flag as known edge for researcher | ✓ |

**User's choice:** Decide during planning. → CONTEXT D-06.
**Notes:** Live data showed "Liam time for AI" full-day internal bookings that would flag as not-briefed (noise).

---

## Time-off / absence pull

| Option | Description | Selected |
|--------|-------------|----------|
| Count all non-canceled | Approved + pending absences reduce availability | ✓ |
| Approved only | Only approved absences reduce hours | |

**User's choice:** Count all non-canceled. → CONTEXT D-11, D-12.

---

## Claude's Discretion

- HTTP client wrapper, pagination loop, zod schema layout, module structure, Productive→Phase-1 mapping functions.
- Whether designer IDs live in `types.ts` constants or a new `src/config.ts`.
- The exact internal-vs-client booking signal (researcher to investigate per D-06).

## Deferred Ideas

- Unfilled-template detection → Phase 5 (LLM).
- Brief quality analysis → v2 / BQ-01.
- Internal-vs-client distinction → resolved during this phase's planning (not a later phase).
