---
phase: 07-hardening
verified: 2026-06-04T00:00:00Z
status: passed
score: 2/2 must-haves verified
overrides_applied: 0
---

# Phase 7: Hardening — Verification Report

**Phase Goal:** The unattended automation is durable over time — it never double-posts and every run leaves a structured, inspectable trace — so a stable repo keeps delivering a trustworthy nightly nudge.
**Verified:** 2026-06-04
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Re-running the check for the same evening does not produce a duplicate post (idempotency via a dated marker) | VERIFIED | `src/index.ts:279` — `if (resolvedDeps.eventName === "schedule" && resolvedDeps.readMarker(dateKey).exists) { return 0 }` before any gather/render/POST. Tested by `runNightly.test.ts` cases (a), (b), (c), (d). |
| 2 | Each run leaves a structured log (sources reached, flags raised, renderer used, post outcome) that a human can inspect after the fact | VERIFIED | `src/run/marker.ts` exports `RunLog` type + `buildRunLog`/`writeMarker`. `src/index.ts:377–404` assembles and writes to `.runs/<date>.json` after every `posted.ok`. Live example at `.runs/2026-06-03.json`. Log also printed to stdout (`index.ts:396`). |

**Score:** 2/2 truths verified

---

## Locked Decision Check

### D-03: Marker date derives from injected `now` — no fresh clock read

**VERIFIED.**

- `grep "DateTime.now(" src/run/marker.ts` → **0 hits** (no clock read in the marker module).
- `grep "DateTime.now(" src/index.ts` → **2 hits**: one at `index.ts:416` (the intentional entrypoint clock read: `runNightly(DateTime.now().setZone(STUDIO_ZONE))`), and one at `index.ts:192` (a doc comment: "the sole DateTime.now() read").
- The second hit is a doc comment, not executable code. No new clock read was introduced by Phase 7. The single-clock invariant holds exactly.
- `markerDateKey(now)` at `index.ts:278` derives the date key from the already-injected `now` passed to `runNightly`, then passes it through `marker.ts`'s `markerDateKey` which only calls `.setZone(STUDIO_ZONE).toFormat(...)` on the argument — confirmed at `marker.ts:105`.

### D-04: Guard engages only on `GITHUB_EVENT_NAME === "schedule"`; manual dispatch always posts

**VERIFIED.**

- `index.ts:279`: `if (resolvedDeps.eventName === "schedule" && resolvedDeps.readMarker(dateKey).exists)`
- The `eventName` field defaults to `process.env.GITHUB_EVENT_NAME ?? ""` at `index.ts:263`.
- `RunNightlyDeps` JSDoc at `index.ts:228–231` documents the "manual `workflow_dispatch` always posts" rule.
- `runNightly.test.ts` case (c): `eventName: "workflow_dispatch"` with `marker.exists: true` → post still happens, `post.calls.length === 1`. PASS.

### D-05: Marker written only on `posted.ok` path; never on exit-1 POST-failure branch

**VERIFIED.**

- `index.ts:355–358`: `if (!posted.ok) { console.error(...); return 1; }` — exits before any marker code.
- `index.ts:363` comment explicitly states "the `!posted.ok` exit-1 branch above never reaches here and NEVER writes a marker."
- `index.ts:397`: `resolvedDeps.writeMarker(runLog)` is called only after the `!posted.ok` early return.
- `runNightly.test.ts` case (d): post fails → `marker.writeCalls.length === 0`. PASS.

### D-06: Degraded post still writes the marker

**VERIFIED.**

- `index.ts:381`: `degraded: g.sourceErrors.length > 0` — a degraded run still calls `writeMarker` because it is still on the `posted.ok === true` path.
- `runNightly.test.ts` case (e): Productive sourceError → `marker.writeCalls.length === 1`, `writeCalls[0].degraded === true`, `writeCalls[0].posted === true`. PASS.

### D-07-fail: Marker-write failure after a good post → warn + return 0

**VERIFIED.**

- `index.ts:398–403`: `if (!marked.ok) { console.warn(...); }` — falls through to `return 0`.
- `runNightly.test.ts` case (f): `writeResult: { ok: false, error: "EACCES: permission denied" }` → `code === 0`, `post.calls.length === 1`. PASS.

