---
phase: quick-260604-kig
plan: 01
subsystem: calendar-reconciliation + composition-root
tags: [testing, di-seam, REL-01, REL-02, MEET-04]
requires:
  - reconcileMeetings (src/calendar/reconcile.ts)
  - renderTemplate (src/render/renderMessage.ts)
  - runNightly (src/index.ts)
provides:
  - e2e reconcile→render worth-a-look coverage
  - runNightly three-path orchestration coverage
  - runNightly(now, deps?) DI seam
affects:
  - src/index.ts (the composition root)
tech-stack:
  added: []
  patterns:
    - "optional-deps DI seam (Partial<RunNightlyDeps>) with real-implementation defaults"
    - "golden-fixture-driven offline integration test (no network/env/clock-2)"
key-files:
  created:
    - src/calendar/__tests__/reconcile-render.e2e.test.ts
    - src/__tests__/runNightly.test.ts
  modified:
    - src/index.ts
decisions:
  - "DI seam carries NO clock — `now` stays the single injected clock; entrypoint keeps the sole DateTime.now()"
  - "Reused the WORTH golden fixture for both tests instead of adding a new fixture"
metrics:
  duration: ~12 min
  completed: 2026-06-04
  tasks: 2
  files: 3
---

# Phase quick-260604-kig Plan 01: End-to-end calendar render + runNightly DI summary

Added the two coverage tests Liam selected after Phase 04 verification — a real
end-to-end reconcile→render proof of the 📅 worth-a-look line and a three-path
runNightly orchestration test — backed by one surgical DI seam in `src/index.ts`.

## What was built

### Task 1 — e2e reconcile→render worth-a-look test (no production change)
`src/calendar/__tests__/reconcile-render.e2e.test.ts` drives the two committed
golden FDC events through the REAL `reconcileMeetings` (real `CLIENT_ALIAS_MAP` +
`MEETING_IGNORE_LIST`) and feeds the actual reconciler output into the real
`renderTemplate` via `RenderContext`:
- WORTH ("FDC IPO Launch Check-In", FDC NOT booked) → one worth-a-look item →
  rendered as a 📅 deep-linked (`<a href="…">FDC IPO Launch Check-In</a>`) "worth a
  look" sub-line under Liam; asserts the payload never contains "conflict".
- COVERED ("Quick FDC catch up", FDC booked same day) → empty reconcile output →
  no 📅 line for Liam.

### Task 2 — runNightly DI seam + orchestration integration test
Production change (the only one): `runNightly(now, deps?)` in `src/index.ts` now
takes an optional `Partial<RunNightlyDeps>` ({ gather, gatherCalendar, postToChat,
webhookUrl }), each resolved to the real implementation / `process.env.GCHAT_WEBHOOK_URL`
at the top of the function body. The three call sites were swapped to the resolved
deps. The `import.meta.main` entrypoint is unchanged (still `runNightly(now)` with no
deps and the sole `DateTime.now()` read). No clock in the seam, no hour math added.

`src/__tests__/runNightly.test.ts` exercises all three paths over fully stubbed
deps + a fixed weekday `now` (Wed 3 Jun 2026, asserted weekday ≤ 5):
- (a) happy — all sources succeed; the unaccounted WORTH meeting surfaces through
  the unstubbed reconcile→render and appears as a 📅 line in the captured payload;
  returns 0; the injected webhook (not env) is used.
- (b) degrade — a calendar `sourceError` still posts the 🤖 degraded card and
  returns 0 (REL-01 — never silently skip a night).
- (c) post-fail — `postToChat { ok:false }` returns 1 (REL-02 — GitHub failure email).

The test touches NO network, Google, Productive, or `process.env`; the webhook is a
fake `https://stub.invalid/webhook` the capturing stub never sends.

## Verification

- `node --import tsx --test src/calendar/__tests__/reconcile-render.e2e.test.ts` → 2 pass.
- `node --import tsx --test src/__tests__/runNightly.test.ts` → 4 pass.
- `npm test` → 221 pass / 0 fail (was 215; +6, exceeds the ≥217 target).
- `git diff --stat` (before commits) showed ONLY `src/index.ts` among production files.
- `import.meta.main` still calls `runNightly(DateTime.now().setZone(STUDIO_ZONE))` with no deps.
- Exactly one real `DateTime.now()` in `src/index.ts` (the entrypoint) — no second clock read.

## Deviations from Plan

None — plan executed exactly as written. Both tasks done; the single sanctioned
production change (the DI seam) was made surgically, with no refactor/rename of
`buildRenderContext`, `subtitleFor`, `shouldSkipForWeekend`, docblocks, or imports
beyond adding the `RunNightlyDeps` type.

## Known Stubs

None. The DI seam is a production test seam (defaults to the real implementations);
the stubs live only inside the test files.

## Notes / out-of-scope (untouched)

`npx tsc --noEmit` reports PRE-EXISTING `TS7053` errors in `src/calendar/__tests__/gather.test.ts`
and `src/productive/__tests__/gather.test.ts` (the `Record<DesignerId, …>` string-index
pattern). These are unrelated to this plan, were present before it, and are out of scope
(scope discipline). My two new test files and `src/index.ts` produce ZERO tsc errors.
The project's gate is `npm test` (green), not `tsc --noEmit`. Logged here for a second look.

## Self-Check: PASSED
- src/calendar/__tests__/reconcile-render.e2e.test.ts — FOUND
- src/__tests__/runNightly.test.ts — FOUND
- src/index.ts (modified) — FOUND
- commit 1b0daa0 (test, Task 1) — FOUND
- commit dd4fcb0 (feat, Task 2) — FOUND
