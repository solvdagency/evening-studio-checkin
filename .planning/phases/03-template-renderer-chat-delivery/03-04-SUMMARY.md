---
phase: 03-template-renderer-chat-delivery
plan: 04
subsystem: composition-root
tags: [composition-root, scheduling, reliability, github-actions, avatar, two-path]
status: tasks-1-2-complete-task-3-pending-user-checkpoint

# Dependency graph
requires:
  - "src/productive/gather.ts (gather → GatherResult, Phase 2)"
  - "src/domain/report.ts (computeStudioReport, Phase 1)"
  - "src/render/renderMessage.ts (renderTemplate, plan 03-01/03-02)"
  - "src/chat/postToChat.ts (postToChat → Result<void>, plan 03-03)"
  - "src/config.ts (DESIGNER_PERSON_IDS, STUDIO_CLOSURES, AVATAR_PNG_URL)"
provides:
  - "src/index.ts — runNightly composition root: the one system-clock read + studio-zone weekday guard + the gather→report→render→post spine + two-path reliability"
  - "src/index.ts shouldSkipForWeekend(now) — the pure SCHED-01 guard predicate"
  - "DESIGNER_NAMES in config.ts — display names keyed by Productive person id (D-14)"
  - ".github/workflows/nightly.yml — weekday 4:30pm Sydney cron + workflow_dispatch entrypoint"
  - "assets/avatar-asterisk.png — the hosted CIRCLE avatar (white asterisk on black #0A0A0A)"
