# Phase 1: Core Math & Clock - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure, deterministic, fully unit-tested functions that form the project's **trust boundary**. Given typed inputs — bookings, time-off/absences, the studio timezone, and an injected set of public-holiday dates — the core computes:

- Per-designer **available hours** for the target day (7.5h minus absences)
- Per-designer **booked hours** for the target day (confirmed vs tentative)
- **Underbooked** flags (designer named, open hours stated)
- A studio **rest-of-week rollup** (open vs total hours across remaining working days)
- The correct **target working day** derived from the studio timezone (Friday → Monday, holiday-aware, DST-safe)

**No network, no I/O, no LLM, no external data fetching.** All source data (bookings, absences, holiday dates) is passed in as typed inputs. Same inputs → same outputs.

**Covers requirements:** SCHED-03, SCHED-04, CAP-01, CAP-02, CAP-03, CAP-04, CAP-05.

**Out of scope for this phase:** fetching from Productive/Calendar (Phase 2/4), brief checks (Phase 2), message rendering/format (Phase 3), scheduling (Phase 3), the actual source of the holiday list (Phase 2 wiring).
</domain>

<decisions>
## Implementation Decisions

### Time-off → available hours
- **D-01:** A designer fully off the target day (available = 0) is shown as **"off" / on leave** and is **NOT** counted as underbooked. They are still **mentioned** in the report (the team should see "X is off"), just not flagged as a gap.
- **D-02:** Partial absences reduce available hours **proportionally**: `available = 7.5 − absence hours that day`, floored at 0. (Productive records absences as event-type bookings with hours-per-day; use those hours directly.)

### Underbooked determination
- **D-03:** **Any gap** below available hours flags a designer as underbooked — no tolerance threshold. (Booked 7.0 of 7.5 = underbooked by 0.5h.)
- **D-04:** The underbooked open-hours figure uses **confirmed bookings only**: `open = available − confirmed booked`. Tentative (draft) hours do **not** close the gap.
- **D-05:** Tentative bookings are tracked and surfaced **distinctly as "shaky"** (CAP-04). A day filled only by tentative bookings is reported as **underbooked AND shaky** — the tentative time might evaporate, so it doesn't count against the gap.

### Overbooked handling
- **D-06:** A designer booked **over** their available hours is **computed and surfaced as a gentle, low-key distinct signal** (e.g. "booked over capacity") — not alarmist, but visible as an early warning of a bad booking or crunch. Booked-hours math stays accurate (no clamping).

### Rest-of-week rollup (CAP-05)
- **D-07:** Window = **target day through that target day's Friday**. Because the run is ~4:30pm, "today" is treated as already done — the window looks forward from the day the message is about. (Tue-evening run covers Wed–Fri.)
- **D-08:** **Friday rollover:** on a Friday-evening run (target = Monday), the window becomes **all of next week (Mon–Fri)**. Consistent rule: always *target-day through that day's Friday*.
- **D-09:** Studio total is **net of time-off**: total = sum of each designer's available hours across the window (absences subtracted), so "open vs total" stays honest during leave.
- **D-10:** A public holiday inside the window **contributes 0 studio hours and is not counted as a working day** (consistent with the clock skipping it).

### Working-day clock (SCHED-03, SCHED-04)
- **D-11:** Target day derives from the **studio timezone**, not the scheduler/runner clock; must be DST-safe.
- **D-12:** Friday → Monday rollover (skip weekends).
- **D-13:** **Holidays are an injected input** to the clock functions — Phase 1 takes a set of public-holiday dates as a parameter (dependency injection) and never fetches them. This keeps Phase 1 dependency-free while satisfying the holiday-eve test (the test just passes in a holiday date). A holiday on the would-be target day pushes the target to the next working day.
- **D-14:** Holiday calendar region is **NSW (Australia)**. Default feed is the `date-holidays` library, cross-checked against Productive company-wide absences — but **this sourcing decision is Phase 2 wiring**, not Phase 1. Phase 1 only consumes the injected date set.

