# Project Research Summary

**Project:** Evening Studio Check-in
**Domain:** Nightly scheduled API-orchestration bot — Productive.io + Google Calendar → deterministic capacity math → Google Chat
**Researched:** 2026-06-02
**Confidence:** HIGH on stack, architecture, and pitfalls; MEDIUM on "briefed" field mapping and the LLM-on-Pro route

---

## Executive Summary

This is a batch pipeline automation, not a service. It wakes on a nightly schedule (GitHub Actions cron), reads two external systems (Productive.io bookings/tasks + Google Calendar events for three designers), runs deterministic arithmetic to compute capacity and flag gaps, renders a message, posts it to Google Chat, and exits. The recommended approach is a **functional-core / imperative-shell** architecture: all hour math lives in pure, testable TypeScript functions at the centre; all I/O (API calls, LLM, webhook delivery) lives at the edges as swappable adapters. **Node.js 22 LTS + TypeScript** is the right runtime — native fetch, native ESM, and type safety that catches the exact class of JSON-nesting bugs a code-learner hits against Productive's JSON:API responses.

**Three findings reshape the roadmap versus PROJECT.md's current framing:**

1. **The Claude Pro subscription LLM route is not a free, safe, set-and-forget path.** Using Pro/Max OAuth credentials in an unattended automation is a confirmed Anthropic Terms-of-Service violation (actively enforced since Jan 2026, with account-suspension risk for the person). Separately, from **15 June 2026** all programmatic/headless subscription use (explicitly including GitHub Actions) is metered against a separate **$20/mo Agent SDK credit** pool at API rates — so it is neither free nor sanctioned. The OAuth token also has a ~1-day effective CI lifespan with no working auto-refresh. **The LLM must NOT be a load-bearing v1 dependency.**

2. **"Briefed" is NOT a native Productive API field.** It is an org-specific convention (custom field, task status, label, or simply the presence of a linked task). The exact mapping must be discovered via a live-data spike against real bookings before any brief/capacity logic is written — otherwise every booking silently mis-flags.

3. **Build inside-out: deterministic first, LLM last.** A fully shippable, scheduled, posting v1 (data → math → template render → Chat webhook) should exist before any LLM work. The LLM is the last, cuttable phase.

---

## Recommended Stack

| Technology | Role | Why |
|------------|------|-----|
| **Node.js 22 LTS** | Runtime | Current LTS through 2026; native fetch/ESM; first-class GitHub Actions support |
| **TypeScript 5.x + tsx** | Language + dev runner | Type safety against JSON:API gotchas; zero build-step local dev |
| **`googleapis` ^144** | Google Calendar client | Built-in service-account JWT + domain-wide delegation; auto-refreshes tokens |
| **`luxon` ^3** | Date/timezone math | Next-working-day, Friday→Monday rollover, DST-safe event bucketing |
| **`zod` ^3** | API response validation | Parse Productive/Google responses into trusted typed objects; fail loudly on schema drift |
| **GitHub Actions cron** | Scheduler/host | Free, secrets built in, `workflow_dispatch` for manual test runs |

**Secrets (GitHub encrypted repository secrets):** `PRODUCTIVE_API_TOKEN`, `PRODUCTIVE_ORG_ID`, `GOOGLE_SA_KEY` (service-account JSON), `GCHAT_WEBHOOK_URL`. Non-secret config (person IDs, emails, 7.5h target, meeting ignore-list) lives in a committed `config.ts`.

**What NOT to use:** `axios`/`got` (native fetch is enough), native `Date` for day math (DST footguns), Google Chat Cards v1 (deprecated — use `cardsV2`), the community `productive-client` npm package (unmaintained).

---

## Integration Notes

**Productive.io:** Two headers on every request — `X-Auth-Token` + `X-Organization-Id`. JSON:API format. **Time-off is an absence booking (`booking_type=event`) on `/api/v2/bookings`**, not a separate resource; work bookings are `booking_type=service`. **Tentative bookings have `draft: true` and are excluded from the default response** — must opt in, then flag distinctly. Page size default 30 (max 200) — always paginate. Rate limits 100/10s, 4000/30min — fine for one nightly run.

**Google Calendar:** Service account + domain-wide delegation (DWD) is the correct unattended pattern. **Requires a Google Workspace admin to authorise** the service account's client ID with `calendar.readonly` scope — a hard external dependency to confirm before the calendar phase. Use `singleEvents=true` to expand recurring meetings; filter declined / all-day / OOO events before reconciliation.

**Google Chat:** Incoming webhook is sufficient and **fully supports `cardsV2`** (logo header, decorated rows, sections, accent colour, link buttons). No interactive button clicks over webhooks — an anti-feature here anyway. The webhook URL is the credential; store as a single secret.

---

## Expected Features

**Must have (table stakes):** per-designer next-day capacity (7.5h − time-off vs booked); studio rest-of-week rollup; tentative bookings counted-but-flagged; missing-brief flag (existence only, per discovered mapping); unaccounted-meeting flag (hard-excluding WIP + creative-team recurring meetings); always-post incl. short positive note on clean nights; degraded-mode message naming any unreachable source; on-brand `cardsV2` message (verdict → week rollup → per-designer rows → grouped flags); deep-links to Productive/Calendar; weekday ~4:30pm schedule (Friday targets Monday).

**Differentiators:** severity-graded message length; on-brand header with logo + verdict-coloured accent; templated fallback that posts the same data if the LLM renderer fails.

**Defer (v1.x / v2+):** LLM-written prose; brief *quality* analysis; historical trends / dashboard.