### D-08: No secrets (webhook URL, GOOGLE_SA_KEY, tokens) in run-log JSON / marker file

**VERIFIED.**

- `grep "GOOGLE_SA_KEY\|GCHAT_WEBHOOK_URL\|sk-ant-" src/run/marker.ts` → **0 hits**.
- `buildRunLog` at `index.ts:377–392` passes only counts/booleans/date/enum and the literal string `"ok"` as `postOutcome`. No secrets are in scope at the call site.
- `marker.test.ts` lines 166–185: `buildRunLog` redaction test asserts `!json.includes("chat.googleapis.com")`, `!json.includes("GOOGLE_SA_KEY")`, `!json.includes("sk-ant-")`. PASS.
- Live example `.runs/2026-06-03.json` confirmed: contains only `date`, `posted`, `degraded`, `sourcesReached`, `flagsRaised`, `rendererUsed`, `postOutcome`. No secrets.

### nightly.yml: contents:write job-scoped; [skip ci] on marker commit; nothing-to-commit guard

**VERIFIED.**

- `nightly.yml:20–21`: `permissions: contents: write` is declared under the `checkin:` job block, not at workflow level (confirmed by line 14 `jobs:` → line 15 `checkin:` → line 20 `permissions:`).
- `nightly.yml:50`: commit message `"chore: record nightly run-log marker [skip ci]"` — `[skip ci]` present.
- `nightly.yml:44–46`: `if git diff --cached --quiet; then echo "no marker change..." ; exit 0; fi` — nothing-to-commit guard prevents failure on manual runs.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/run/marker.ts` | Idempotency marker + run-log module | VERIFIED | 165 lines, exports `RunLog`, `MarkerFs`, `markerDateKey`, `markerPath`, `readMarker`, `writeMarker`, `buildRunLog` |
| `src/run/__tests__/marker.test.ts` | 9 unit tests for marker module | VERIFIED | 9 tests covering date-key, path, read/write, never-throw, field-shape, redaction |
| `src/index.ts` (modified) | Guard + post-success write wired into `runNightly` | VERIFIED | `RunNightlyDeps` extended with `readMarker`/`writeMarker`/`eventName`; guard at line 279; write at lines 397–403 |
| `src/__tests__/runNightly.test.ts` (modified) | 6 idempotency integration tests | VERIFIED | `makeMarkerStub` helper + 6 cases (a)–(f) covering all decision paths |
| `.github/workflows/nightly.yml` (modified) | `contents: write` + marker commit step | VERIFIED | Job-scoped permission, `[skip ci]` commit, `git diff --cached --quiet` guard |
| `.runs/2026-06-03.json` | Live marker file on disk | VERIFIED | Present; correct shape; no secrets; `degraded: true` reflects a real prior run |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `runNightly` | `readMarker` | `resolvedDeps.readMarker(dateKey)` at `index.ts:279` | WIRED | Guard reads existence before gather/render/post |
| `runNightly` | `writeMarker` | `resolvedDeps.writeMarker(runLog)` at `index.ts:397` | WIRED | Called strictly after `posted.ok` |
| `runNightly` | `markerDateKey` | `markerDateKey(now)` at `index.ts:278` | WIRED | Single call, injected `now`, no new clock |
| `runNightly` | `buildRunLog` | `buildRunLog({...})` at `index.ts:377` | WIRED | Assembled from already-computed counts only |
| `nightly.yml` | `.runs/` | `git add .runs/` → conditional commit + push | WIRED | Commit step is present and guarded |
| `eventName` env | idempotency guard | `process.env.GITHUB_EVENT_NAME` at `index.ts:263` | WIRED | Default read from env; test-injectable |

---

## Data-Flow Trace (Level 4)

The run-log JSON written to `.runs/<date>.json` is populated only from already-computed in-memory values at the call site:

| Field | Source | Real Data | Status |
|-------|--------|-----------|--------|
| `date` | `markerDateKey(now)` — injected `now` converted to STUDIO_ZONE | Deterministic from injected clock | FLOWING |
| `posted` | Hardcoded `true` (only reached on `posted.ok`) | Boolean, always correct on this path | FLOWING |
| `degraded` | `g.sourceErrors.length > 0` — live gather result | Real sourceErrors array from productive gather | FLOWING |
| `sourcesReached.productive` | `g.sourceErrors.length === 0` | Same live gather result | FLOWING |
| `sourcesReached.calendar` | `cal.sourceErrors.length === 0` | Live calendar gather result | FLOWING |
| `flagsRaised.notFullyBooked` | `report.designers.filter(...)` | Live computeStudioReport output | FLOWING |
| `flagsRaised.missingBrief` | `g.briefFlags.length` | Live gather briefFlags | FLOWING |
| `flagsRaised.worthALook` | `Object.values(worthALook).reduce(...)` | Live reconcileMeetings output | FLOWING |
| `rendererUsed` | `process.env.USE_LLM_RENDERER === "true" ? "llm" : "template"` | Env flag, deterministic | FLOWING |
| `postOutcome` | Literal `"ok"` | Correct: only written on success path | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Evidence | Status |
|----------|----------|--------|
| Scheduled run with existing marker skips POST | `runNightly.test.ts` case (a): `post.calls.length === 0` when `eventName: "schedule"` and `marker.exists: true` | PASS |
| First scheduled run POSTs and writes marker | `runNightly.test.ts` case (b): `post.calls.length === 1`, `marker.writeCalls.length === 1` | PASS |
| Manual run always POSTs even with marker present | `runNightly.test.ts` case (c): `eventName: "workflow_dispatch"`, `marker.exists: true`, `post.calls.length === 1` | PASS |
| POST failure → no marker written, return 1 | `runNightly.test.ts` case (d): `marker.writeCalls.length === 0`, `code === 1` | PASS |
| Degraded post writes marker with `degraded: true` | `runNightly.test.ts` case (e): `writeCalls[0].degraded === true`, `writeCalls[0].posted === true` | PASS |
| Marker-write failure after good post → return 0 | `runNightly.test.ts` case (f): `code === 0` with `writeResult: { ok: false, ... }` | PASS |
| Live marker file exists on disk with correct shape | `.runs/2026-06-03.json`: all 7 expected fields, no secrets | PASS |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| REL-03 | The check avoids duplicate posts for the same evening (idempotency) | SATISFIED | `index.ts:279` guard + 6-test suite covering all paths; `REQUIREMENTS.md` row updated to `Phase 7 \| Complete` |

---

## Anti-Patterns Found

Scanned `src/run/marker.ts`, `src/index.ts`, `src/__tests__/runNightly.test.ts`, `.github/workflows/nightly.yml`.

| File | Pattern | Severity | Finding |
|------|---------|----------|---------|
| None | — | — | No TBD/FIXME/XXX markers, no stub returns, no placeholder copy found in Phase 7 modified files |

---

## Test Results

- `npm test` (full suite): **334 pass, 0 fail, 0 skip** (334 = 328 pre-Phase-7 + 6 new idempotency cases)
- `npx tsc --noEmit`: **clean** (no output, exit 0)
- Marker-module isolated run: **9 pass** (as verified in the full suite output)
- Idempotency integration suite: **6 pass** (labeled (a)–(f) in `runNightly.test.ts`)

---

## Human Verification Required

None. All Phase 7 behaviors are fully unit-testable (injectable seam + offline stubs). No visual, real-time, or external-service assertions are needed for idempotency or structured logging.

---

## Verdict

**Phase 7 goal: ACHIEVED.**

Both success criteria are verified in the actual codebase, not just claimed. The idempotency guard is wired, gate-tested with 6 cases covering every decision path (D-04/D-05/D-06/D-07-fail/D-08), and backed by a live marker file on disk. The structured run log carries all required fields (sources reached, flags raised, renderer used, post outcome), is printed to stdout and committed to `.runs/`, and is confirmed secret-free. The nightly workflow commit step is job-scoped, carries `[skip ci]`, and is guarded against no-op failures. Type-checking and the full test suite are both clean.

---

_Verified: 2026-06-04_
_Verifier: Claude (gsd-verifier)_
