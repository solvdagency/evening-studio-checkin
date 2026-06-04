---
phase: 04-calendar-meeting-reconciliation
plan: 02
subsystem: calendar-labelling-spike
tags: [calendar, spike, labelling, config, fixtures, alias-map, ignore-list, D-09]
requires:
  - "src/calendar/auth.ts::buildCalendarClient + loadSaKey (plan 04-01, reused)"
  - "src/productive/client.ts::fetchAllPages (reused)"
  - "src/calendar/schemas.ts::CalendarEventResource (fixtures validate against it)"
provides:
  - "src/calendar/spike.ts::standalone labelling-spike (NOT in nightly path)"
  - "src/config.ts: MEETING_IGNORE_LIST (refined, +travel time) + CLIENT_ALIAS_MAP (8 confirmed companies) + pinned A1/A2 spike findings"
  - "src/calendar/__fixtures__/labelled-events.json: 8 zod-valid golden fixtures incl. both validated FDC cases"
affects:
  - "src/calendar/filter.ts + reconcile.ts (plan 04-03 — assert against these golden fixtures; implement OOO/all-day/declined filter paths that live data did not exercise; resolve double-match bias-to-silence)"
tech-stack:
  added: []
  patterns:
    - "Live-data labelling spike → committed config + golden fixtures (D-09, twin of the Phase-2 'briefed' discovery)"
    - "Hand-built fixtures for filter paths absent from the live window (A2)"
key-files:
  created:
    - "src/calendar/__fixtures__/labelled-events.json"
  modified:
    - "src/config.ts (MEETING_IGNORE_LIST + CLIENT_ALIAS_MAP + A1/A2 docblock)"
decisions:
  - "MEETING_IGNORE_LIST gains 'travel time' specifically so 'travel time, stevedores' is hard-excluded BEFORE alias matching and never resolves to the new Newcastle Stevedores client."
  - "Problem/SOLVD moved OUT of overhead — it now COUNTS as internal SOLVD time (SOLVD Agency alias entry, id 742669); flags when no SOLVD Agency booking exists that day."
  - "Alias-safety invariants: NO bare 'Solvd'/'SOLVD' alias (would swallow 'Solvd X Streem WIP' → STREEM and 'Stevedores x Solvd' → Stevedores); NO bare 'Thirdi' (only 'Sable'); 'Streem' (id 1057026) and 'Stream Hill' (id 1109526) are distinct companies with narrow aliases."
  - "A2 finding: OOO / all-day / declined-self events did NOT occur in the 28-day live window → those golden fixtures are hand-built; plan 03 must still implement+test those filter paths."
metrics:
  tasks: 3
  files_created: 1
  files_modified: 1
  tests_total: 168
  completed: "2026-06-04"
---

# Phase 4 Plan 02: Calendar Labelling Spike Summary

The D-09 live-data labelling spike — the de-risking twin of Phase 2's "briefed" discovery — turned ~4 weeks of all three designers' real meetings into committed, human-confirmed config (overhead ignore-list + an 8-company client-alias map) and a set of zod-valid golden fixtures, pinning the solo-event (A1) and eventType (A2) data shapes against live data instead of memory.

## What Was Built

This plan's Tasks 1 and 2 ran in prior dispatches:
- **Task 1 (commit 3203cc2):** `src/calendar/spike.ts` — a standalone labelling-spike script (not in the nightly path) reusing `buildCalendarClient`/`loadSaKey` and `fetchAllPages`. It pulled the 28-day window (2026-05-07 → 2026-06-04) of all three calendars + their Productive bookings into a gitignored `spike-output.md` / `spike-output.json` (141 instances, 30 distinct titles).
- **Task 2 (human checkpoint):** Liam labelled each distinct meeting overhead / counts / not-work and confirmed every client name + company id.