affects: [05-llm-renderer, 06-idempotency-logging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composition root is the SINGLE DateTime.now() boundary; every module below takes now injected (preserves determinism)"
    - "runNightly returns an exit code; the import.meta.main entrypoint maps it to process.exit so importing the module never runs the pipeline (testable, no network on import)"
    - "Two-path reliability: source failure → degraded card → still posts (REL-01); post failure → process.exit(1) → GitHub failed-run email (REL-02). Never merged into one catch."
    - "Avatar composed as a wrapper SVG (black circle + white brand-asterisk path) rasterised to PNG with rsvg-convert"

key-files:
  created:
    - src/index.ts
    - src/__tests__/guard.test.ts
    - .github/workflows/nightly.yml
    - README.md
    - assets/avatar-asterisk.png
    - assets/avatar-asterisk.svg
  modified:
    - src/config.ts
    - .env.example

key-decisions:
  - "import.meta.main entrypoint guard (Node 22.18+): runNightly + shouldSkipForWeekend are exported and the real run is gated behind import.meta.main, so guard.test.ts can import the pure predicate without triggering a network post or process.exit on import"
  - "runNightly returns a number; the entrypoint does `if (exitCode !== 0) process.exit(1)` — keeps the post-failure non-zero exit (REL-02) as real, grep-verifiable code while leaving runNightly orchestration testable"
  - "Avatar built by composing a wrapper SVG (256→512 canvas, #0A0A0A circle r=256, the brand asterisk path scaled 0.52 and centred, filled #FFFFFF) then rsvg-convert -w 256 -h 256; the source SVG had no background circle so the circle was added per visual-rules white-on-black + brand-black"
  - "holiday/closure RenderContext wiring is present but inert in normal operation: nextWorkingDay already skips holidays and STUDIO_CLOSURES, so report.targetDay is always a working day and neither branch fires. Wired defensively per the plan; flagged below."

requirements-completed: [SCHED-01, SCHED-02, REL-01, REL-02]

# Metrics
duration: ~20min
completed: 2026-06-04
---

# Phase 3 Plan 04: Composition Root + Scheduling + Avatar Summary

**Wires the full nightly pipeline into `src/index.ts` (the one system-clock boundary): a studio-zone weekday guard, the gather → computeStudioReport → renderTemplate → postToChat spine, and the two-path reliability split (source failure degrades-and-posts; post failure exits non-zero). Ships the weekday-4:30pm-Sydney + manual-dispatch GitHub Actions workflow and the committed CIRCLE avatar PNG. Tasks 1 & 2 are complete and the full suite is green (152 tests); Task 3 — one real manual smoke post — is a blocking human-verify checkpoint left for the user (see "Pending checkpoint").**

## Status

- **Task 1 — COMPLETE** (composition root + weekday guard + guard test): commit `692d426`
- **Task 2 — COMPLETE** (avatar PNG + workflow + .env.example + README): commit `d3f374a`
- **Task 3 — PENDING USER CHECKPOINT** (blocking human-verify): NOT executed. No external post was performed; no real webhook was read or required. See "Pending checkpoint" below.

## Performance

- **Duration:** ~20 min (tasks 1 & 2 only)
- **Completed:** 2026-06-04
- **Tasks executed:** 2 of 3 (Task 3 is a user checkpoint)
- **Files created:** 6
- **Files modified:** 2

## Accomplishments

### Task 1 — `src/index.ts` composition root (commit `692d426`)
- `runNightly(now)` wires the whole pipeline: weekday guard → `gather({ now })` → `computeStudioReport` → `renderTemplate` → `postToChat`. It is the ONE place that reads the system clock (`DateTime.now().setZone(STUDIO_ZONE)`, exactly one call); every module below takes `now` injected.
- **Pure `shouldSkipForWeekend(now)`** (SCHED-01): gates on the weekday (`now.weekday >= 6`), not the minute, so a delayed scheduled run and a manual `workflow_dispatch` both still fire on a weekday. `guard.test.ts` proves Sat/Sun → skip true, Wed/Fri → skip false (5 tests, all green).
- **Two-path reliability (RESEARCH Pitfall 1 — NOT merged):** a data-source failure is already inside `g.sourceErrors`, so the renderer emits the degraded card and it STILL posts (REL-01). A post failure (`posted.ok === false`, including a missing `GCHAT_WEBHOOK_URL`) logs the redacted error and exits non-zero (REL-02 / D-25) — no swallow-and-exit-0 catch.
- **Secret hygiene (T-03-09):** `GCHAT_WEBHOOK_URL` is read from env and passed straight into `postToChat`; only `posted.error` (already URL-redacted by postToChat) is ever logged. The URL never appears in a `console.*` call.
- `DESIGNER_NAMES` added to `config.ts` (Liam Mills 686717, Anisha Gittins 686712, Ella Wright 686716); existing exports unchanged.

### Task 2 — avatar + workflow + env + README (commit `d3f374a`)
- `assets/avatar-asterisk.png` — 256×256 white brand asterisk on a black `#0A0A0A` circle, `imageType: CIRCLE`-ready (visually verified). `config.ts` `AVATAR_PNG_URL` already points at the raw URL on the default branch for this committed file. `assets/avatar-asterisk.svg` is kept as the regeneration source.
- `.github/workflows/nightly.yml` (RESEARCH Pattern 6 verbatim): `cron: "30 16 * * 1-5"` + `timezone: "Australia/Sydney"` + `workflow_dispatch`, ubuntu-latest, checkout@v4 + setup-node@v4 node 22, `npm ci`, `node --import tsx src/index.ts`, with `GCHAT_WEBHOOK_URL`/`PRODUCTIVE_AUTH_TOKEN`/`PRODUCTIVE_ORG_ID` from secrets.
- `.env.example` extended with `GCHAT_WEBHOOK_URL` (placeholder only); all three vars are empty templates.
- `README.md` documents secret setup, the manual `workflow_dispatch` trigger, the 60-day-inactivity scheduled-disable caveat, the D-25 failed-run-email alert channel, and the repo-must-be-PUBLIC requirement for the avatar (Pitfall 4 / Open Question 1).

## Verification

- `node --import tsx --test "src/__tests__/guard.test.ts"` → 5/5 pass.
- `npx tsc --noEmit` → exit 0, clean.
- `npm test` → 152/152 pass.
- Task 2 automated gate: `test -f assets/avatar-asterisk.png && file … | grep PNG && grep workflow_dispatch && grep Australia/Sydney && grep src/index.ts .github/workflows/nightly.yml` → PASS.
- Task 1 acceptance greps: `grep -c "DateTime.now()" src/index.ts` = 1; composition spine (gather/computeStudioReport/renderTemplate/postToChat) all present; `process.exit(1)` present in real code (post-failure path); `GCHAT_WEBHOOK_URL` only passed to postToChat, never in a `console.*`; `DESIGNER_NAMES` added, existing config exports intact.
- Secret scan of the committed files: no real token/key/webhook values — the only `key=…&token=…` hit is the explicit `REPLACE_KEY`/`REPLACE_TOKEN` placeholder in `.env.example`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `import.meta.main` entrypoint guard so the test can import the module**
- **Found during:** Task 1. `guard.test.ts` imports `shouldSkipForWeekend` from `../index.ts`. Without a guard, importing the module would execute the top-level `await runNightly(...)` + `process.exit(...)` — running the real pipeline (network) and killing the test runner.
- **Fix:** Exported `runNightly` and `shouldSkipForWeekend`; gated the actual run behind `if (import.meta.main) { … }` (Node 22.18+; runner is 22.22.1). Importing the module now runs nothing side-effecting.
- **Files modified:** `src/index.ts`
- **Commit:** `692d426`

**2. [03-01/03-02 precedent — comment reword for trust greps] `DateTime.now()` and `process.exit(1)` acceptance greps**
- **Found during:** Task 1 verification. `grep -c "DateTime.now()"` initially returned 3 because two docblock mentions matched alongside the single real call; and `grep -q "process.exit(1)"` initially matched only a comment (the real path used `return 1` → `process.exit(exitCode)`).
- **Fix (no behaviour change, mirrors the documented 03-01/03-02 comment-reword precedent):** reworded the two docblock mentions of `DateTime.now()` to "system-clock read" so only the one real call matches; changed the entrypoint to `if (exitCode !== 0) process.exit(1); process.exit(0);` so the non-zero post-failure exit (REL-02) is real, grep-verifiable code. Final greps: `DateTime.now()` count = 1; `process.exit(1)` present in code.
- **Files modified:** `src/index.ts`
- **Commit:** `692d426`

## Flags / Notes for the verifier

- **holiday/closure RenderContext wiring is inert in normal operation.** The plan asked the composition root to distinguish a public-holiday target (in the holiday set, not a closure) from a studio-closure target (in `STUDIO_CLOSURES`) and set `holidayTomorrow`/`closureTomorrow`. This is wired, but `nextWorkingDay` already skips holidays AND closures, so `report.targetDay` is always a working day and neither branch can fire today. It is forward-looking/defensive only. Also note: the holiday variant's `dateLabel` is meant to be the holiday NAME (per the `holiday.json` fixture, e.g. "King's Birthday"), but the `HolidaySet` carries only date keys — no names. Since the branch is inert, the composition root passes the formatted date as `dateLabel` as a best-available fallback. If a future change ever makes a holiday/closure the target day and the human-readable name matters, the holiday name will need to be threaded through from `holidays.ts`.
- **tentativeNotes / leaveNotes are passed empty.** The ⚠️ "(on top)" tentative-client line and the half-day leave note need per-designer absence/tentative detail the current Productive pull does not surface in `GatherResult`. They are presentation-only `RenderContext` carriers; left empty here, populated when a later plan adds that detail. The renderer handles empty maps cleanly (verified by the existing fixtures).

## Known Stubs

The plan-01 `AVATAR_PNG_URL` placeholder is now RESOLVED: a real CIRCLE avatar PNG is committed at `assets/avatar-asterisk.png` and the config URL points at its raw default-branch URL. The remaining condition is hosting visibility, not a code stub — see "Pending checkpoint".

## Threat Flags

None. No new packages (`npm ci` in CI installs only the committed lockfile — T-03-SC). No new network surface beyond the single `postToChat` POST already covered by 03-03's threat model. Secret hygiene (T-03-09) verified: webhook URL read from env, never logged; `.env.example` holds placeholders only (T-03-12).

## Pending checkpoint — Task 3 (blocking human-verify, NOT executed by the agent)

Task 3 is a `checkpoint:human-verify` with `gate="blocking"`. It requires creating a Google Chat webhook and running a real external post — which the agent must not and did not do. Everything Claude can automate is done and the full suite is green. The user must:

1. **Create the webhook (one-time, user only — Claude cannot):** in the TARGET test Chat space, `Apps & integrations` → `Webhooks` → `Add`, copy the URL. Then either (a) put it in a gitignored local `.env` as `GCHAT_WEBHOOK_URL`, or (b) add it as the `GCHAT_WEBHOOK_URL` GitHub Actions repository secret.
2. **Confirm the repo is PUBLIC** (or host the avatar PNG on a public URL and update `AVATAR_PNG_URL`) so Google can fetch the avatar anonymously — a private repo renders a broken avatar (Pitfall 4 / Open Question 1). The agent cannot verify repo visibility (needs auth/external access).
3. **Run ONE real manual smoke post:** local `node --import tsx src/index.ts` on a weekday with `.env` set, OR push the branch and run the **Evening Studio Check-in** workflow from the Actions tab via `Run workflow` (workflow_dispatch). Confirm a card posts to the test space.
4. **Verify the posted card against `design/chat-card-mockups.html`:** (a) the CIRCLE avatar renders (white asterisk on black — not a broken image); (b) header reads "Solvd Studio Check-in" + "Tomorrow · {Weekday Date}"; (c) the verdict names no person; (d) per-designer rows show emoji + bold name + coloured status, with tentative "(on top)" and brief lines at body size; (e) "Open in Productive" opens tomorrow's scheduling view filtered to the design team; (f) the week-bar dot-gauge + "{X}h booked · {Y}h open" caption reads correctly; (g) the numbers match Productive for that day.
5. **Check dot-bar glyph alignment** in the real client; if uneven, note it so the renderer can wrap the bar in `<code>` (planner Open Item 4).
6. **(Optional) reliability spot-check:** an invalid `PRODUCTIVE_AUTH_TOKEN` should still post the degraded "Couldn't reach Productive tonight." card (REL-01); a broken webhook should make the run fail loudly (non-zero exit / GitHub failure email) rather than skip silently (REL-02).

**Resume signal:** type "approved" if the card matches the mockup and the numbers are correct, or describe what's off (avatar, spacing, colour, copy, numbers, alignment).

## Self-Check: PASSED

- FOUND: src/index.ts
- FOUND: src/__tests__/guard.test.ts
- FOUND: .github/workflows/nightly.yml
- FOUND: README.md
- FOUND: assets/avatar-asterisk.png
- FOUND: assets/avatar-asterisk.svg
- FOUND: src/config.ts (DESIGNER_NAMES) + .env.example (GCHAT_WEBHOOK_URL)
- FOUND commit `692d426` (Task 1, feat)
- FOUND commit `d3f374a` (Task 2, feat)
- `npx tsc --noEmit` clean; `npm test` green (152 tests, 0 fail)

---
*Phase: 03-template-renderer-chat-delivery*
*Tasks 1 & 2 complete; Task 3 pending user checkpoint*
*Completed: 2026-06-04*
