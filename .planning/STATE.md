---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 06-01-PLAN.md
last_updated: "2026-06-04T08:24:19.224Z"
last_activity: 2026-06-04
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 20
  completed_plans: 17
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02)

**Core value:** Every evening the team gets one clear, trustworthy heads-up of exactly what needs fixing before tomorrow — so the three designers start the day with full, briefed workloads instead of chasing the work themselves.
**Current focus:** Phase 06 — designer-working-day-availability

## Current Position

Phase: 06 (designer-working-day-availability) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-06-04

Progress: [█████████░] 85%

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: — min
- Total execution time: — hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 20 | 2 tasks | 6 files |
| Phase 01 P02 | 3 | 2 tasks | 4 files |
| Phase 01 P03 | 4 | 1 tasks | 2 files |
| Phase 02-productive-pull-briefed-discovery P01 | 8min | 4 tasks | 10 files |
| Phase 02 P02 | 12min | 2 tasks | 4 files |
| Phase 02 P03 | 6min | 3 tasks | 4 files |
| Phase 02 P04 | 25min | 2 tasks | 2 files |
| Phase 04 P01 | 15 | 3 tasks | 12 files |
| Phase 04 P02 | 8min | 3 tasks | 2 files |
| Phase 04 P03 | 6min | 2 tasks | 4 files |
| Phase 04 P04 | 3min | 2 tasks | 6 files |
| Phase 06 P01 | 3min | 2 tasks tasks | 5 files files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Build inside-out — deterministic core first, LLM last and cuttable; Phase 3 is the first genuinely shippable product (no LLM, no Calendar).
- [Roadmap]: All hour/capacity arithmetic stays in deterministic code (Phase 1); the LLM never does maths.
- [Roadmap]: "Briefed" is org-specific, not a native Productive field — confirmed via a mandatory live-data discovery spike in Phase 2 before brief flags are trusted.
- [Phase 1]: STUDIO_ZONE/TARGET_MINUTES live as named constants in types.ts (no separate config.ts); clock/capacity functions stay parameterised to preserve purity.
- [Phase 1]: Holidays injected as ReadonlySet<yyyy-MM-dd> studio-zone keys; clock injects now (never DateTime.now()) for DST-safe determinism.
- [Phase ?]: [Phase 1]: Capacity computes in exact integer minutes; rounding to 0.25h is display-only via round.ts (round-half-up), never re-entering arithmetic (D-15/D-16).
- [Phase ?]: [Phase 1]: DesignerResult + DayStatus exported from capacity.ts as the stable contract for 01-03; overbooked openMin left unclamped (D-06); shaky orthogonal to status (D-05).
- [Phase ?]: [Phase 1]: StudioReport is the top-level output contract (targetDay, window, designers, rollup, missingDesigners); computeStudioReport composes the clock window + per-designer capacity — Phase 2 feeds it, Phase 3 renders it (CAP-05).
- [Phase ?]: [Phase 1]: Roster-gap uses an explicit assessedDesigners input signal (missingDesigners = roster minus assessedDesigners); omitting it means whole roster assessed, so an empty pull is present-but-empty not a gap (D-18/D-19).
- [Phase ?]: X-Organization-Id confirmed live = 34092 (bare numeric); canonical for all Productive calls
- [Phase ?]: Live /bookings has no booking_type/approval_status attributes; work-vs-absence = service vs event relationship; tentative = draft (D-07) — SUPERSEDED, see GAP-CLOSURE below
- [Phase 2 GAP-CLOSURE]: tentative ⟺ present in /allocations but ABSENT from /bookings (live-confirmed) — NOT draft===true (draft returns 0 rows in this org). Supersedes D-07. gather pulls /allocations (the superset), set-difference yields tentative work, mapped with forced draft:true so it flows UNCHANGED through capacity (tentativeMin/shaky, never closes the gap). Event-type allocation-only records ignored (no synthesized tentative absences). Live re-check 2026-06-04: Anisha 3.5h tentative/shaky/0 confirmed, Liam 7.5h ok, Ella 4.5h/3h open — matches expected exactly.
- [Phase ?]: Productive boundary = non-throwing Result<T> client + tolerant zod safeParse against a real captured fixture
- [Phase 2]: gather is the ingestion twin of computeStudioReport — one composition root, degrades via sourceErrors, never throws; assessedDesigners carries only designers a successful pull reached (T-02-15)
- [Phase 2]: gather /bookings include MUST carry person,service,event in addition to the brief chain — the task-only set drops every booking live (silent empty pull); caught by the SC-4 live gate
- [Phase 2]: no-task bookings fail-safe to internal (suppressed) since isClient is only knowable via task→project→project_type_id; avoids false client flags on internal work
- [Phase ?]: [Phase 4]: Open Q1 resolved — bookedClientsByDesignerDay built from already-fetched bookings included (task→project→company), no second Productive call; domain Booking untouched.
- [Phase ?]: [Phase 4]: Calendar is a non-throwing additive source (gatherCalendar) mirroring productive/gather — per-designer degrade via sourceErrors, tolerant zod safeParse boundary, injected stubbable fetchEvents; googleapis ^173.
- [Phase ?]: [Phase 4]: Labelling spike (D-09) committed — MEETING_IGNORE_LIST +travel time (pre-empts Stevedores false match); CLIENT_ALIAS_MAP = 8 confirmed companies; Problem/SOLVD now COUNTS as SOLVD Agency internal time; no bare Solvd/Thirdi alias; Streem != Stream Hill.
- [Phase ?]: [Phase 4]: A2 carry-forward — no outOfOffice/all-day/declined-self events in the 28-day live window; those golden fixtures hand-built; plan 03 must still implement+test those filter paths.
- [Phase 4]: Filters + reconciler are a PURE rules layer (filter.ts/reconcile.ts) — no domain/capacity import, no clock, no network (T-04-08); read only FilteredEvent + the pre-built Set<companyId> + CLIENT_ALIAS_MAP. 42 truth-table/golden tests; full suite 210 green.
- [Phase 4]: matchTitleToClient is longest-alias-first with a double-match→null guard; reconcileMeetings stays SILENT on unmatched/ambiguous titles (D-04) and applies the ignore-list (via isCountingMeeting) before alias resolution. Both golden FDC cases resolve exactly (3 Jun covered, 26 May worth-a-look).
- [Phase ?]: [Phase 4]: 📅 worth-a-look sub-line copies the ⚠️/📄 nested-sub-line pattern exactly (escapeHtml + muted, deep-linked title via htmlLink); RenderContext.worthALook is presentation-only, assembled in buildRenderContext alongside tentativeNotes.
- [Phase ?]: [Phase 4]: calendar wired into runNightly as an ADDITIVE degradable source — cal.sourceErrors concatenated into the degrade list before render (REL-01), so a Calendar outage degrades to the 🤖 card and still posts; calendar is never the exit-1 POST-failure path (two-path rule).
- [Phase 06]: availableMinutes basis is now per-designer rostered minutes (rostered - absence, floored), not flat TARGET_MINUTES; a 0-rostered day reuses the existing "off" status with no new DayStatus value (CAP-06 / D-02 / D-03 / D-04).
- [Phase 06]: StudioReportInput.rosteredMinutes(designerId, dateKey) is the injected lookup the rollup + target-day path use; omitted = flat TARGET_MINUTES fallback, a missing/0 entry resolves to 0 and never fabricates capacity (CAP-05 fix / D-06 / D-07).

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 4]: Google Calendar — **UNBLOCKED + LIVE-VALIDATED 2026-06-04.** Service account `studio-checkin-calendar@evening-studio-checkin.iam.gserviceaccount.com` (Client ID 114624945849863129481, project evening-studio-checkin) created; JSON key in gitignored `secrets/`; DWD authorised by admin for scope `https://www.googleapis.com/auth/calendar.readonly`. End-to-end probe PASSED for ALL THREE designers (read primary calendars, Australia/Sydney tz, all share a real "Creative team - review" meeting). Confirmed impersonation emails: liamm@solvdagency.com.au (686717), anishag@solvdagency.com.au (686712), ellaw@solvdagency.com.au (686716). Still TODO for Phase 4 execution: set the SA JSON as a GitHub secret (e.g. GOOGLE_SA_KEY); build the read via `googleapis` JWT+subject (probe used raw JWT, no dep); the WIP/creative-team meeting ignore-list (per CLAUDE.md) is relevant — "Creative team - review" is exactly such a meeting.
- [Phase 5]: ~~Production LLM needs an org-sanctioned Anthropic API key.~~ **RESOLVED 2026-06-04** — Liam confirmed the `ANTHROPIC_API_KEY` already in the local `.env` IS the org-sanctioned, approved key (single key for dev + prod; no approval gate, no separate dev key, Pro/Max OAuth route not used). Only remaining production-wiring step: add this same key as a GitHub Actions repository secret for the unattended nightly cron.
- [Phase 3 → production]: The nightly GitHub Actions cron will not fire until `GCHAT_WEBHOOK_URL` (real studio space, not the test space), `PRODUCTIVE_AUTH_TOKEN`, and `PRODUCTIVE_ORG_ID` are added as GitHub Actions repository secrets. They currently exist only in the local gitignored `.env`. Phase 3 code is shippable; production delivery is gated on these secrets.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260604-kig | Add end-to-end calendar render + runNightly integration tests for Phase 04 | 2026-06-04 | dd4fcb0 | [260604-kig-add-end-to-end-calendar-render-runnightl](./quick/260604-kig-add-end-to-end-calendar-render-runnightl/) |
| fast | Type DesignerId index keys in gather tests — tsc --noEmit now clean | 2026-06-04 | f5170cb | — |
| 260604-l0j | Calendar-only failure keeps Productive figures + clean note (no leaked key) | 2026-06-04 | afb98a5 | [260604-l0j-calendar-only-failure-keeps-productive-f](./quick/260604-l0j-calendar-only-failure-keeps-productive-f/) |
| 260604-lco | 📅 line: plain text + duration + "not in Productive" (overrides MSG-06 deep-link) | 2026-06-04 | a36601e | [260604-lco-worth-a-look-line-plain-text-show-durati](./quick/260604-lco-worth-a-look-line-plain-text-show-durati/) |
| fast | Mute the ⚠️ tentative line text to match the other grey sub-lines | 2026-06-04 | 2a3c2f9 | — |
| 260604-nv0 | Matter-of-fact LLM header tone — drop "worth X" tails | 2026-06-04 | b1cee04 | [260604-nv0-matter-of-fact-llm-header-tone](./quick/260604-nv0-matter-of-fact-llm-header-tone/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-04T08:24:19.219Z
Stopped at: Completed 06-01-PLAN.md
Resume file: None
