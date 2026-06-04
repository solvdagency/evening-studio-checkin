# Phase 6: Designer Working-Day Availability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 06-designer-working-day-availability
**Areas discussed:** Availability fetch fails, Not-rostered vs on leave, Rest-of-week rollup, Alternating weeks

**Carried forward (decided before this discussion, not re-asked):**
- Source = Productive `person.availabilities` working_hours (rejected: committed config)
- Non-working day = mention, no flag
- Real schedules confirmed live: Anisha Mon/Tue/Thu; Liam & Ella Mon–Fri

---

## Availability fetch fails

| Option | Description | Selected |
|--------|-------------|----------|
| Degrade, don't invent | Availability unknown → don't flag, visible degraded note, never invent open time | ✓ |
| Fall back to 7.5h Mon–Fri | Assume standard week + note | |
| Skip the whole post | Hard-fail the run | |

**User's choice:** Degrade, don't invent.
**Notes:** Mirrors the existing calendar-unavailable/source-degraded pattern; preserves the cardinal trust rule and "never silently skip a night."

---

## Not-rostered vs on leave

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct state + wording | New "not rostered" state, "not in Friday" vs "on leave" | |
| Reuse existing "off" state | Both flow through the existing `"off"` status | ✓ |

**User's choice:** Reuse existing "off" state.
**Notes:** No new status enum value. Wording caveat captured as D-05 — the renderer should still read sensibly for a routine non-working day (not literally "on leave"), but the status model stays `"off"`.

---

## Rest-of-week rollup (CAP-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Fix it now | Rollup uses real per-designer working days | ✓ |
| Defer to later | Only fix target-day; leave weekly rollup assuming full weeks | |

**User's choice:** Fix it now.
**Notes:** Same data source as the target-day fix; leaving it would still overstate studio capacity.

---

## Alternating weeks (14-element working_hours)

| Option | Description | Selected |
|--------|-------------|----------|
| Equal-weeks now, defer true alternation | Support 7/14-element where both weeks match; log + use week 1 if they differ | ✓ |
| Full week-parity now | Resolve which week applies via Productive's anchor | |

**User's choice:** Equal-weeks now, defer true alternation.
**Notes:** Avoids unvalidated parity logic with no live differing-week case; logs if reality changes.

## Claude's Discretion

- Exact non-working-day wording (D-05); shape of the availability fetch (extra query vs extending existing call); the zod schema for the availabilities payload.

## Deferred Ideas

- True alternating-week parity resolution (until a real differing-week case exists).
- Reconciling Productive's `holiday_calendar_id` with the app's NSW holiday set.
