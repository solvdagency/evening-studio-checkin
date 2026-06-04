---
phase: 06-designer-working-day-availability
plan: 03
subsystem: composition-root + render
tags: [capacity, availability, render, wiring, tdd, trust-critical]
status: PAUSED-AT-HUMAN-CHECKPOINT
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
  tasks: "2 of 3 (Task 3 is a pending human-verify checkpoint)"
  files: 3
  completed: "PARTIAL — Tasks 1 & 2 done; Task 3 PENDING-HUMAN-CHECKPOINT"
requirements: [CAP-06]
---

# Phase 6 Plan 03: End-to-End CAP-06 Wiring Summary (PAUSED at human-verify checkpoint)

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
- **Task 3 — PENDING-HUMAN-CHECKPOINT** (blocking `checkpoint:human-verify`; NOT run — no Google Chat post, no live Productive call, no external API call made by the executor).

The plan is **NOT complete**. ROADMAP plan-progress for 06-03 remains in-progress pending the human smoke check.

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
- [x] (SC-4) Availability read failure degrades safely and still posts (🤖 row, normal card).
- [x] (SC-5) No regression to Phases 1–5; all arithmetic deterministic + unit-tested.
- [ ] **Human smoke check (Task 3) — PENDING.** Anisha's non-working day mentioned-not-flagged on the live posted card; numbers match Productive; degraded path posts. Awaiting operator approval.

## PENDING HUMAN CHECKPOINT — Task 3 (blocking)

**Type:** checkpoint:human-verify (gate="blocking")
**Run by:** the human operator (Liam), NOT the executor. No Google Chat post or live
Productive call was made by the executor.

**What was built (for the operator):** The CAP-06 working-day availability change is wired
end-to-end — live Productive `person.availabilities` drive per-designer available hours and
the rest-of-week rollup, a routine non-working day reads "not in &lt;day&gt;" instead of "on
leave", and an availability-unreadable designer degrades to the 🤖 "couldn't read" row. All
arithmetic stays deterministic and unit-tested; the full suite is green.

**How to verify (exact steps from the plan's `<how-to-verify>`):**

Run a real check-in against live Productive on a day whose target lands on Anisha's
non-working day (Wed or Fri), posting to the TEST Chat space:

1. Confirm the TEST webhook is in use (per memory: `.env` `GCHAT_WEBHOOK_URL` is the TEST
   space — do NOT post to the main team channel).
2. From the repo root run a manual test send:
   `npx tsx --import dotenv/config src/index.ts`
   (If today's target day is not a Wed/Fri, trigger on a Tuesday-or-Thursday evening so the
   target day is Anisha's off-day; or temporarily set the injected `now` in a local scratch
   run to a Tuesday/Thursday evening — do NOT commit that.)
3. In the posted Test-space card, confirm:
   - Anisha appears MENTIONED with NO open-time flag (⚪, "not in Wednesday"/"not in
     Friday" — NOT "on leave / Full day off.", NOT a red "Xh open" flag).
   - Liam and Ella still show their normal availability against their real rostered hours
     (7.5h-based), not a flat assumption that contradicts Productive.
   - The "Remaining studio time this week" rollup does NOT count Anisha's Wed/Fri as open
     studio capacity.
   - If you force an availability read failure (e.g. temporarily break the `/people`
     query), the card still POSTS with a 🤖 "couldn't read" row for the affected designer —
     it never silently skips the night and never invents open time.
4. Cross-check the numbers against the Productive scheduling UI for the target day — they
   must match exactly (cardinal trust rule).

**Resume signal:** Type "approved" if the card flags Anisha's non-working day correctly
(mentioned, never flagged) and the numbers match Productive; otherwise describe the
discrepancy (designer, expected vs shown wording/hours).

## Self-Check: PASSED

- FOUND: src/index.ts (modified — rosteredMinutes wiring + routine-not-rostered note)
- FOUND: src/render/rows.ts (modified — off-branch routine wording)
- FOUND: src/__tests__/runNightly.test.ts (modified — cases f/g/h)
- FOUND commit: 401e44a (RED + Task 2 gate test cases)
- FOUND commit: 73fd05d (GREEN Task 1 implementation)
