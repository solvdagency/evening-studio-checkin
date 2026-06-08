---
status: resolved
trigger: "Nightly evening check-in posted to Google Chat at 8:34pm on Friday instead of the scheduled 4:30pm — roughly a 4-hour delay. It correctly detected that Monday was a public holiday. Need to find why the post was ~4 hours late. Prime suspect: GitHub Actions scheduled-workflow cron delay (best-effort queueing under load), but confirm against the workflow run logs / timestamps before concluding."
created: 2026-06-08
updated: 2026-06-08
---

# Debug: nightly-post-4h-late

## Symptoms

- **Expected:** Check-in posts to Google Chat at ~4:30pm Sydney time on weekdays.
- **Actual:** On Fri 2026-06-05 it posted at ~8:34pm Sydney (~4h late). Message content was correct (correctly detected Monday public holiday).
- **Error messages:** None — both scheduled runs succeeded (conclusion: success).
- **Timeline:** Workflow is days old (Phase 4 went live ~2026-06-04). Only TWO scheduled runs have ever occurred.
- **Reproduction:** Occurs on the GitHub Actions `schedule:` trigger; not reproducible via `workflow_dispatch` (manual fires immediately).

## Current Focus

- hypothesis: CONFIRMED — GitHub Actions `schedule:` trigger delayed the run by ~4h. The cron timezone config is correct (Sydney honored → 06:30 UTC), and GitHub's best-effort scheduler started the run ~4h late.
- next_action: Root cause confirmed. Mitigation options presented to user; awaiting fix choice.
- reasoning_checkpoint: A run cannot start before its scheduled trigger. Observed start 10:30 UTC rules out UTC-interpreted 16:30 cron (impossible) and confirms Sydney-honored 06:30 trigger + ~4h delay.

## Evidence

- timestamp: 2026-06-08 — `.github/workflows/nightly.yml` cron is `30 16 * * 1-5` with `timezone: "Australia/Sydney"`. June = AEST (UTC+10, no DST) → intended 06:30 UTC.
- timestamp: 2026-06-08 — `gh run list` scheduled runs:
  - Fri 2026-06-05: createdAt = startedAt = `10:33:53Z`, updatedAt `10:34:15Z` (22s runtime), success. 10:33 UTC = 20:33 Sydney = 8:33pm → matches reported 8:34pm post.
  - Thu 2026-06-04: createdAt = startedAt = `10:27:18Z`, success. 10:27 UTC = 20:27 Sydney = 8:27pm. ALSO ~4h late.
- timestamp: 2026-06-08 — `createdAt == startedAt` on both runs → no internal sleep/retry in the job; the lateness is entirely in GitHub triggering the scheduled event late.
- timestamp: 2026-06-08 — Only 2 scheduled runs exist (n=2). Both landed ~10:30 UTC. Consistency is suspicious for pure load jitter; flag for the debugger to weigh.
- timestamp: 2026-06-08 — `node --import tsx src/index.ts` runs once and exits; the composition root carries a luxon weekday guard (SCHED-01) as defence-in-depth. No sleep/wait in the job steps.
- timestamp: 2026-06-08 — Idempotency marker design confirmed (`src/run/marker.ts`): one committed `.runs/<studio-local-date>.json` whose EXISTENCE is the "already posted today?" signal, keyed by studio-local date from injected `now` (D-03, single clock). This means running the cron MORE frequently is safe: a second fire on the same calendar day reads the marker and no-ops. No double-post risk. This is the load-bearing fact for mitigation option (c).
- timestamp: 2026-06-08 — Assessment of the n=2 "both ~10:30 UTC" open question: the cluster is the EXPECTED signature of systematic queue deprioritization, not random jitter. GitHub queues all scheduled events on a shared, high-contention pipeline and deprioritizes low-activity repos; the `:30` cron minute is one of the two busiest minutes (`:00`/`:30`) so it competes with the largest backlog. Both facts compound. (Note: WebSearch unavailable in this session; conclusion rests on documented GitHub behavior + the explicit CLAUDE.md note "GitHub scheduled workflows can be delayed under load.")

## Eliminated

- hypothesis: Timezone field ignored / cron interpreted as UTC (16:30 UTC).
  reason: A run cannot start before its scheduled time. Observed start 10:30 UTC < 16:30 UTC → impossible. So timezone IS honored; trigger was 06:30 UTC.
- hypothesis: Job itself runs slow / sleeps for 4h.
  reason: Runtime was 22s (createdAt→updatedAt); createdAt == startedAt. The delay is pre-job (GitHub scheduler), not in our code.
- hypothesis: A code-level (TypeScript/runtime) bug in the job.
  reason: The job ran correctly in 22s and posted the right content. There is no language-level defect; this is purely a CI scheduling / infrastructure issue. No language specialist applies.

## Resolution

- root_cause: The nightly post relies on GitHub Actions' `schedule:` cron, which GitHub runs on a best-effort basis and heavily deprioritizes for low-activity repos — delays of several hours are common and were observed here (~4h on both runs). The congested `:30` cron minute compounds the queue contention. The timezone field IS honored correctly (trigger fires at 06:30 UTC); the lateness is entirely in GitHub's scheduler, not in the code or config.
- fix: APPLIED (FINAL design, user approved 2026-06-08, after THREE adversarial eval workflows). Earlier attempts superseded: (1) extra cron fires — reverted (n=3 proves systematic delay); (2) bespoke Cloudflare Worker — built then DELETED (fatal flaw: heartbeat shared the Worker's fate with the trigger = self-monitoring anti-pattern; also over-built). New evidence: 3rd scheduled run 2026-06-08 11:27Z = 9:27pm Sydney (~5h late). FINAL: STAY on GitHub Actions, remove `schedule:` cron (kept workflow_dispatch + concurrency + marker step), and add two free no-credit-card services — cron-job.org (triggers via workflow_dispatch API at 4:30pm Sydney, named-timezone DST) + healthchecks.io (INDEPENDENT push dead-man's switch: workflow pings on success; no ping → email). Code change: ONE `if: success()` curl ping step appended to nightly.yml. No src/ change. Host-migration (Cloud Run/Lambda/etc.) evaluated + rejected: not simpler (still needs external watchdog), mandates a credit card, touches trust-critical code; Cloud Run documented as future path only.
- verification: nightly.yml parses (only workflow_dispatch trigger; ping step last with if:success()); full app suite green 290/290 (no src change). Ping step self-skips until HEALTHCHECK_PING_URL secret is set, so it can't break a pre-setup run. NOTE: marker DOES persist in prod (origin/main 1f4dc5c) — earlier eval "never persisted" claim was a stale-clone artifact; corrected.
- files_changed: .github/workflows/nightly.yml (cron removed + ping step added); scheduler/README.md (rewritten as no-code runbook). Deleted: scheduler/worker.js, wrangler.toml, package.json (the rejected Worker).
- residual_risk: PAT lives in cron-job.org (no-SLA free service) — bounded (repo-scoped, Actions only); rotate on a reminder. cron-job.org + healthchecks.io are independent free vendors (swappable). Pending USER steps (web only, no card): healthchecks.io check + alert + HEALTHCHECK_PING_URL secret; cron-job.org job; fine-grained PAT — all per scheduler/README.md.
- follow_up: NEW issue surfaced — the trigger/run fires on PUBLIC HOLIDAYS (cron was Mon-Fri; code only skips weekends, not holidays; the Worker is also holiday-unaware). The 2026-06-08 holiday got a (late) post. Decide whether to suppress posting entirely on studio holidays. Not addressed in this fix.
