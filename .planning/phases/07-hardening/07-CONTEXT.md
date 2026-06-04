# Phase 7: Hardening - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The unattended automation becomes durable over time: it never double-posts for
the same evening, and every run leaves a structured, inspectable trace of what it
did. Scope is **idempotency (REL-03)** + **structured run logging**. No new data
sources, no message-content changes, no new flags — this phase hardens the
existing nightly run, it does not extend what the message says.

**In scope:**
- A dated idempotency marker so a re-run for the same evening does not double-post.
- A structured run log (sources reached, flags raised, renderer used, post outcome)
  inspectable after the fact.

**Out of scope (own phases / already done):**
- REL-01 (degraded message on source failure) — already implemented in Phase 3/4.
- REL-02 (failed run surfaces a human-visible alert) — already implemented (exit-1
  POST-failure path fires GitHub's failed-run email).
- The deferred D-06 degrade-path refinement (per-designer 🤖 row vs whole-card
  degrade on availability-read failure) — logged separately, not this phase.
</domain>

<decisions>
## Implementation Decisions

### Idempotency marker storage
- **D-01:** The marker is a **committed JSON file** at `.runs/<studio-local-date>.json`
  (e.g. `.runs/2026-06-04.json`). The file's **existence** is the idempotency
  signal; the file's **contents** are the structured run log (see D-07). One
  artifact satisfies both REL-03 and the run-log criterion — no second mechanism.
- **D-02:** Chosen over GitHub Actions cache (evictable — too weak for a
  correctness-critical "never double-post" guarantee) and over a Gist/external KV
  (adds a credential to provision and maintain, against the near-zero-maintenance
  goal). The committed file is durable, free, version-controlled, and doubles as
  cross-night history.
- **D-03:** The marker key is the **studio-local calendar date of the injected
  `now`** (Australia/Sydney). This preserves the single-clock trust boundary —
  the marker date derives from the same injected `now` the report uses, never a
  fresh `DateTime.now()` or the runner's UTC clock.

### Manual vs scheduled run policy
- **D-04:** The idempotency guard engages **only for scheduled runs**
  (`process.env.GITHUB_EVENT_NAME === "schedule"`). A manual `workflow_dispatch`
  run **always posts** — it is a deliberate human action, and Liam uses manual
  dispatch to fire test runs (which go to the test space). This keeps same-evening
  re-testing friction-free. Accepted risk: a deliberate double-dispatch
  double-posts (self-inflicted, low stakes, test space).

### Marker write timing & failure handling
- **D-05:** **Post first, mark second.** Order within the run: (a) if scheduled
  AND today's marker exists → skip and exit 0; (b) otherwise run normally and POST;
  (c) write the marker **only after a confirmed successful post** (`posted.ok`).
  The marker is NEVER written on the POST-failure exit-1 path, so a re-run can
  recover a night that failed to send. This errs toward posting, never toward
  skipping — consistent with the project's cardinal rule "never silently skip a
  night." The rare failure mode is a double-post (annoying, safe), never a missed
  night.
- **D-06:** A **degraded card still counts as posted** — the marker is written
  for any `posted.ok === true`, including the 🤖 degraded variant. Degraded means
  "we posted something truthful," which is a completed evening.
- **D-07-fail:** If writing/persisting the marker fails **after** a successful
  post, the run **logs loudly (a visible warning) and exits 0**. The post
  succeeded — that is the primary job. A failed marker-persist must not produce a
  misleading "run failed" alert. If it recurs, the visible warning is the signal.

### Structured run log shape & destination
- **D-07:** A single JSON object is emitted to **both stdout** (so it appears in
  the Actions run log immediately, no fetch) **and** as the committed marker
  file's contents (durable history). Fields (final shape to be settled in
  planning, but at minimum):
  `{ date, posted, degraded, sourcesReached, flagsRaised, rendererUsed, postOutcome }`
  — `sourcesReached` reflects which of Productive/Calendar succeeded;
  `flagsRaised` summarises the not-fully-booked / missing-brief / worth-a-look
  counts; `rendererUsed` is `template` | `llm`; `postOutcome` is `ok` |
  `failed:<redacted reason>`.
- **D-08:** The structured log MUST honour the existing redaction rules — never
  emit the webhook URL, the service-account key, or any secret into the JSON
  (threats T-03-09 / T-L0J-01). Only counts, booleans, and redacted reason
  strings.

