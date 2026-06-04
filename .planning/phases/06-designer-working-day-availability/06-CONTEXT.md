# Phase 6: Designer Working-Day Availability - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Read each designer's real per-weekday working hours from Productive (`person.availabilities` →
`working_hours`) and feed them into the target-day capacity computation **and** the rest-of-week
rollup, so a designer on a non-standard week is never wrongly flagged as having open time on a day
they aren't rostered. Satisfies CAP-06 and corrects the flat-7.5h assumption baked into CAP-01.

**In scope:** fetching/parsing per-designer availability from Productive; using per-weekday
`working_hours` as the available-minutes basis for the target day; correcting the CAP-05
rest-of-week rollup to use real working days; a safe degraded path when availability can't be read.

**Out of scope:** committed-config working patterns (rejected — source of truth is Productive);
Productive's `holiday_calendar_id` reconciliation (the app keeps its own NSW holiday set);
true alternating-week parity (deferred — see D-08).

</domain>

<decisions>
## Implementation Decisions

### Source of working-day availability
- **D-01:** Per-designer working days come from the Productive **person** resource's `availabilities`
  field (`[started_on, ended_on, working_hours, holiday_calendar_id]`), NOT committed config. Use the
  period whose `[started_on, ended_on]` covers the target date (`ended_on: null` = current/open-ended).
- **D-02:** `working_hours` is hours-per-weekday (Mon=0..Sun=6). The available minutes for the target
  day = that weekday's hours × 60. A `0` means not rostered → 0 available minutes for that day.
- **D-03:** This replaces the flat `TARGET_MINUTES − absence` baseline in `availableMinutes`
  (src/domain/capacity.ts). Absence bookings still subtract from the rostered hours (a designer can be
  on leave on a day they would otherwise work). Keep all arithmetic in exact integer minutes.

### Non-working-day display
- **D-04:** A non-rostered day yields 0 available minutes and **reuses the existing `"off"` status**
  (no new state enum value). It is mentioned, never flagged (consistent with D-01's "off" handling).
- **D-05:** Display wording caveat (Claude's discretion for the planner): the current `stateWord`
  maps `"off"` → "on leave". A *routine* non-working day is not booked leave, so the surfaced copy
  should read sensibly (e.g. "not in {day}") rather than literally "on leave". Resolve the wording in
  the renderer without adding a new status value — the status model stays `"off"`.

### Degradation when availability can't be read
- **D-06:** If Productive availability can't be fetched/parsed for a designer, treat that designer's
  availability as **unknown**: do NOT invent open time, do NOT flag them as underbooked, and post the
  card with a visible degraded note (mirror the existing calendar-unavailable / source-degraded
  pattern). Never fall back to a silent flat-7.5h assumption (that re-introduces the exact bug), and
  never hard-skip the post (REL: never silently skip a night).

### Rest-of-week rollup (CAP-05)
- **D-07:** Fix the rollup in this phase. Each designer's contribution to the studio "open vs total
  this week" figure uses their real per-weekday working days (e.g. Anisha contributes 0 on Wed/Fri).
  Same data source as the target-day fix; leaving it would still overstate studio capacity.

### Alternating two-week schedules (14-element working_hours)
- **D-08:** Support 7-element and 14-element `working_hours` where both weeks are identical (today's
  reality for all three designers). If a 14-element pattern has two **differing** weeks, log a warning
  and use week 1 for now. Defer true week-parity resolution (determining which week applies to a date
  via Productive's anchor) until a real differing-week case exists — avoids unvalidated parity logic.

### Claude's Discretion
- Exact non-working-day wording (D-05), the shape of the availability fetch (extra people query vs
  extending an existing call), and the zod schema for the availabilities payload — planner/researcher
  to decide consistent with existing src/productive patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Capacity logic (to correct)
- `src/domain/capacity.ts` — `availableMinutes()` (the flat `TARGET_MINUTES − absence` to replace),
  `computeDesignerDay()`, `classifyDay()`, the `"off"` status and `DesignerResult` shape.
- `src/domain/report.ts` — where `computeDesignerDay` and the rest-of-week window/rollup are assembled
  (CAP-05); per-designer results and `missingDesigners`.
- `src/domain/types.ts` — `TARGET_MINUTES`, `DesignerId`, `Booking`/`Absence`/`HolidaySet` types.

### Productive ingestion (to extend)
- `src/productive/gather.ts`, `client.ts`, `schemas.ts`, `mappers.ts`, `types.ts` — the existing
  bookings pull; this phase adds the person `availabilities` fetch + parse alongside it.
- `src/config.ts` — `DESIGNER_PERSON_IDS` (686717 Liam, 686712 Anisha, 686716 Ella).

### Rendering (non-working-day wording)
- `src/render/renderMessage.ts`, `src/render/cards.ts`, `src/render/rows.ts` — how `"off"` designers
  and the degraded note are rendered today (mirror for D-05/D-06).

### Requirements
- `.planning/REQUIREMENTS.md` — CAP-06 (new), CAP-01..CAP-05 (the capacity contract this corrects).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `availableMinutes(absenceMinutesForDay)` in capacity.ts is the single choke point for available
  minutes — change it to take the designer's rostered minutes for the day, keeping `computeDesignerDay`
  and `classifyDay` intact.
- The `"off"` status (available === 0 → mentioned, not flagged) already does exactly what a
  non-rostered day needs — reuse it (D-04).
- The calendar-unavailable / source-degraded note pattern (RenderContext + renderer) is the model for
  the availability-unknown degraded note (D-06).

### Established Patterns
- Cardinal trust rule: all hour/capacity arithmetic is deterministic and unit-tested; the LLM never
  touches numbers. The availability math must be exact integer minutes and fully tested.
- Productive responses are validated with zod at the boundary (schemas.ts) and mapped to date-free
  domain types (mappers.ts). The availabilities parse follows the same boundary-validation discipline.

### Integration Points
- New availability data flows: Productive `availabilities` → parsed per-designer per-weekday minutes →
  `availableMinutes` basis in `computeDesignerDay` (target day) and the rest-of-week rollup in report.ts.

</code_context>

<specifics>
## Specific Ideas

- Live data confirmed 2026-06-04 (current open-ended period since 2026-03-09):
  - Anisha (686712): `working_hours` Mon/Tue/Thu 7.5h, **off Wed & Fri** (14-element, both weeks equal).
  - Liam (686717): Mon–Fri 7.5h. Ella (686716): Mon–Fri 7.5h.
- Pull via the Productive person resource's `availabilities` field (per
  [[productive-person-availabilities]] memory).

</specifics>

<deferred>
## Deferred Ideas

- True alternating-week parity (which of two differing weeks applies to a date via Productive's anchor)
  — deferred until a real differing-week schedule exists (D-08).
- Reconciling Productive's `holiday_calendar_id` with the app's own NSW holiday set — out of scope;
  the app keeps its committed holiday logic.

</deferred>

---

*Phase: 06-designer-working-day-availability*
*Context gathered: 2026-06-04*
