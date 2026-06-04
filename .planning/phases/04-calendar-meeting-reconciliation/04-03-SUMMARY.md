---
phase: 04-calendar-meeting-reconciliation
plan: 03
subsystem: calendar-rules-reconciler
tags: [calendar, filter, reconcile, tdd, D-04, D-07, D-08, trust-boundary, MEET-02, MEET-03, MEET-05]
requires:
  - "src/calendar/gather.ts::FilteredEvent (plan 04-01, consumed)"
  - "src/config.ts::MEETING_IGNORE_LIST + CLIENT_ALIAS_MAP + WORK_DAY_START/END + ClientAlias (plan 04-01/04-02)"
  - "src/calendar/__fixtures__/labelled-events.json (plan 04-02 golden fixtures, asserted against)"
  - "src/domain/types.ts::STUDIO_ZONE + DesignerId (pure types/constants only)"
provides:
  - "src/calendar/filter.ts::isDeclined/isAllDay/isOutOfOffice/isSolo/isAfterHours/isOverhead/isCountingMeeting (pure predicates)"
  - "src/calendar/reconcile.ts::reconcileMeetings + matchTitleToClient + WorthALookItem (pure same-day reconciler)"
affects:
  - "src/index.ts (later plan — wire gatherCalendar → isCountingMeeting → reconcileMeetings → RenderContext.worthALook)"
  - "src/render/* (plan 04-04 — render the 📅 worth-a-look sub-line from WorthALookItem[])"
tech-stack:
  added: []
  patterns:
    - "Pure mechanical predicates mirroring src/productive/briefed.ts (pre-resolved inputs → boolean, never throws)"
    - "Pure pre-resolved-inputs reconciler mirroring src/productive/brief.ts assessBriefs (per-designer grouping output)"
    - "Trust boundary: rules layer imports NO domain logic / capacity, reads NO clock, makes NO network call (T-04-08)"
    - "D-04 bias-to-silence: unmatched OR ambiguous (double-match) title → null → stay quiet"
key-files:
  created:
    - "src/calendar/filter.ts"
    - "src/calendar/reconcile.ts"
    - "src/calendar/__tests__/filter.test.ts"
    - "src/calendar/__tests__/reconcile.test.ts"
  modified: []
decisions:
  - "matchTitleToClient flattens (alias, client) pairs and sorts longest-alias-first, then returns null if a SECOND distinct company also matches — the double-match bias-to-silence (D-04) lives here, as plan-02 flagged."
  - "isCountingMeeting composes all six exclusions and is applied BEFORE alias resolution inside reconcileMeetings, so the ignore-list ('travel time') excludes 'travel time, stevedores' before it could resolve to the Stevedores client."
  - "isAfterHours uses minutes-since-midnight in the studio zone with an inclusive START / exclusive END bound, so the 17:30 (==WORK_DAY_END) Falcon Dinner is after-hours and a 16:00 meeting is kept; all-day/unparseable starts are treated as after-hours (no time to attribute)."
  - "isSolo treats attendeeCount ≤ 1 as solo, covering A1 (attendees key absent → count 0) and a self-only invite (count 1)."
  - "reconcileMeetings keeps the plan's ignoreList parameter for contract stability even though isCountingMeeting reads MEETING_IGNORE_LIST from config internally (the ignore-list is still applied, via the composed predicate)."
metrics:
  tasks: 2
  files_created: 4
  files_modified: 0
  tests_total: 210
  tests_added: 42
  duration_minutes: 6
  completed: "2026-06-04"
---

# Phase 4 Plan 03: Deterministic Filters + Reconciler (TDD) Summary

The trust-critical rules layer of Phase 4: pure mechanical event filters (declined / all-day / out-of-office / solo / after-hours / overhead) plus a same-day same-client reconciler that reads only pre-computed facts — a designer's filtered counting meetings, their ready-made `Set<companyId>` of booked clients for the target day, and the committed client-alias map — and emits a per-designer "worth a look" list biased hard against false positives. It recomputes no hours, reads no clock, and makes no network call.

## What Was Built

- **`src/calendar/filter.ts`** — seven pure predicates over a `FilteredEvent`:
  - `isDeclined` reads only the `self:true` attendee's `responseStatusSelf === "declined"` (never the event-level `status`, never other attendees' declines — verified against the overhead standup whose organizer declined but self is needsAction).
  - `isAllDay` ⟺ `startDate` present with no `startDateTime`.
  - `isOutOfOffice` ⟺ `eventType ∈ {outOfOffice, focusTime, workingLocation}`.
  - `isSolo` ⟺ `attendeeCount ≤ 1` (A1: solo events have the attendees key entirely absent → count 0).
  - `isAfterHours` parses `startDateTime` with luxon `.setZone("Australia/Sydney")` and compares minutes-since-midnight to `WORK_DAY_START`/`WORK_DAY_END` (inclusive start, exclusive end) — kept in studio zone, never UTC.
  - `isOverhead(title)` — case-insensitive substring against `MEETING_IGNORE_LIST` (D-07 specific phrases; "FDC WIP" is NOT swallowed).
  - `isCountingMeeting` — the composed predicate the reconciler consumes.
