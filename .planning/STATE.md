---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: shipped
stopped_at: v1.0 SHIPPED & archived (tag v1.0, local) — milestones/v1.0-ROADMAP.md; audit tech_debt, no blockers
last_updated: "2026-06-04T12:10:00.000Z"
last_activity: 2026-06-04
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 22
  completed_plans: 22
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02)

**Core value:** Every evening the team gets one clear, trustworthy heads-up of exactly what needs fixing before tomorrow — so the three designers start the day with full, briefed workloads instead of chasing the work themselves.
**Current focus:** v1.0 feature-complete — all 7 phases done & verified. Next: `/gsd:complete-milestone` (and the REQUIREMENTS.md Phase-3 traceability cleanup, see Deferred).

## Current Position

Phase: 07 (hardening) — COMPLETE & VERIFIED (2/2 success criteria; goal achieved)
Plan: 2 of 2 — both done; post-verify test-isolation leak (tests writing real .runs/) found and FIXED (commit 44732de)
Status: Milestone v1.0 feature-complete — 7/7 phases, 22/22 plans, full suite 334 green, tsc clean
Plan 07-02 (wire marker into runNightly) DONE: scheduled-only idempotency guard +
post-success run-log build/print/write wired into `runNightly` via the RunNightlyDeps
marker seam (readMarker/writeMarker/eventName, default-to-real). The guard engages ONLY
when GITHUB_EVENT_NAME==="schedule" and today's marker exists → returns 0 before gather
(D-04); a manual workflow_dispatch always posts. Marker is written ONLY on posted.ok
(D-05c); the !posted.ok exit-1 branch is untouched and never marks (D-05). A degraded 🤖
post still marks (D-06); a writeMarker {ok:false} after a good post logs a loud warning and
STILL returns 0 (D-07-fail). The run log is a redacted counts/booleans/date/enum object,
emitted to stdout (D-07) and persisted as `.runs/<date>.json`. The marker date key derives
from the injected `now` via markerDateKey (single-clock preserved, D-03). nightly.yml gained
a JOB-scoped `contents: write` + a `[skip ci]`-tagged commit/push step with a
nothing-to-commit guard. The 6 idempotency behaviors are tested; full suite 334 green, tsc clean.
REL-03 traceability corrected Phase 6 → Phase 7 and the requirement ticked complete.
Last activity: 2026-06-04 -- Plan 07-02 complete (Phase 7 done)

