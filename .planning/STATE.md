---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: shipped
stopped_at: "Rolled out to MAIN Chat space (2026-06-11) — GCHAT_WEBHOOK_URL swapped from TEST to the team space, cron-job.org Test run fired, team comms sent, live. Explored infra consolidation (NO CHANGE MADE): GCP = single-vendor target; GitHub cron can't be the punctual 4:30 trigger. Open: ANTHROPIC_API_KEY secret + public-holiday suppression (.planning/BACKLOG.md)"
last_updated: "2026-06-11T00:00:00.000Z"
last_activity: 2026-06-11
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

- [Phase 4]: Google Calendar — **DONE + LIVE.** `GOOGLE_SA_KEY` is set as a GitHub Actions secret (confirmed via `gh secret list` 2026-06-09). Service account `studio-checkin-calendar@evening-studio-checkin.iam.gserviceaccount.com` (project evening-studio-checkin); DWD authorised for `calendar.readonly`; impersonates liamm/anishag/ellaw. No longer a blocker.
- [Phase 5 → production]: **STILL PENDING (2026-06-09).** `ANTHROPIC_API_KEY` (the org-sanctioned key, already in local `.env`) is **NOT yet a GitHub Actions repo secret** — confirmed absent via `gh secret list`. So the unattended run currently falls back to the deterministic template (no LLM phrasing). Add the key as a repo secret to enable LLM phrasing in production. This is the one outstanding production-wiring item.
- [Phase 3 → production]: **RESOLVED 2026-06-09; ROLLED OUT TO MAIN 2026-06-11.** `GCHAT_WEBHOOK_URL`, `PRODUCTIVE_AUTH_TOKEN`, `PRODUCTIVE_ORG_ID` are all set as GitHub Actions secrets. The production `GCHAT_WEBHOOK_URL` was swapped from the TEST space to the **real team Chat space on 2026-06-11** (rollout by Liam: secret updated + cron-job.org Test run + team comms sent). Local `.env` deliberately stays on the TEST space so dev runs never post to the team. See memory `gchat-webhook-test-space`.
- [Scheduling — SCHED-04, 2026-06-09]: The GitHub Actions `schedule:` cron was **removed** (it fired 4–5h late on all 3 runs). The nightly run is now triggered by **cron-job.org → `workflow_dispatch`** at 4:30pm Sydney, with **healthchecks.io** as an independent dead-man's switch (`HEALTHCHECK_PING_URL` secret set; workflow pings on success). End-to-end proven 2026-06-08 (dispatch run started + finished in ~29s vs hours late). See debug `.planning/debug/nightly-post-4h-late.md`, `scheduler/README.md`, and memory `github-cron-late-send`. **Open follow-up:** suppress posting on public holidays — see `.planning/BACKLOG.md`.
- [Infra consolidation — EXPLORED 2026-06-11, NO CHANGE MADE]: Liam wants fewer infra services long-term. Conclusion recorded for future work: the stack splits into hard deps (Productive, Google Calendar + Chat, Anthropic — can't move, they ARE the job) and the infra layer (run = GitHub Actions, trigger = cron-job.org, watch = healthchecks.io). **4:30pm punctuality is a HARD constraint, which rules out GitHub's own `schedule:` cron as the trigger** (it fired 4–5h late, SCHED-04) — so a precise external scheduler is mandatory and cron-job.org is not removable sprawl. The genuine single-vendor consolidation target = **GCP** (Cloud Scheduler exact-minute trigger + Cloud Run running the Node code unchanged + Cloud Monitoring watchdog), the platform Solvd is already on for Calendar + Chat. Not actioned — current setup hits 4:30 and works. See memory `consolidation-target-gcp`.

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
| Phase 05 (LLM-02) | Expand the eval with borderline/overhead cases to exercise the soften/drop side. | RESOLVED 2026-06-04 (bf8895c) | 2026-06-04 |
| Tracking hygiene (REQUIREMENTS.md) | Stale "Pending" Phase 3 rows despite Phase 3 Complete. | RESOLVED 2026-06-04 (e32db5f) | 2026-06-04 |
| Phase 06 (D-06) | Availability-read failure tripped the whole-card degrade instead of a per-designer 🤖 row. | RESOLVED 2026-06-04 (5b86343) | 2026-06-04 |
| Availability period selection | First-match `.find` was order-dependent under overlapping periods (could resurface a stale full-time day on a day off). | RESOLVED 2026-06-04 (52bec02) | 2026-06-04 |
| Phase 04 live-run | Two live-run integration checks. | RESOLVED 2026-06-04 (real run, both checks) | 2026-06-04 |

**All carried-forward tech debt resolved as of 2026-06-04.** Suite 335 green, tsc clean.

## Session Continuity

Last session: 2026-06-11 (production rollout to MAIN Chat space + infra-consolidation exploration)
Stopped at: Rolled the nightly check-in out to the **real team Chat space** — swapped the production `GCHAT_WEBHOOK_URL` GitHub secret from the TEST space to the team space, fired a cron-job.org Test run to confirm, and sent the team a plain-English explainer. Local `.env` stays on the TEST space on purpose. NO code/src change — secret swap only (done in the GitHub + Google Chat web UIs, outside the repo). Then explored consolidating the infra stack (cron-job.org/healthchecks.io) into fewer services — recorded the GCP target + the 4:30-punctuality constraint that rules out GitHub cron (see Blockers/Concerns + memory `consolidation-target-gcp`); no change made. Open follow-ups unchanged: ANTHROPIC_API_KEY GitHub secret + public-holiday suppression.

Previous session: 2026-06-09 (SCHED-04 — scheduling reliability)
Stopped at: Fixed the late-send bug (all 3 scheduled runs fired 4–5h late). Removed GitHub `schedule:` cron entirely; nightly run is now triggered by cron-job.org → `workflow_dispatch` (punctual) with a healthchecks.io dead-man's switch (`HEALTHCHECK_PING_URL` secret set; workflow pings on success). NO app/src change — `nightly.yml` only (cron removed + ping step). Committed + pushed to main (`fix(sched)…`, SCHED-04). End-to-end proven 2026-06-08: a manual dispatch ran in ~29s and the ping step succeeded. Suite 335 green. Setup runbook: `scheduler/README.md`; debug record: `.planning/debug/nightly-post-4h-late.md`.
External setup DONE by Liam this session: healthchecks.io check (`evening-checkin`, alerts to digital@solvdagency.com.au) + cron-job.org job (POST to workflow_dispatch, Sydney 16:30 Mon–Fri) + fine-grained PAT.
Resume file: None. Open items: (1) `ANTHROPIC_API_KEY` not yet a GitHub secret (LLM falls back to template) — see Blockers. (2) Public-holiday suppression — see `.planning/BACKLOG.md`. (3) Optional: test the watchdog by breaking the token once. (4) `GCHAT_WEBHOOK_URL` rolled out to the MAIN team space 2026-06-11 (DONE). (5) v2 work: `/gsd:new-milestone` (phases continue from 8); `git push origin v1.0` to publish the tag.
Pre-existing v1.0 state: shipped + archived (tag v1.0 local); all carried-forward tech debt cleared.
