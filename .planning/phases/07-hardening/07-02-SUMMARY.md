---
phase: 07-hardening
plan: 02
subsystem: run/idempotency
tags: [idempotency, run-log, dependency-injection, ci, traceability]
requires:
  - "src/run/marker.ts (markerDateKey, readMarker, writeMarker, buildRunLog — Plan 07-01)"
  - "src/index.ts runNightly + RunNightlyDeps DI seam"
provides:
  - "RunNightlyDeps.readMarker / writeMarker / eventName (the marker seam, default-to-real)"
  - "scheduled-only idempotency guard in runNightly (REL-03)"
  - "post-success structured run log: stdout + committed .runs/<date>.json"
  - "nightly.yml job-scoped contents:write + [skip ci] marker commit/push step"
affects:
  - "Phase 7 verification (closes REL-03 + the structured-run-log success criterion)"
tech-stack:
  added: []
  patterns:
    - "Marker seam injected the same default-to-real way as gather/postToChat"
    - "Post-first/mark-second on the posted.ok path only (D-05)"
    - "CI self-commit guarded by [skip ci] + git diff --cached --quiet"
key-files:
  created:
    - ".planning/phases/07-hardening/07-02-SUMMARY.md"
  modified:
    - "src/index.ts"
    - "src/__tests__/runNightly.test.ts"
    - ".github/workflows/nightly.yml"
    - ".planning/REQUIREMENTS.md"
decisions:
  - "flagsRaised counts are COUNTED from already-computed values (designers underbooked/overbooked, g.briefFlags.length, Σ worthALook item lengths) — no new computation, no secret reaches buildRunLog/console.*"
  - "REL-03 traceability ticked Complete and remapped Phase 6 → Phase 7 (this plan closes it)"
metrics:
  duration_min: 6
  completed: "2026-06-04"
  tasks: 3
  files: 4
---

# Phase 7 Plan 02: Wire Idempotency + Run Log into runNightly Summary

The Plan 07-01 marker primitives are now live in the production run: `runNightly` reads a scheduled-only idempotency guard before doing any work and, on a confirmed successful post, builds a redacted structured run log that it prints to stdout and persists as `.runs/<studio-local-date>.json`; the nightly workflow commits that marker back with `[skip ci]` so it never re-triggers itself. REL-03 (never double-post) and Phase 7's structured-run-log criterion are delivered, the two-path and single-clock rules untouched.

## What Was Built

- **`src/index.ts`** — three new `RunNightlyDeps` fields, all default-to-real (mirroring `gather`/`postToChat`):
  - `readMarker` (real existence-only read), `writeMarker` (real never-throws write), `eventName` (default `process.env.GITHUB_EVENT_NAME ?? ""`). The seam carries **no clock** — `now` stays the sole injected clock.
  - **Scheduled-only guard (D-04/D-05a):** the marker date key is derived **once** via `markerDateKey(now)` right after the weekday guard. If `eventName === "schedule"` AND `readMarker(dateKey).exists`, it logs `already posted <date> — skipping` and `return 0` **before** gather/render/post. A manual `workflow_dispatch` skips the guard and always posts.
  - **Post-success run log (D-05c/D-06/D-07/D-08):** strictly on the `posted.ok === true` path (after the existing `console.log("nightly check-in posted")`), it counts `notFullyBooked` (designers `underbooked`/`overbooked`), `missingBrief` (`g.briefFlags.length`), and `worthALook` (Σ item-array lengths over the reconciled record); sets `degraded = g.sourceErrors.length > 0`, `sourcesReached` from each source's error count, `rendererUsed` from `USE_LLM_RENDERER`, and `postOutcome: "ok"`. It builds the `RunLog` via `buildRunLog`, prints it as one JSON object to stdout, then calls `writeMarker`. A `{ ok:false }` result triggers a loud `console.warn` and **still returns 0** (D-07-fail).
  - The `!posted.ok` exit-1 branch is **byte-untouched** — it still returns 1 and never builds or writes a marker (D-05 two-path rule).