### Hour precision
- **D-15:** Compute internally in **exact minutes** (Productive's native unit); expose **decimal hours**.
- **D-16:** Displayed open/booked hour figures **round to the nearest 0.25h** (quarter-hour). The exact value is retained internally for all arithmetic — only the surfaced figure is rounded.

### Empty / partial input degradation (success criterion 4)
- **D-17:** A designer available but with **zero bookings** is reported as **underbooked with the full available hours open** (e.g. 7.5h open) — an empty day is the core gap this tool exists to catch.
- **D-18:** The core knows the **expected 3-designer roster** and treats a designer **missing entirely from the input** as a **detectable gap** (e.g. "computed for 2 of 3"), so the degraded-message path (REL-01, Phase 3) can name who couldn't be assessed. A failed pull for one designer must not produce a silently-partial report.
- **D-19:** Partial/empty inputs **degrade gracefully — never throw**. (Reinforces the determinism + graceful-degradation success criterion.)

### Claude's Discretion
- Internal data-structure/type shape, function signatures, and module layout — planner/researcher decide.
- Test framework wiring (project standard is Node's built-in `node:test`) and how the Friday-to-Monday, holiday-eve, and DST-boundary cases are structured — planner decides, but all three MUST be covered (per ROADMAP success criterion 3).
- Exact rounding implementation (round-half-up vs round-half-even) at the 0.25h granularity — pick a sensible, documented default.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs
- `.planning/PROJECT.md` — product intent, the three-designer model, 7.5h target, tentative/briefed Productive semantics, trust constraint (all arithmetic in deterministic code).
- `.planning/REQUIREMENTS.md` §"Capacity & Bookings" (CAP-01…CAP-05) and §"Schedule & Runtime" (SCHED-03, SCHED-04) — the requirements this phase implements.
- `.planning/ROADMAP.md` → "Phase 1: Core Math & Clock" — goal and the 4 success criteria (note the explicit Friday-to-Monday, holiday-eve, and DST-boundary test requirement).

### Domain / data-shape reference (read for input modelling, do NOT fetch in Phase 1)
- `CLAUDE.md` §"Item 2 — Productive.io API" — booking attributes (`started_on`, `ended_on`, `hours`, `time` in minutes, `total_time`, `approved`, `approval_status`, `draft`, `booking_type`), and the key fact that **time-off is an absence booking** (`booking_type=event`), not a separate resource. Defines the typed shape Phase 1 functions consume.

### Libraries (Phase 1 use)
- `luxon` (^3) — all timezone / working-day / DST math. Required by the trust constraint (native JS `Date` is rejected per CLAUDE.md "What NOT to Use").
- `date-holidays` — NOTED as the likely default holiday feed for **Phase 2 wiring only**; Phase 1 does not depend on it (holidays are injected).

No external ADRs exist yet — implementation decisions are fully captured in `<decisions>` above.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — this is the first phase; no source code exists. Phase 1 establishes the core domain module that all later phases consume.

### Established Patterns
- Stack is locked by CLAUDE.md: Node 22 + TypeScript, `tsx` to run, `luxon` for dates, `zod` for boundary validation (relevant to Phase 2's input parsing, not Phase 1's pure math), Node built-in `node:test` for unit tests.

### Integration Points
- Phase 1's pure functions are the consumption target for Phase 2 (Productive pull feeds typed bookings/absences in) and Phase 3 (renderer reads the computed results out). Designing clean, well-typed inputs/outputs here is what lets those phases stay thin.
</code_context>

<specifics>
## Specific Ideas

- Liam's framing on holidays: "I like the library, but they do also show in Productive." → Resolved as: library is the cleaner feed for the **clock** (which day to target); Productive company-wide absences naturally handle **capacity** (hours = 0 that day). Not redundant — use the library as default and cross-check Productive in Phase 2. Phase 1 stays agnostic via injection.
- Strict/cautious posture preferred for trust: no underbooked tolerance, tentative never closes a gap. The team should rather see a small flag than miss a real one.
</specifics>

<deferred>
## Deferred Ideas

- **Holiday-source wiring (library vs Productive-derived vs config)** — decided in Phase 2, where data is actually fetched. Phase 1 only consumes an injected holiday-date set.
- **Brief existence/briefed checks** — Phase 2 (BRIEF-01…03).
- **Message format / rounding presentation / deep-links** — Phase 3 (MSG-*). Phase 1 only fixes the *values* (0.25h precision) and the underbooked/shaky/overbooked *signals*, not how they're rendered.
- **Degraded-message wording when a designer's data is missing** — Phase 3 (REL-01) consumes the "detectable gap" signal Phase 1 produces.

None of the discussion strayed outside the phase scope beyond these intentional hand-offs.
</deferred>

---

*Phase: 1-core-math-clock*
*Context gathered: 2026-06-02*
