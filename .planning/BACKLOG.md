# Backlog — tasks to come back to

## 1. Suppress posting on public holidays (and study days off)

**Status:** Open · noted 2026-06-09 · related to debug `nightly-post-4h-late`

**Problem:** The nightly run posts even on public holidays. Confirmed live: the
2026-06-08 public holiday (Monday) still got a check-in (it fired ~9:27pm via the
old late cron). The trigger (now cron-job.org) and the run are holiday-unaware —
the code only skips **weekends** (`shouldSkipForWeekend`, src/index.ts), not
public holidays / studio closures. The *content* is holiday-aware (it looks ahead
to the next working day), but it still **posts**.

**Desired behaviour (to confirm before building):**
- Skip posting entirely when **today** (the run date) is a non-working day —
  weekend OR public holiday OR studio closure.
- STILL post on the working day *before* a holiday (e.g. Friday before a Monday
  holiday correctly looks ahead to Tuesday — this already works and is wanted).

**Implementation notes / unknowns:**
- Likely extend the early skip-guard from `shouldSkipForWeekend(now)` to also skip
  when `now`'s date is in the public-holiday set / `STUDIO_CLOSURES`.
- CHECK FIRST: where the public-holiday data is available in the pipeline, and
  whether it's known *before* the early guard runs or only *after* the
  Productive/Calendar fetch. That ordering decides how clean the change is.
- This touches trust-critical deterministic code — do it via a proper GSD pass
  (spec → discuss → plan → execute) with tests, not a blind edit.
- Composes cleanly with the healthchecks.io watchdog: a deliberate holiday-skip
  still exits 0 → the workflow still pings → no false "missed night" alert.

**Out of scope of the SCHED-04 trigger fix; logged here so it isn't lost.**
