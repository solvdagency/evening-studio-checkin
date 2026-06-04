---
phase: 07-hardening
plan: 01
subsystem: run/idempotency
tags: [idempotency, run-log, redaction, dependency-injection, tdd]
requires:
  - "src/domain/types.ts (STUDIO_ZONE)"
provides:
  - "RunLog type"
  - "markerDateKey(now) — studio-local date key from injected now"
  - "markerPath(dateKey) — .runs/<date>.json"
  - "readMarker(dateKey, fs?) — existence-only idempotency read"
  - "writeMarker(runLog, fs?) — Result-shaped, never-throws persist"
  - "buildRunLog(args) — redacted run-log builder"
  - "MarkerFs — injectable fs seam (default real node:fs)"
affects:
  - "Plan 07-02 (wires these primitives into runNightly via RunNightlyDeps)"
tech-stack:
  added: []
  patterns:
    - "Injectable fs seam mirroring RunNightlyDeps default-to-real DI"
    - "Result-shaped never-throw write (D-07-fail)"
    - "Single-clock date derivation from injected now (D-03)"
key-files:
  created:
    - "src/run/marker.ts"
    - "src/run/__tests__/marker.test.ts"
  modified: []
decisions:
  - "fs seam shape: MarkerFs { exists(path), write(path, contents) } — minimal two-member interface, defaults to a thin node:fs impl (existsSync + mkdirSync recursive + writeFileSync)"
  - "RunLog.postOutcome typed as `\"ok\" | string` — caller passes an already-redacted reason; buildRunLog never receives or echoes a secret"
metrics:
  duration_min: 2
  completed: "2026-06-04"
  tasks: 2
  files: 2
---

# Phase 7 Plan 01: Marker / Run-Log Module Summary

Self-contained, dependency-injected idempotency-marker / structured-run-log module: one `.runs/<studio-local-date>.json` file is both the "already posted tonight?" signal (its existence) and the inspectable run log (its contents), with a never-throws write and a redaction-safe builder — fully unit-tested over an in-memory fs, no real disk, ready for Plan 02 to wire into `runNightly`.

## What Was Built

- **`src/run/marker.ts`** — exports `RunLog`, `markerDateKey`, `markerPath`, `readMarker`, `writeMarker`, `buildRunLog`, and the `MarkerFs` seam.
  - `markerDateKey(now)` re-zones the **injected** `now` to `STUDIO_ZONE` and formats `yyyy-MM-dd` — the single source of the date, no live clock read (D-03).
  - `markerPath(dateKey)` → `.runs/<date>.json` (D-01: one file = marker + log).
  - `readMarker` reports `{ exists }` only — existence is the sole idempotency signal; contents are never parsed for the guard.
  - `writeMarker` serialises pretty (2-space) JSON via the seam and returns `{ ok:true } | { ok:false, error }`; an fs that throws is caught, never propagated (D-07-fail).
  - `buildRunLog` shapes `{ date, posted, degraded, sourcesReached, flagsRaised, rendererUsed, postOutcome }` and never adds/echoes a secret — the caller passes an already-redacted `postOutcome` (D-08).
  - `MarkerFs` defaults to a real `node:fs` impl (recursive `mkdirSync` before write so the first-ever marker doesn't fail on a missing `.runs/`); tests inject an in-memory stub.

- **`src/run/__tests__/marker.test.ts`** — 9 `node:test` cases, fully offline: date-key derivation (incl. a UTC-late→next-Sydney-day case proving the zone conversion), path suffix, read/write round-trip via the stub's captured calls, the write-throws→`{ok:false}` never-throw path, the exact field-key set, and the three redaction substring asserts (`chat.googleapis.com`, `GOOGLE_SA_KEY`, `sk-ant-`).

## TDD Cycle

- **RED** (`19ede48`, `test(07-01)`): contract written first against the not-yet-existing `../marker.ts`; suite failed on the missing module (RED-OK confirmed).
- **GREEN** (`94cfb23`, `feat(07-01)`): `marker.ts` implemented to the contract; all 9 cases pass, `tsc --noEmit` clean, full suite 328 green.
- **REFACTOR**: none needed — implementation is minimal.

## Verification Evidence

- `node --import tsx --test "src/run/__tests__/marker.test.ts"` → 9 pass, 0 fail.
- `npx tsc --noEmit` → clean.
- `npm test` (full suite) → 328 pass, 0 fail.
- `grep -n "DateTime.now(" src/run/marker.ts` → 0 (single-clock gate, T-07-02).
- `grep -nE "GOOGLE_SA_KEY|sk-ant-|GCHAT_WEBHOOK_URL" src/run/marker.ts` → 0 (module never names a secret).

## Threat Mitigations Applied

- **T-07-01 (Info Disclosure)** — RunLog carries only counts/booleans/date/enum + a pre-redacted reason; redaction asserted via JSON.stringify substring checks.
- **T-07-02 (Tampering, clock)** — date key derives only from the injected `now`; `DateTime.now(` grep gate passes (0 hits).
- **T-07-03 (DoS, self-inflicted missed night)** — `writeMarker` is Result-shaped and never throws; the write-throws test proves it.
- **T-07-SC** — no new dependencies (luxon + node:fs only, both already present).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded two doc comments to satisfy the `DateTime.now(` grep gate**
- **Found during:** Task 2 GREEN verification.
- **Issue:** Two explanatory comments contained the literal substring `DateTime.now()`, which the plan's hard acceptance gate (`grep -n "DateTime.now(" src/run/marker.ts` returns 0) would flag even though no such call exists.
- **Fix:** Replaced the phrases with "live system-clock read" / "live system clock" — same meaning, no banned substring.
- **Files modified:** `src/run/marker.ts`
- **Commit:** `94cfb23` (folded into the GREEN commit before it was made).

No other deviations — the contract and implementation match the plan.

## Notes / Follow-up

- The module is intentionally NOT wired into `runNightly` yet — `src/index.ts` is untouched (Plan 07-02 / Wave 2 owns the integration: scheduled-only guard, post-success write, stdout emit, and the nightly.yml commit+push step).
- `MarkerFs` deliberately matches the `RunNightlyDeps` default-to-real shape so Plan 02 can inject `readMarker`/`writeMarker` the same way `gather`/`postToChat` are injected.

## Self-Check: PASSED

- Files: `src/run/marker.ts`, `src/run/__tests__/marker.test.ts`, `.planning/phases/07-hardening/07-01-SUMMARY.md` all present.
- Commits: `19ede48` (RED test), `94cfb23` (GREEN feat) both in history.