- **`src/__tests__/runNightly.test.ts`** — a new describe block (`idempotency + run log`) with a `makeMarkerStub` helper (records read/write calls, configurable existence + write Result) over the existing `stubGatherResult`/`stubCalendarResult`/`makePostStub`/fixed `NOW` harness. Six cases:
  - (a) scheduled + marker → POST count 0, return 0; (b) scheduled + no marker → POST once, marker written with `posted===true` and `date===markerDateKey(NOW)`; (c) manual + marker → still posts once; (d) post fails → writeMarker count 0, return 1; (e) degraded post → marker written with `degraded===true`/`posted===true`; (f) `writeMarker {ok:false}` → return 0, captured log still `posted===true`. Fully offline (nothing real touched).

- **`.github/workflows/nightly.yml`** — `permissions: contents: write` scoped to the `checkin` **job** (T-07-04, minimal token scope); a new `Commit run-log marker` step stages `.runs/`, no-ops via `git diff --cached --quiet` when there is nothing to commit, else configures the `github-actions[bot]` identity, commits with `chore: record nightly run-log marker [skip ci]` (T-07-05, no self-retrigger), and pushes. Cron/dispatch triggers and the `env` block are unchanged; `.runs/` is **not** gitignored.

- **`.planning/REQUIREMENTS.md`** — the single REL-03 traceability row changed `Phase 6 | Pending` → `Phase 7 | Complete`, and the REL-03 checklist item ticked `[x]`. No other row touched.

## Verification Evidence

- `npx tsc --noEmit` → clean.
- `node --import tsx --test "src/__tests__/runNightly.test.ts"` → 15 pass (9 existing + 6 new), 0 fail.
- `npm test` (full suite) → **334 pass, 0 fail** (was 328 in Wave 1).
- Two-path read: the `if (!posted.ok)` block is unchanged (`console.error` + `return 1`, no marker call inside).
- `grep "contents: write"` and `grep "skip ci"` in `nightly.yml` both match; `git diff --cached --quiet` guard present; `.runs/` not in `.gitignore`.
- `grep "REL-03 | Phase 7" .planning/REQUIREMENTS.md` matches; REL-01/REL-02 rows unchanged.

## Threat Mitigations Applied

- **T-07-04 (EoP)** — `contents: write` declared at the `checkin` **job** level only, keeping the `GITHUB_TOKEN` scope minimal; no other permission granted.
- **T-07-05 (Tampering / runaway)** — the marker commit message carries `[skip ci]`; triggers untouched, so the commit cannot start a new run.
- **T-07-06 (Info Disclosure)** — only counts/booleans/date/enum + the literal `"ok"` reach `buildRunLog`/`console.*`; the webhook URL and any secret are never passed in (inherits Plan 01 redaction).
- **T-07-07 (DoS / false alert)** — D-07-fail: a `writeMarker` failure after a good post warns loudly and returns 0, so a persist hiccup never fires GitHub's failed-run email.

## Deviations from Plan

### Notes (no deviation caused by this plan)

**1. `grep -c "DateTime.now(" src/index.ts` returns 2, not 1 — pre-existing, not introduced here.**
- The acceptance criterion expects the grep to return 1. Both hits exist on `HEAD` before this plan: one is the **actual** clock call at the entrypoint (`runNightly(DateTime.now()…)`); the other is a **doc comment** in the `RunNightlyDeps` header ("the sole DateTime.now() read") that predates this work.
- My change introduced **neither** hit and added no new clock read — the marker date key derives only from the injected `now` via `markerDateKey(now)`. The single-clock invariant (one real clock read, at the entrypoint) holds exactly. The grep gate is a literal-substring false-positive on the comment; no code change was made to "satisfy" it (scope discipline — the comment is unrelated to this plan's edits).

No functional deviations — the implementation matches the plan and all of D-03/D-04/D-05/D-06/D-07-fail/D-08.

## Self-Check: PASSED

- Files: `src/index.ts`, `src/__tests__/runNightly.test.ts`, `.github/workflows/nightly.yml`, `.planning/REQUIREMENTS.md`, `.planning/phases/07-hardening/07-02-SUMMARY.md` all present.
- Commits: `886a885` (feat — Task 1), `c555e2c` (test — Task 2), `405ff99` (chore — Task 3) all in history.
