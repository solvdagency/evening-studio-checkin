---
phase: 06-designer-working-day-availability
plan: 03
subsystem: composition-root + render
tags: [capacity, availability, render, wiring, tdd, trust-critical]
status: COMPLETE
requires:
  - "src/index.ts runNightly (composition root)"
  - "src/render/rows.ts statusLine/buildRow (off-day wording)"
  - "src/domain/report.ts StudioReportInput.rosteredMinutes (Plan 01 contract)"
  - "src/productive/gather.ts GatherResult.rosteredMinutes (Plan 02 contract)"
provides:
  - "runNightly threads g.rosteredMinutes into StudioReportInput (live working-day pattern drives the card)"
  - "routine-not-rostered 'not in <Weekday>' off-day wording via RenderContext.leaveNotes (D-05), no new DayStatus"
  - "availability-unreadable designer renders the EXISTING 🤖 'couldn't read' row (D-06, no new variant)"
affects:
  - "Phase 7 (hardening) consumes the end-to-end-wired nightly card"
tech-stack:
  added: []
  patterns:
    - "presentation-only routine-not-rostered note derived in buildRenderContext; renderer stays a pure consumer; src/domain untouched"
    - "escapeHtml on the dynamic weekday name before insertion (T-06-07)"
    - "conditional leaveNotes assignment (only when non-empty) keeps existing snapshot fixtures byte-identical"
key-files:
  created: []
  modified:
    - "src/index.ts"
    - "src/render/rows.ts"
    - "src/__tests__/runNightly.test.ts"
decisions:
  - "D-02/D-03: g.rosteredMinutes wired into StudioReportInput so the live per-designer working-day pattern is the available-minutes basis end-to-end"
  - "D-05: a routine non-working day reads 'not in <Weekday>' (escaped), distinguished from booked leave by rosteredMinutes(targetDay)===0; no new DayStatus"
  - "D-06: availability-unreadable designer reuses the existing missingDesignerRow 🤖 'couldn't read' row — no new top-level render variant; renderMessage.ts untouched this plan"
metrics:
  duration_min: 6
  tasks: "3 of 3 (Task 3 human-verify checkpoint APPROVED 2026-06-04)"
  files: 3
  completed: "COMPLETE — Tasks 1, 2 & 3 done; smoke check surfaced + fixed a live-shape bug (commit a042430)"
requirements: [CAP-06]
---

# Phase 6 Plan 03: End-to-End CAP-06 Wiring Summary (COMPLETE — smoke check approved)

> **Checkpoint outcome (2026-06-04):** The Task 3 live smoke check did its job — it caught a
> production bug the 305 unit tests missed: live `person.availabilities` is a JSON-encoded
> STRING of positional tuples, not the array-of-objects plan 06-02 assumed, so every designer
> failed validation and the first posted card fully degraded. Fixed at the zod boundary in
> commit `a042430` (see "Smoke Check Outcome" below). Re-run verified: the live card shows
> `⚪ Anisha Gittins — not in Friday` (mentioned, no flag), Liam/Ella against real rostered
> hours, and the week rollup excludes Anisha's non-working days. Liam approved. A secondary
> degrade-quality issue (D-06 vs D-18 tension) was reviewed and **deferred** to a follow-up.

Closed the automated half of the CAP-06 loop: `runNightly` now threads gather's live
`rosteredMinutes` lookup into `computeStudioReport`, so each designer's real working-day
pattern (e.g. Anisha off Wed & Fri) drives the posted card instead of a flat 7.5h
assumption; a routine non-working day reads "not in &lt;Weekday&gt;" rather than "on leave",
and an availability-unreadable designer degrades through the existing 🤖 "couldn't read" row.
**This plan is intentionally paused before Task 3** — a blocking `checkpoint:human-verify`
that posts a live card to Google Chat and is run by the human operator, not the executor.

## Status

