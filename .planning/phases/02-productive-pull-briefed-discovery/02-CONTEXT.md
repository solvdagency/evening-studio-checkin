# Phase 2: Productive Pull & Briefed Discovery - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn live Productive.io data into trusted, typed `Booking[]` / `Absence[]` objects that feed the Phase 1 core, **and** discover + confirm what "briefed" actually means in SOLVD's Productive so brief flags are correct from night one.

This phase delivers:
- A Productive API client (`fetch`, JSON:API headers `X-Auth-Token` + `X-Organization-Id`) that pulls the three designers' bookings (incl. tentative/`is_draft`) and time-off (absence bookings, `booking_type=event`) for the target window, paginating fully, validated with `zod`, never throwing across the boundary.
- A confirmed, documented "briefed" mapping (discovered against live data during this discussion — see decisions below).
- Per-target-day brief reporting: is a task linked, is it briefed, surfaced by job/task (never by PM) as an existence check only.
- Mapping raw Productive responses into the Phase 1 typed contracts (`Booking`, `Absence` in `src/domain/types.ts`).

**Covers requirements:** BRIEF-01, BRIEF-02, BRIEF-03 (and supplies the live data that the Phase 1 capacity/rollup math consumes).

**Out of scope for this phase:** message rendering / Cards v2 (Phase 3), scheduling (Phase 3), Google Calendar / meeting reconciliation (Phase 4), the LLM renderer + fuzzy judgment (Phase 5), idempotency / run logging (Phase 6), brief *quality* analysis (v2 / BQ-01).

**NOTE — discovery already done live.** The mandatory briefed-discovery spike was run *during this discussion* against live Productive (read-only). The mapping below is confirmed against real SOLVD data, not assumed. Phase 2 execution still hand-checks final numbers against the Productive UI (ROADMAP success criterion 4).
</domain>

<decisions>
## Implementation Decisions