**Anti-features (defend scope):** @-mentioning PMs; per-user DMs; multiple sends/escalation; LLM doing arithmetic; weekend runs; configurable-everything UI.

---

## Architecture (functional core, imperative shell)

One short-lived process: wake → gather → compute → render → deliver → exit.

1. **`clock.ts`** — pure: trigger instant + timezone → `{ targetDay, isFridayLookahead, weekRemainingDays }`. Single clock read in `main`.
2. **`gather/productive-client.ts` + `gather/calendar-client.ts`** — thin adapters; map raw JSON → typed domain objects; return `Result<T>` (never throw across the boundary). Calendar client drops known overhead meetings by rule.
3. **`analyze/`** — pure functional core (the trust boundary): capacity arithmetic, week rollup, brief existence, rule-based meeting-reconciliation candidates. No network, no LLM. Produces one immutable `StudioReport`.
4. **`render/`** — `Renderer` interface, two implementations: `template-renderer.ts` (deterministic, always succeeds) and `llm-renderer.ts` (two-stage: structured judgment → prose; falls back to template on any failure). LLM receives only finished computed facts — never raw operands.
5. **`deliver/chat-notifier.ts`** — posts `RenderedMessage` to the webhook; does not format.
6. **`main.ts`** — imperative shell: wire, orchestrate, catch, guarantee a post (degraded message via `if: failure()` workflow step).

---

## Critical Pitfalls

1. **LLM-on-Pro as a load-bearing v1 dependency** — ToS violation + ~1-day token lifespan + metered from 15 Jun 2026. → Build deterministic templated renderer as real v1; LLM isolated and cuttable.
2. **Assuming "briefed" is a Productive field** — it isn't. → Mandatory live-data discovery spike before capacity logic.
3. **LLM doing arithmetic** — one wrong total kills trust permanently. → All math in `analyze/`; LLM only chooses words; validate numbers before posting.
4. **GitHub cron drift + 60-day auto-disable** — UTC-only, shifts with DST, silently disabled after 60 days inactivity. → Compute window from studio timezone in `clock.ts`; keepalive; weekday guard in code.
5. **Silent run failures** — no post is indistinguishable from a clean night. → `Result<T>` boundaries; tolerate missing sources; always post; `if: failure()` alert.
6. **Google Calendar DWD blocked** — if admin won't authorise, calendar read fails. → Confirm admin before Phase 4; degraded calendar path.
7. **False-positive meeting flags** — flagging known overhead trains PMs to ignore the message. → Hard-exclude WIP + creative-team meetings; bias toward not flagging; pilot before daily rollout.

---

## Implications for Roadmap (suggested phase order)

- **Phase 1 — Types, Clock, Pure Math Core.** Trust-critical arithmetic, fully unit-tested, no external deps. Capacity math, week rollup, tentative flagging, Friday→Monday, brief-existence stub; tests cover DST, Friday edge, holiday-eve, partial data.
- **Phase 2 — Productive Pull + "Briefed" Discovery.** `productive-client.ts` → typed `Booking[]`/`TimeOff[]`; **mandatory discovery spike** (pull 20–30 real bookings with `include=task,service,custom_fields`, confirm "briefed" encoding + `booking_type` strings); fixtures; pipeline runnable on real data.
- **Phase 3 — Template Renderer + Chat Delivery (shippable v1).** On-brand `cardsV2` card; webhook delivery; always-post + degraded mode; weekday ~4:30pm schedule; `workflow_dispatch`; keepalive; deep-links. **This is a complete shippable product with zero LLM and zero Calendar dependency.**
- **Phase 4 — Calendar Pull + Meeting Reconciliation.** Service account + DWD (confirm admin first); hard-exclude WIP/creative-team; rule-based reconciliation candidates; degraded path; `singleEvents=true`; declined/all-day/OOO filtering. **Pilot gate:** validate every flag against real evenings before daily posting.
- **Phase 5 — LLM Renderer (optional, cuttable).** Only after the deterministic pipeline is trusted, and only via an **automation-permitted** route (not the Pro OAuth token). Two-stage judgment→prose behind the existing `Renderer` interface; schema validation; fallback to template; loud alert when skipped. **Business/policy decision required before planning.**
- **Phase 6 — Hardening + optional Gmail.** Idempotency (dated marker), structured run log, optional Gmail via the same service account (`gmail.send` scope).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Node 22 + TS verified; `googleapis`/`luxon`/`zod` current; native fetch sufficient |
| Features | HIGH | Google Chat capabilities verified against official docs |
| Architecture | HIGH | Functional-core/imperative-shell; boundaries from trust + resilience |
| Pitfalls | HIGH | LLM billing/ToS verified across sources; Productive model verified; cron disable verified |
| "Briefed" field mapping | LOW | Org-specific — must be discovered against live data (Phase 2) |
| LLM-on-Pro route | MEDIUM | Token lifespan + 15 Jun 2026 metering confirmed; ToS violation confirmed |
| Productive pagination details | MEDIUM | Guide page 404'd; inferred from JSON:API norms — verify Phase 2 |
| Google DWD admin approval | UNKNOWN | External dependency — confirm before Phase 4 |

### Gaps to resolve during execution
- "Briefed" encoding in Productive (Phase 2 discovery spike — the Productive integration is available to run it).
- Exact Productive pagination default/max (verify Phase 2; use `page[size]=200` safely).
- Google Workspace admin + DWD authorisation (confirm before Phase 4).
- LLM route decision — sanctioned commercial API key vs accept metered cost vs alternative provider vs template-only (before Phase 5; may be cut).
- Australian public holiday source (stub in Phase 1; confirm a real source).

---

*Research completed: 2026-06-02 · Ready for roadmap: yes*