### Claude's Discretion
- Exact JSON field names/nesting and the TS type for the run-log object.
- Whether the marker read/write goes through the existing dependency-injection
  seam (`RunNightlyDeps`) — strongly preferred for testability, mirroring how
  `gather`/`postToChat` are injected — vs a thin filesystem helper. Planner decides.
- The nightly.yml mechanics for committing+pushing the marker (commit step,
  `contents: write` permission, `[skip ci]` on the marker commit to avoid any
  loop). Keep it minimal.
- Whether to add a `.runs/` pruning/retention step later (not required now).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — REL-03 (idempotency). NOTE: the traceability table
  currently mis-maps REL-03 to "Phase 6"; the roadmap says Phase 7 — fix to Phase 7
  during this phase.
- `.planning/ROADMAP.md` §"Phase 7: Hardening" — goal + the two success criteria.

### Existing run flow (the integration surface)
- `src/index.ts` §`runNightly` (lines ~212–317) — the linear run: weekend guard →
  gather → computeStudioReport → gatherCalendar/reconcile → render → single POST →
  exit 0/1. The **two-path rule** lives here (source failure degrades+exits 0; POST
  failure exits 1). The idempotency check (early, scheduled-only) and the
  post-success marker write slot into this flow. The single clock boundary is
  `import.meta.main` calling `runNightly(DateTime.now()…)` — do not add clock reads.
- `src/index.ts` §`RunNightlyDeps` (lines ~188–205) — the DI seam to extend if the
  marker store is injected for testability.
- `.github/workflows/nightly.yml` — bare CI job (checkout → setup-node → npm ci →
  run). Needs `permissions: contents: write` + a commit+push step for the marker,
  and the run already has `GITHUB_EVENT_NAME` available to the node process.

### Trust/threat constraints
- `CLAUDE.md` (project) — "never silently skip a night", redaction rules, the
  LLM-never-does-arithmetic rule (not relevant to logging math, but the
  redaction discipline is).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RunNightlyDeps` dependency-injection pattern (`src/index.ts`): `gather`,
  `gatherCalendar`, `postToChat`, `webhookUrl`, `renderMessage` are all injected
  with real defaults so tests touch no network/clock/env. A marker read/write seam
  should follow the same shape (inject `readMarker`/`writeMarker`, default to real
  fs) so idempotency is unit-testable with no filesystem.
- The injected `now: DateTime` is the single clock — reuse it to derive the marker
  date key; do not introduce a new clock read.

### Established Patterns
- **Two-path rule** (`src/index.ts:307-313`): source failures degrade-and-post
  (exit 0); only a POST failure exits 1. The marker write hangs off the exit-0
  post-success path exclusively.
- **Redaction discipline**: webhook URL and `GOOGLE_SA_KEY` reasons are logged to
  the Actions console only, never into the card/payload. The structured run log
  must keep this — counts and booleans only, redacted reason strings.
- **`return code, single exit`**: `runNightly` returns an exit code; the sole
  `process.exit` is at module bottom. New skip/marker logic returns codes, never
  exits directly.

### Integration Points
- Early in `runNightly`, after the weekend guard: the scheduled-only idempotency
  check (read marker → if exists, log "already posted <date>" and return 0).
- After `posted.ok === true` (before `return 0`): build the run-log JSON, print it
  to stdout, and write `.runs/<date>.json`.
- `.github/workflows/nightly.yml`: add `permissions: contents: write` and a step
  after the node run to `git add .runs/ && git commit && git push` (only if the
  file changed), guarded so a manual run that bypassed the marker doesn't error on
  "nothing to commit."

</code_context>

<specifics>
## Specific Ideas

- Marker/run-log file: `.runs/2026-06-04.json` style (studio-local date as the
  filename, one file per posted weekday).
- The file is simultaneously the idempotency marker AND the structured run log —
  Liam explicitly chose to merge the two artifacts.
- Manual test runs (workflow_dispatch) post unconditionally; only the scheduled
  cron path is idempotent.

</specifics>

<deferred>
## Deferred Ideas

- `.runs/` retention/pruning (e.g. keep last N, or roll up monthly) — not needed
  at one small JSON per weekday; revisit only if the directory becomes noisy.
- The D-06 degrade-path refinement (per-designer 🤖 availability row vs whole-card
  degrade) — pre-existing follow-up logged in STATE Deferred Items, not this phase.
- Expanding `labelled-events.json` with borderline cases before enabling the
  Phase-5 `USE_LLM_MEETING_JUDGMENT` toggle in prod — Phase-5 follow-up, not here.

</deferred>

---

*Phase: 07-hardening*
*Context gathered: 2026-06-04*