Task 3 (this dispatch, commit **fc5f98d**) committed those labels:
- **`MEETING_IGNORE_LIST`** refined to 5 specific phrases: the 4 existing ceremonies plus **"travel time"** (hard-excluded before alias matching so "travel time, stevedores" never resolves to the Stevedores client). "Problem/SOLVD" was deliberately *removed* from overhead.
- **`CLIENT_ALIAS_MAP`** extended from 1 seed (FDC) to **8 confirmed companies**: FDC Construction (1333899, +"Atlassian"), Hunter Water (779697), Stream Hill (1109526), STREEM (1057026, distinct from Stream Hill), Newcastle Stevedores (1319181), Reflections Holiday Parks (753249), Thirdi Property (752556, "Sable" only), and SOLVD Agency (742669 — internal time that now counts). Alias-safety invariants (no bare Solvd/Thirdi, Streem≠Stream Hill, bias-to-silence per D-04) documented inline.
- **A1/A2 findings docblock** pinned in `src/config.ts` for plan 03's `filter.ts`.
- **`src/calendar/__fixtures__/labelled-events.json`** — 8 `CalendarEventResource`-valid samples: 5 real (both golden FDC cases "Quick FDC catch up"/3 Jun covered + "FDC IPO Launch Check-In"/26 May worth-a-look; solo "appointment"; after-hours "Falcon Dinner" 17:30; overhead "Team Daily Stand-up") and 3 hand-built (declined-self, all-day date-only, out-of-office).

## How It Was Verified

- Plan's `<automated>` validator: every fixture passes `CalendarEventResource.safeParse` and both golden cases (`/Quick FDC/i`, `/IPO Launch/i`) are present → **PASS (8 fixtures)**.
- Config guard: `MEETING_IGNORE_LIST` = 5 entries, `CLIENT_ALIAS_MAP` = 8 entries, no bare `Solvd`/`Thirdi` alias → **config-ok**.
- `git status` confirms `spike-output.{md,json}` are gitignored and NOT staged (T-04-06).
- Full suite `npm test` → **168/168 pass** (no regression).
- Prettier clean on both touched files.

## Deviations from Plan

None — Task 3 executed exactly as written. The ignore-list/alias-map/fixtures match Liam's authoritative labels verbatim. (The SPIKE-FINDINGS note specified by the plan as "config.ts OR src/calendar/SPIKE-FINDINGS.md" was placed inline in `src/config.ts` near the alias map, satisfying the acceptance criterion.)

### Authentication Gates

None in Task 3 (it transcribes already-pulled data; no live calls). Task 1's live pull used the already-provisioned `GOOGLE_SA_KEY` chain.

## Known Stubs

None. The hand-built OOO / all-day / declined fixtures are intentional synthetic coverage (clearly marked `_fixtureNote: HAND-BUILT`), not stubbed-out production behaviour.

## Notes for Downstream Plans (carry-forward)

- **A2 carry-forward (important):** No `outOfOffice`, no all-day, and no declined-self events occurred in the 28-day live window (only `default` ×63 and `focusTime` ×1). Plan 03 must still **implement and test** the OOO / all-day / declined filter paths — they are exercised only by the hand-built fixtures, not by live data.
- Plan 03's matcher owns the **double-match bias-to-silence** (D-04) and must confirm "SH"/"Streem" do not cross-match "Stream Hill"; a test should cover this if not already present.
- "travel time" sits in the ignore-list precisely to pre-empt a Stevedores false match — the filter must apply the ignore-list BEFORE alias resolution.

## Self-Check: PASSED

- `src/calendar/__fixtures__/labelled-events.json` present on disk; 8 entries all safeParse-valid; both golden cases present.
- `src/config.ts` modified (5 ignore phrases, 8 alias entries, A1/A2 docblock); no bare Solvd/Thirdi alias.
- Commits exist in git history: 3203cc2 (Task 1 spike), fc5f98d (Task 3 config + fixtures).
- Full suite 168/168 green.