### "Briefed" mapping (discovered + validated against live SOLVD data)
- **D-01:** "Briefed" is **not** a custom field. It is a **workflow status** (a column) named "Briefed" that exists in each workflow. Confirmed present in **SOLVD Standard Workflow** (status `101563`, position 3) and **SOLVD Design Retainers** (status `111230`, position 2), plus 4 other workflows.
- **D-02:** **Briefed = the task is at OR past the "Briefed" column** in its own workflow (i.e. status position ≥ the Briefed status's position in that workflow). Rationale: a task briefed days ago has usually moved forward ("Working on it", "Client review", etc.) and is still briefed. Only the statuses *before* Briefed (e.g. "Not Started", "Quoting") count as un-briefed. A pure `status == "Briefed"` check would wrongly flag active work — that kills trust (this was the load-bearing subtlety).
- **D-03:** Resolve the "Briefed" position **per workflow, dynamically** — do NOT hardcode the 6 status IDs. Look up the Briefed status's position in whatever workflow each task belongs to, then compare. Keeps working if SOLVD reorders columns or adds a workflow. If a task's workflow has no "Briefed" status at all, treat as not-briefed (existence check fails safe).
- **D-04:** A booking is **fully briefed** only if ALL of: (a) a task is linked, (b) the task's status is at/past Briefed (per D-02), AND (c) the task **description is non-empty**. The non-empty guard catches the real "Briefed-but-blank" case found live (task "R1 EDM Design" sat in Briefed with only the unfilled brief template). Missing any of (a)(b)(c) → surface the booking by job/task as needing attention (existence check only, never name a PM).

### Brief-check scope
- **D-05:** Brief checks (task-linked / briefed / non-empty) run on **confirmed bookings only**. Tentative (`is_draft=true`) bookings are surfaced as shaky but **not** brief-flagged — a PM hasn't locked the work yet, so "not briefed" would be premature noise.
- **D-06:** **Internal/non-client bookings** (e.g. "Liam time for AI – Q2 2026", full-day internal blocks) are a known edge — a naive brief check flags them "not briefed" as noise. Decision **deferred to planning**: the researcher must investigate how reliably internal vs client work can be distinguished (candidate signal: `billing_type_id=3` internal/pro-bono, or service/budget billable flag) before deciding whether to exclude them from brief flags. They still count toward hours regardless.

### Tentative / "shaky" mapping
- **D-07:** A booking is **tentative/shaky ⟺ `is_draft = true`**. Productive's own model: confirmed (`is_draft=false`) counts firmly toward capacity; tentative (`is_draft=true`) is a soft booking included in availability but communicated as tentative. Maps directly onto Phase 1's `Booking.isTentative` (Phase 1 D-04/D-05: counted but never closes the gap). `approval_status` is a secondary axis (mostly absence approval) — do **not** use it as the tentative signal for work bookings.

### Which bookings to pull, and the per-day minutes mapping
- **D-08:** **Pull window = target day through that target day's Friday** (matches Phase 1 rollup window D-07/D-08, incl. Friday→next-week rollover). Filter `after >= window_start`, `before <= window_end`, `is_canceled = false`, `person any_of [686717, 686712, 686716]`. **Brief checks apply only to *target-day* bookings**; the wider window feeds the studio rest-of-week rollup.
- **D-09:** **Normalize every booking to "minutes on the target day"** before handing to Phase 1 (`Booking.minutes`). Productive has three `booking_method`s, all seen/expected in live data:
  - `1` "Per day": minutes for the day = `time` (minutes/day) when the target day falls in `[started_on, ended_on]`.
  - `3` "Total hours": `time` is null; minutes/day = `total_time` / (number of working days in the booking's date range). (Real example: Ella 480 min over Jun 3–4 = 240/day.)
  - `2` "Percentage": minutes/day = `percentage`/100 × daily capacity (`TARGET_MINUTES` = 450). Confirm exact capacity basis during execution if a real percentage booking appears.
- **D-10:** **Bookings with no linked task** are real (found two of Liam's "Design and Layout" bookings with no task). They **count toward hours** AND trigger the missing-task flag (BRIEF-01). Both behaviours are intended.

### Time-off / absence pull
- **D-11:** Time-off = absence bookings (`booking_type=event`), pulled in the same windowed query and split out from work bookings (`booking_type=service`). Map to Phase 1 `Absence` with the same per-day minutes normalization (D-09) since absences also use `booking_method`. Partial-day absences reduce availability proportionally (Phase 1 D-02 already handles this).
- **D-12:** **All non-canceled absences reduce availability** — approved *and* pending. Cautious posture: a requested-but-unapproved day off should not look like open capacity.

### Holiday source wiring (carried forward from Phase 1, decided here)
- **D-13:** The clock's injected `HolidaySet` is sourced from the **`date-holidays` library (region NSW, Australia)** for public holidays, **plus a small committed config list** for studio-specific closures (e.g. Christmas shutdown) that aren't public holidays. Deterministic, low-maintenance. (Per-designer time off is separate — handled as absence bookings per D-11, not via the holiday set.)

### Org / identity (confirmed live)
- **D-14:** Monitored designers → Productive person IDs: **Liam Mills `686717`**, **Anisha Gittins `686712`**, **Ella Wright `686716`**. Org = **SOLVD Agency** (slug `34092-solvd-agency`; `X-Organization-Id` candidate `34092` — confirm exact value during execution). The two fluid creatives (Dan, Lexie) are not tracked; "Lexie Review" is a workflow column confirming Lexie is on the review side.
- **D-15:** `X-Auth-Token` + `X-Organization-Id` live in **GitHub Actions encrypted secrets** (and a gitignored `.env` for local dev) — never committed, never pasted into code or chat. Non-secret config (the three person IDs, NSW region, studio closures list) lives in a committed config file.

### Claude's Discretion
- HTTP client wrapper shape, pagination loop, `zod` schema layout, module structure, and the exact Productive→Phase-1 mapping functions — researcher/planner decide.
- Whether designer person IDs live in the existing `types.ts` constants area or a new thin `src/config.ts` (Phase 1 noted config.ts can be added "if Phase 2 grows real runtime config" — it now has: designer IDs, secrets, closures list).
- The internal/client booking-distinction signal (see D-06) — researcher to investigate and recommend.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs
- `.planning/PROJECT.md` — product intent, three-designer model, 7.5h target, tentative/briefed Productive semantics, the trust constraint (all arithmetic in deterministic code).
- `.planning/REQUIREMENTS.md` §"Briefs" (BRIEF-01/02/03) and §"Capacity & Bookings" — the requirements this phase implements + the data it must supply.
- `.planning/ROADMAP.md` → "Phase 2: Productive Pull & Briefed Discovery" — goal and the 4 success criteria (note SC-2: briefed mapping confirmed against the live UI; SC-4: gather+analyze hand-check agrees with the Productive UI).

### Phase 1 contract (the shape Phase 2 maps INTO)
- `src/domain/types.ts` — `Booking` (`designerId`, `minutes`, `isTentative`), `Absence` (`designerId`, `minutes`), `DesignerId`, `HolidaySet` (`ReadonlySet<"yyyy-MM-dd">`), `STUDIO_ZONE`, `TARGET_MINUTES=450`. Phase 2 produces these; it must NOT import Productive response types into the domain.
- `src/domain/report.ts` / `src/domain/capacity.ts` — `computeStudioReport` / `DesignerResult` / `DayStatus`: the consumer of Phase 2's output. Read to understand exactly what inputs to assemble.
- `.planning/phases/01-core-math-clock/01-CONTEXT.md` — Phase 1 decisions, esp. D-01/D-02 (absence → available), D-04/D-05 (tentative never closes gap), D-13/D-14 (holidays injected; NSW region), and the holiday-source hand-off explicitly deferred to this phase.

### Productive.io API reference
- `CLAUDE.md` §"Item 2 — Productive.io API" — base URL `https://api.productive.io/api/v2/`, JSON:API headers, `/bookings` filters (`person_id`, `after`, `before`, `booking_type`, `draft`/`approval_status`), pagination (`page[number]`/`page[size]` — verify default/max page size against `developer.productive.io/guides/pagination`, flagged MEDIUM-confidence in research).

### Live-discovery findings (this session) — confirmed facts, treat as authoritative
- "Briefed" workflow statuses: SOLVD Standard `101563` (pos 3), SOLVD Design Retainers `111230` (pos 2). Full column orders captured in DISCUSSION-LOG.md.
- Booking model: `is_draft` (confirmed/tentative), `booking_type` (`service`/`event`), `booking_method` (1 per-day / 2 percentage / 3 total-hours), `time`/`total_time`/`percentage`, `is_canceled`, `task` relationship, `approval_status`.
- Brief content lives in the task **`description`** (markdown). The studio uses a standard brief template; an unfilled template is the false-positive risk (caught by the non-empty guard at the blank level only — full template-vs-filled detection is deferred to the LLM phase).

No external ADRs exist yet — decisions fully captured in `<decisions>` above.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/types.ts` — the target types (`Booking`, `Absence`, `DesignerId`, `HolidaySet`). Phase 2's mappers output exactly these.
- `src/domain/round.ts`, `src/domain/clock.ts`, `src/domain/capacity.ts`, `src/domain/report.ts` — the pure core Phase 2 feeds. No changes needed there; Phase 2 is the ingestion + brief-discovery layer in front of them.

### Established Patterns
- Stack locked by CLAUDE.md: Node 22 + TypeScript, `tsx` to run, native `fetch` for Productive (no axios), `zod` for boundary validation, `luxon` for date math, `node:test` for unit tests.
- Phase 1 kept the domain framework-agnostic on purpose ("Phase 2 owns translating `draft`/`approval_status` into this boolean"). Phase 2 must preserve that: all Productive-specific shapes stay in the ingestion layer; only clean typed objects cross into `src/domain`.

### Integration Points
- New Productive client + mappers sit upstream of `computeStudioReport`. The brief-discovery output (per-target-day: task-linked? briefed? content?) is a NEW data shape this phase introduces — Phase 3 renders it, so design it as a clean typed result alongside the existing report.
- Add `date-holidays` (NSW) → produce the `HolidaySet` the clock already accepts (D-13). This is the holiday-wiring Phase 1 deferred.
</code_context>

<specifics>
## Specific Ideas

- Liam's instinct that status alone is untrustworthy was validated live: the "R1 EDM Design" task was marked Briefed with only the blank brief template — exactly the false-trust case. Hence the non-empty guard (D-04).
- Cautious/strict posture continues from Phase 1: count pending absences (D-12), don't brief-flag tentative work (D-05), fail brief checks safe when a workflow has no Briefed status (D-03).
- The brief lives in the task description as markdown following a standard SOLVD template (BACKGROUND / WHAT DO WE NEED TO ACHIEVE / DELIVERABLES / COPY / BRAND TONE / etc.).
</specifics>

<deferred>
## Deferred Ideas

- **Unfilled-template detection** (telling a filled brief from the blank template skeleton) — fuzzy judgment; revisit with the LLM renderer in **Phase 5**. v1 only guards against a genuinely empty description (D-04).
- **Brief *quality* analysis** (does the brief contain the assets/context a designer needs) — **v2 / BQ-01**, explicitly out of scope.
- **Internal-vs-client booking distinction** — investigated and decided **during this phase's planning** (D-06), not deferred to a later phase; noted here so it isn't lost.

None of the discussion strayed outside the phase scope beyond these intentional hand-offs.
</deferred>

---

*Phase: 2-productive-pull-briefed-discovery*
*Context gathered: 2026-06-03*