Progress: [██████████] 100%

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
| Phase 06 P02 | 9min | 2 tasks | 7 files |
| Phase 07 P01 | 2min | 2 tasks | 2 files |
| Phase 07 P02 | 6min | 3 tasks | 4 files |

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
- [Phase 06]: Availability pulled via a dedicated /people?filter[id]=... call (D-01), parsed at the zod boundary into per-weekday minutes (hours x 60, Mon=0..Sun=6); GatherResult.rosteredMinutes(designerId,dateKey) feeds StudioReportInput.rosteredMinutes so Anisha's 0 on Wed/Fri flows through as real off-days.
- [Phase 06]: D-06 per-designer degrade: assessedDesigners = bookings-coverage intersection readable-availability; an unreadable or no-usable-period designer is omitted so the report names them 'couldn't read', never a flat-450 fallback. 14-element identical uses week1 silently, differing warns + uses week1 (parity deferred, D-08).
- [Phase 05-02]: Fuzzy meeting judgment (keep/soften/drop) is applied by PURE code (`applyVerdicts`) BEFORE rendering, keyed by the buildFacts stable flattened index; the function can only shrink/reword the reconciler's worth-a-look list, never grow it — unknown/invented ids are no-ops (the model can never invent a flag, AI-SPEC §6 / T-05-05).
- [Phase 05-02]: Ships behind `USE_LLM_MEETING_JUDGMENT`, DEFAULT OFF — with it off the card is byte-identical to Slice-1-only; judgment only applies when BOTH USE_LLM_RENDERER and USE_LLM_MEETING_JUDGMENT are on. Cleanly separable from Slice 1.
- [Phase 05-02]: `soften` carries the RAW model line into the worth-a-look title; escaping happens once at the renderer boundary (rows.ts escapeHtml, T-05-07) — `applyVerdicts` deliberately does NOT pre-escape (avoids double-escape; deviates from the literal plan must_have wording).
- [Phase 05-02]: The never-drop-a-genuine-flag rule has two halves — STRUCTURAL (flagFairness.test.ts, network-free, in CI: a genuine flag survives no-verdict/keep/unknown-id) + BEHAVIOURAL (scripts/eval-llm-renderer.ts, dev key, OFF-CI: hard-fails if the model EMITS a drop for a genuine-labelled meeting). LLM-02 trusted only after the operator runs the harness and approves.
- [Phase 07-01]: Idempotency marker + structured run log are ONE committed `.runs/<studio-local-date>.json` (D-01). `src/run/marker.ts` derives the date key from the injected `now` only (no live clock read, D-03 single-clock boundary), exposes an injectable `MarkerFs` seam mirroring `RunNightlyDeps` default-to-real DI, `writeMarker` is Result-shaped and never throws (D-07-fail), and `buildRunLog` carries only counts/booleans/date/enum + an already-redacted `postOutcome` (D-08). Primitives only — wiring into `runNightly` + nightly.yml is 07-02; REL-03 stays Pending until then.
- [Phase 07-02]: REL-03 CLOSED. The marker module is wired into `runNightly` via three new `RunNightlyDeps` fields (readMarker/writeMarker/eventName, default-to-real). Scheduled-only guard (D-04): `eventName==="schedule"` AND today's marker exists → log + return 0 BEFORE gather; manual `workflow_dispatch` always posts. Run log built/printed/written ONLY on `posted.ok` (D-05c) — the `!posted.ok` exit-1 branch is byte-untouched and never marks (D-05/two-path rule); degraded 🤖 post still marks (D-06); `writeMarker {ok:false}` after a good post → loud `console.warn`, STILL return 0 (D-07-fail). flagsRaised counts are COUNTED from existing values (designers underbooked/overbooked, g.briefFlags.length, Σ worthALook lengths) — no new math, no secret to buildRunLog/console.*. Single clock preserved (markerDateKey(now); `DateTime.now(` actual-call count still 1 — the 2nd grep hit is a pre-existing doc comment). nightly.yml: JOB-scoped `contents: write` (T-07-04) + a `[skip ci]` commit/push step (T-07-05) guarded by `git diff --cached --quiet` (nothing-to-commit no-op); `.runs/` NOT gitignored. Full suite 334 green (6 new idempotency cases), tsc clean.

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
| Phase 05 (LLM-02) | Expand `labelled-events.json` with 2-3 borderline/overhead cases and re-run `scripts/eval-llm-renderer.ts` to confirm over-flagging drops (the soften/drop side of the rubric) — REQUIRED before `USE_LLM_MEETING_JUDGMENT` is ever turned ON in production. Current eval proves only the never-drop (keep-genuine) path on a single genuine case. | Open | 2026-06-04 |
| Tracking hygiene (REQUIREMENTS.md) | The Traceability table + checkboxes still show several already-shipped Phase 3 requirements (SCHED-01/02, MSG-01..07, REL-01, REL-02) as "Pending" even though Phase 3 is Complete — stale bookkeeping drift, not a code gap. Reconcile (tick delivered reqs) during `/gsd:complete-milestone` or a docs pass. | Open | 2026-06-04 |
| Phase 06 (D-06) | Availability-read failure trips the whole-card D-18 degrade instead of a per-designer 🤖 row (D-06). Pre-existing, logged, not urgent. | Open | 2026-06-04 |

## Session Continuity

Last session: 2026-06-04T11:55:00.000Z
Stopped at: Phase 07 complete & verified; v1.0 feature-complete (7/7 phases). Post-verify test-isolation leak found & fixed (44732de).
Resume file: None — next is `/gsd:complete-milestone` (optionally after the REQUIREMENTS.md traceability cleanup above)