- **`src/calendar/reconcile.ts`** — `matchTitleToClient` (longest-alias-first; first confident hit wins; a SECOND distinct company also matching → `null`; no match → `null`) and `reconcileMeetings` (per designer: counting meetings → match → skip on null or same-day-booked → otherwise push `{ title, start, link }`). Output is `Record<DesignerId, WorthALookItem[]>`.
- **42 new tests** across `filter.test.ts` (25) and `reconcile.test.ts` (17), loading the plan-02 golden fixtures and asserting every truth-table row plus both golden FDC outcomes.

## How It Was Verified

- TDD gates per task, visible in git history: `test(04-03)` RED commit then `feat(04-03)` GREEN commit for both filter and reconcile.
- `node --import tsx --test src/calendar/__tests__/filter.test.ts src/calendar/__tests__/reconcile.test.ts` → **42/42 pass**.
- Full suite `node --import tsx --test "src/**/*.test.ts"` → **210/210 pass** (up from 168; no regression).
- Trust-boundary grep `grep -rn 'from "../../domain'|capacity' src/calendar/filter.ts src/calendar/reconcile.ts` returns only docblock comment lines — **no real domain-logic or capacity import** (the only `../domain` import is the pure `STUDIO_ZONE` constant / `DesignerId` type, identical to the sibling `gather.ts`; T-04-08 holds).
- Both golden cases assert exactly: "Quick FDC catch up" (3 Jun, FDC booked) → NOT flagged; "FDC IPO Launch Check-In" (26 May, no FDC booking) → flagged with the correct title/start/link.
- Prettier clean on all four files.

## Deviations from Plan

None — the plan executed as written. Two notes for traceability:

- **Trust-boundary verification semantics:** the plan's verification grep includes the bare token `capacity` and `from "../../domain"`. Both files contain the word "capacity" only inside their trust-boundary docblock ("never touches capacity arithmetic") and import the pure `STUDIO_ZONE`/`DesignerId` from `../domain/types.ts` — the same pure type/constant import the already-shipped `src/calendar/gather.ts` uses (and which plan 04-01 documented as the real boundary: "domain must not import ingestion; ingestion must never recompute hours"). No capacity code and no domain logic is imported; the trust rule is satisfied.
- **`ignoreList` parameter:** `reconcileMeetings` keeps the plan-specified `ignoreList` parameter for signature stability, but the ignore-list is actually applied via `isCountingMeeting` → `isOverhead`, which reads `MEETING_IGNORE_LIST` from config. The behaviour the plan requires ("travel time, stevedores" excluded before alias match) is fully covered and tested.

### Authentication Gates

None — this layer is pure and offline; all tests run with no network and no credentials.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The two mitigate dispositions are satisfied: T-04-08 (no hour recompute / no domain import — asserted) and T-04-09 (uncertain match → silent — unit-tested via the unmatched and double-match cases). T-04-10 (accept) — the rules are pure in-memory with no logging of event payloads.

## Known Stubs

None. The hand-built OOO / all-day / declined fixtures (plan 02) are exercised by real filter implementations here, not stubs.

## Notes for Downstream Plans

- Plan 04-04 renders `WorthALookItem[]` as the 📅 sub-line (D-14): `📅 {title} · {start} · worth a look`, the title deep-linking via `link`.
- The composition root (later) wires `gatherCalendar` → (the reconciler internally applies `isCountingMeeting`) → `reconcileMeetings(eventsByDesigner, bookedClientsByDesignerDay, CLIENT_ALIAS_MAP, MEETING_IGNORE_LIST)` → a new per-designer `RenderContext.worthALook` field, with a calendar `sourceError` threading into the existing degraded path.
- `matchTitleToClient` is exported for reuse/inspection; the double-match-to-null guard is the single place ambiguous titles are resolved to silence.

## Self-Check: PASSED

- All 4 created files present on disk (filter.ts, reconcile.ts, filter.test.ts, reconcile.test.ts).
- Commits exist in git history: 6cbe5c4 (filter RED), dec1cfe (filter GREEN), b8bdd30 (reconcile RED), 89acc0a (reconcile GREEN).
- Full suite 210/210 green; trust-boundary grep clean (no capacity/domain-logic import).

## TDD Gate Compliance

Both features followed RED→GREEN with explicit commits: `test(04-03)` (failing) preceded `feat(04-03)` (passing) for filters (6cbe5c4 → dec1cfe) and for the reconciler (b8bdd30 → 89acc0a). No REFACTOR commit was needed.