- **Task 1 — DONE** (committed `73fd05d`, RED `401e44a`).
- **Task 2 — DONE** (verification gate; full suite + tsc green; the gate's new test cases were committed with the RED commit `401e44a`).
- **Task 3 — DONE / APPROVED** (blocking `checkpoint:human-verify`; live smoke check run 2026-06-04 against live Productive, posted to the TEST Chat space). The check FAILED on the first run (real-shape bug, see below), the bug was fixed, and the re-run was approved by Liam.

The plan is **COMPLETE**.

## What Was Built

**Task 1 (TDD RED → GREEN): rosteredMinutes wiring + routine-not-rostered wording (D-05)**
- `src/index.ts`: added `rosteredMinutes: g.rosteredMinutes` to the `StudioReportInput`
  object — the single load-bearing line that makes the live per-designer working-day
  pattern (parsed in Plan 02) the available-minutes basis end-to-end (CAP-06 / D-02 / D-03).
- `src/index.ts` `buildRenderContext`: derives a per-designer routine-not-rostered note.
  For each `report.designers` entry whose `status === "off"` AND whose target-day
  `rosteredMinutes(designerId, targetDay) === 0` (a routine non-working day, not booked
  full-day leave), it sets `leaveNotes[designerId] = "not in {Weekday}"`, where Weekday is
  the target day formatted `cccc` in `STUDIO_ZONE` (the same luxon pattern `subtitleFor`
  uses). `leaveNotes` is assigned onto the context only when non-empty, so existing
  snapshot fixtures stay byte-identical. `buildRenderContext` gained a `rosteredMinutes`
  parameter (threaded from `g.rosteredMinutes` at the call site) so the renderer stays a
  pure consumer of the note and `src/domain` is untouched (PATTERNS.md line 233).
- `src/render/rows.ts`: `statusLine` gained an optional `offNote` argument; the `"off"`
  branch emits `⚪ {name} — {muted(escapeHtml(offNote))}` when a routine note exists,
  else the existing `muted("on leave / Full day off.")`. `buildRow`'s `"off"`
  short-circuit now reads `ctx.leaveNotes?.[designerId]` and passes it into `statusLine`,
  so the routine wording lands on a status-"off" designer (the prior `leaveNote` read fired
  only on the non-off path and never reached an off designer). The dynamic weekday name is
  HTML-escaped before insertion (T-06-07). The off row stays a minimal one-line row (D-22).
  No new `DayStatus` value introduced — `DayStatus` in capacity.ts is unchanged.

**Task 2 (verification gate): full-suite regression + degraded-path confirmation**
- Full suite green with the new wiring: every existing capacity / report / gather / render
  / runNightly test stayed green (the Plan-01/02 stubs already supply `rosteredMinutes`).
- Confirmed (read-only) the D-06 availability-unknown case routes through the EXISTING
  per-designer miss path: an availability-unreadable designer arrives in
  `report.missingDesigners` (Plan 02 omits them from `assessedDesigners`) and renders via
  the existing `missingDesignerRow` 🤖 line. `src/render/renderMessage.ts` is unchanged in
  this plan (empty diff) — no new top-level degraded variant was added for the availability
  case.
- Added runNightly cases (committed with the RED commit) pinning: (g) a single
  availability-unreadable designer still renders the 🤖 "couldn't read" row in the normal
  figures-bearing card, and (h) an all-designers-unreadable miss still posts a card with
  three 🤖 rows and returns 0 (REL-01 — never silently skip a night).

## TDD Gate Compliance

- RED: `401e44a` — `test(06-03)` failing test (f) for the routine-not-rostered wording
  (confirmed failing before implementation: the card showed "on leave / Full day off."
  with no "not in Thursday"). Cases (g)/(h) were green at RED because the 🤖 miss path
  already existed from prior phases — they pin no-regression rather than driving new code.
- GREEN: `73fd05d` — `feat(06-03)` wiring + wording implementation; runNightly 9/9, full
  suite 303/303.
- No REFACTOR commit needed.

## Deviations from Plan

None — plan executed as written for the automated tasks. No Rule 1–4 deviations; no
authentication gates. Task 3 deliberately NOT executed per the orchestrator's instruction
(it is a blocking human-verify checkpoint run by the operator).

## Verification

- `node --import tsx --test "src/__tests__/runNightly.test.ts"` — 9/9 pass.
- `npm test` (whole project) — 303/303 pass, 0 fail (no Phase 1–5 regression, SC-5).
- `npx tsc --noEmit` — exit 0 (clean).
- `grep -n "rosteredMinutes: g.rosteredMinutes" src/index.ts` — present (line 247).
- `grep -n "not in" src/index.ts` — routine-not-rostered note derivation present (line 138).
- `grep -n "DayStatus =" src/domain/capacity.ts` — `"off" | "underbooked" | "overbooked" | "ok"` unchanged (no new value).
- `src/render/renderMessage.ts` diff for this plan — empty (no new variant function added).

## Success Criteria

- [x] (SC-1, end-to-end) Target-day available hours come from the real working-day pattern — `g.rosteredMinutes` wired into the report.
- [x] (SC-2) A not-rostered designer is mentioned with no open-time flag — a quiet "not in &lt;day&gt;" line; status stays "off".
- [x] (SC-3) Rest-of-week rollup reflects real per-designer working days (Plan 01 rollup fix now fed live data).
- [x] (SC-4) Availability read failure degrades safely and still posts — **correction:** an availability failure trips the whole-card D-18 degrade (still posts, invents no open time), NOT the per-designer 🤖 row in a figures-bearing card that this plan originally claimed. The per-designer-row intent (D-06) is defeated by D-18 because gather pushes availability errors into the same `sourceErrors` that selectVariant reads. Trust-safe but lower-quality; **deferred to a follow-up** (see below).
- [x] (SC-5) No regression to Phases 1–5; all arithmetic deterministic + unit-tested.
- [x] **Human smoke check (Task 3) — APPROVED 2026-06-04.** Live card shows Anisha mentioned-not-flagged ("not in Friday"); numbers match the real working-day pattern. The check first failed (live-shape bug), which was fixed, then re-verified and approved.

## Smoke Check Outcome — Task 3 (APPROVED, after a fix)

**Type:** checkpoint:human-verify (gate="blocking"). Run 2026-06-04 against live Productive,
posted to the TEST Chat space (`.env` `GCHAT_WEBHOOK_URL`).

**First run — FAILED (real bug caught):** Every designer rendered as availability-unreadable
and the card fully degraded ("Couldn't reach … No booking figures this run"). Root cause: the
live `/people` `attributes.availabilities` field is a **JSON-encoded string** whose periods are
**positional tuples** `[started_on, ended_on, working_hours, holiday_calendar_id]` — NOT the
array of `{started_on, …}` objects plan 06-02 assumed. So `PersonResource.safeParse` rejected
all three designers. Classic fixtures-vs-live gap: the 305 unit tests passed because their
fixtures were authored to the assumed shape; nobody had checked a live payload.

**Fix (commit `a042430`, plan 06-02 boundary):**
- `AvailabilityPeriod` → a `z.tuple([...]).rest(...).transform(...)` that validates the tuple
  and emits the named-field object the mapper already consumes (mapper logic unchanged).
- `PersonResource.availabilities` → `z.preprocess(JSON.parse-if-string, z.array(...))`; malformed
  JSON fails the safeParse so the designer degrades to "couldn't read" (D-06), never fabricated.
- Fixed the `gather.test` `personResource` fixture to the real JSON-string-of-tuples shape.
- Added regression tests pinning a verbatim copy of the live wire string.

**Re-run — APPROVED:** Rendered live card (verified via a `postToChat` capture stub + a real
TEST-space post): `⚪ Anisha Gittins — not in Friday` (mentioned, no flag, not "on leave");
`🔴 Liam 5.5h open / 2.0h booked`; `🔴 Ella 3.5h open / 4.0h booked`; week rollup `6h booked ·
9h open` with Anisha's non-working days excluded. Liam approved.

## Deferred Follow-up — D-06 vs D-18 degrade-path tension

`gather` pushes availability errors (whole-pull fail, per-entry parse fail, all-zero week) into
`sourceErrors`; `selectVariant` (variants.ts:28, decision **D-18**) treats any non-empty
`sourceErrors` as a whole-card "degraded" variant. This **defeats the D-06 per-designer
intent** (an availability-unreadable designer should appear as a 🤖 "couldn't read" row inside
the normal figures-bearing card). The degrade is trust-safe (still posts, invents nothing) but
low-quality (internal-sounding text auto-joined with " and "). Reviewed with Liam 2026-06-04 and
**deferred** — fixing it reopens a locked decision (D-18) and needs its own scoped task.
Candidate fix: stop routing availability omissions through the figures-degrading `sourceErrors`;
let the missingDesigners-driven 🤖 row carry them, reserving D-18 degrade for true figures
(bookings) failures; and clean up the degraded-copy grammar.

## Self-Check: PASSED

- FOUND: src/index.ts (modified — rosteredMinutes wiring + routine-not-rostered note)
- FOUND: src/render/rows.ts (modified — off-branch routine wording)
- FOUND: src/__tests__/runNightly.test.ts (modified — cases f/g/h)
- FOUND commit: 401e44a (RED + Task 2 gate test cases)
- FOUND commit: 73fd05d (GREEN Task 1 implementation)
