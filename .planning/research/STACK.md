# Stack Research

**Domain:** Nightly scheduled API-orchestration script (Productive.io + Google Calendar + Google Chat + LLM rendering), run unattended on GitHub Actions cron, built by a code-learner.
**Researched:** 2026-06-02
**Confidence:** HIGH on language/Productive/Google; MEDIUM-to-LOW and time-sensitive on the LLM-on-Pro route (item 5 — see verdict).

---

## TL;DR for the roadmap

- **Language:** Node.js + TypeScript. (Python is a close, defensible second — see Alternatives.)
- **Productive.io:** plain `fetch`/`undici` against `https://api.productive.io/api/v2/`, JSON:API headers `X-Auth-Token` + `X-Organization-Id`. Time-off is NOT a separate resource — it is an *absence booking* (`booking_type=event`) on the `/bookings` endpoint.
- **Google Calendar:** service account + domain-wide delegation, official `googleapis` Node client. This is the correct unattended path — no human re-consent, no refresh-token babysitting.
- **Google Chat:** incoming webhook (one POST, no OAuth), `cardsV2` payload for on-brand formatting. A Chat *app/bot* is overkill for one-way posting.
- **LLM on Pro:** **CONDITIONAL NO-GO as a free, durable solution (see item 5).** The Claude-Code-Action OAuth route technically runs, but (a) tokens expire ~daily and there is no working refresh in ephemeral CI, and (b) **from 15 June 2026 all programmatic/headless subscription use — explicitly including Claude Code GitHub Actions — is metered against a separate $20/mo Pro "Agent SDK credit" pool at API rates, not your normal Pro chat limits.** Build the deterministic templated renderer first; treat the LLM as a swappable enhancement.
- **Secrets:** GitHub Actions encrypted repository secrets; non-secret config in a committed `config.json`/`.ts`.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS (`22.x`) | Runtime | Current LTS through 2026; native `fetch`, native ESM, top-level await, built-in test runner. GitHub Actions `setup-node@v4` supports it directly. |
| TypeScript | `5.x` (latest 5.7+) | Language | Types catch the exact class of bug a learner hits most against JSON:API: misspelled fields, wrong nesting, null hours. The Productive/Google response shapes are gnarly nested JSON — types turn runtime surprises into editor errors. |
| tsx | `4.x` | Run TS directly | `tsx script.ts` with zero build step. Keeps the project a single runnable file for a learner — no `tsc`/bundler ceremony. |
| GitHub Actions | n/a (hosted) | Scheduler/host | Free for this volume, secrets built in, no server. `schedule:` cron + `workflow_dispatch` for manual test runs. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `googleapis` | `^144` (latest) | Official Google Node client (Calendar) | Always, for Calendar. Built-in `google.auth.JWT` / `GoogleAuth` handles service-account + domain-wide-delegation token minting and refresh internally. |
| `luxon` | `^3` | Dates/timezones | Essential. "Next working day," Friday→Monday rollover, time-off date ranges, and Productive's `started_on`/`ended_on` all need correct timezone math. JS native `Date` is a trap for a learner. |
| `zod` | `^3` (or v4 if stable) | Validate API responses at the boundary | Parse Productive/Google responses into typed, trusted objects once, fail loudly on shape drift. Makes the "degraded message when a source fails" requirement clean. |
| (native `fetch`) | built into Node 22 | HTTP client | No axios/got needed. Productive is plain GET with three headers; one tiny wrapper handles pagination. |

No HTTP-client dependency is required — see "What NOT to Use."

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` | Local run + watch | `tsx watch src/index.ts` during dev. |
| Prettier | Formatting | One config, format-on-save. Removes a whole category of "why does it look wrong" for a learner. |
| `dotenv` (dev only) | Load secrets locally | `import 'dotenv/config'`. Local `.env` mirrors the GitHub secrets; never committed. In CI, secrets come from the Actions environment, so dotenv is a no-op there. |
| Node built-in test runner (`node:test`) | Test the deterministic hour math | The capacity arithmetic is the trust-critical part — unit-test it. No Jest/Vitest dependency needed. |

---

## Item 1 — Language/runtime verdict: **Node.js + TypeScript** (Confidence: HIGH)

Both Node/TS and Python would do this job well. Recommending Node/TS because:

1. **One ecosystem end-to-end.** Google's first-party Node client (`googleapis`) is excellent and the same language renders the Chat `cardsV2` JSON. Productive returns JSON that maps to JS objects natively.
2. **TypeScript is the better teacher for a code-learner working against messy APIs.** The failure mode here is malformed/nested JSON and `undefined` hours. TS surfaces those in the editor before the nightly run, not at 4:30pm in a silent CI log.
3. **GitHub Actions ergonomics.** `setup-node` is first-class; `tsx` means no build step.
4. **If the LLM path ends up being the Claude Code GitHub Action**, that action is itself a Node/TS/CLI tool — staying in the same world reduces moving parts.

**Where Python would win (Alternatives):** if Liam already knows Python, the learning-curve argument flips. Python's `google-api-python-client` is equally official, and `requests` is famously beginner-friendly. Python is the right call *only if* prior familiarity outweighs the type-safety benefit. Given "still learning code (all aspects)," starting fresh, TS's guardrails are worth more than Python's lower initial friction.

---

## Item 2 — Productive.io API (Confidence: HIGH, verified against developer.productive.io)

- **Base URL:** `https://api.productive.io/api/v2/`
- **Format:** JSON:API spec (`https://jsonapi.org/`). Responses use `data` / `included` / `relationships` / `meta`. You will lean on `include=` to pull related resources in one call.
- **Auth headers (every request):**
  - `X-Auth-Token: <API token>` — generated in Productive: Settings → API integrations → Generate new token
  - `X-Organization-Id: <org id>`
  - `Content-Type: application/vnd.api+json` (JSON:API content type — send it on requests)
- **Errors:** unauthorized returns HTTP `403` with an error body.

### Endpoints needed

| Resource | Path | Notes for this project |
|----------|------|------------------------|
| Bookings | `/api/v2/bookings` | The core resource. Supports filters incl. `filter[person_id]`, `filter[after]`, `filter[before]`, `filter[booking_type]`, `filter[project_id]`, `filter[budget_id]`, `filter[approval_status]`, `filter[draft]`. Key attributes: `started_on`, `ended_on`, `hours` (per day), `time` (minutes/day), `total_time`, `approved`, `approval_status`, `draft`, `booking_type`, plus relationships `person`, `service` (budget bookings) or `event` (absence bookings), and optionally `task`. |
| People | `/api/v2/people` | Resolve the three monitored designers to their person IDs (do this once, hardcode the IDs in config). |
| Projects | `/api/v2/projects` | Context/labels for bookings when composing the message. |
| Tasks | `/api/v2/tasks` | For the "booking has a linked task + briefed?" existence check. Reachable via the booking's `task` relationship and/or `service`→task linkage. |
| Services | (`service` relationship on a budget booking) | Budget bookings link to a `service`, which ties to project/budget. Useful when a booking has no direct task. |

**CRITICAL DATA-MODEL FINDING:** There is **no separate `time_offs` resource** to rely on for designer availability. In Productive, **time off is an *absence booking*** — a `/bookings` record with `booking_type=event` (linked to an `event` object representing the absence type), as opposed to a `service` booking (`booking_type=service`) which is real work. So the availability math is: pull bookings for each designer in the target window, split by `booking_type` (`event` = absence/time-off → reduces the 7.5h; `service` = work → counts toward booked hours). This collapses "read bookings" and "read time-off" into one endpoint. (Productive *does* surface time-off elsewhere in the product UI, but for the API the absence-booking path is the reliable, documented one. Confidence: MEDIUM-HIGH — confirm the exact `booking_type` value strings and whether the org uses approval on absences during Phase research.)

### Pagination (Confidence: MEDIUM — pagination guide page 404'd on fetch; values from JSON:API norms + Productive docs index)

- JSON:API style: `page[number]` and `page[size]` query params.
- Default page size is small (commonly 30); a max applies (commonly 200). Read `meta.total_count` / `meta.total_pages` from the response to know when to stop.
- **Action item for Phase 1:** verify exact default/max page size against `developer.productive.io/guides/pagination` (the `.html` path 404'd during research; the guide exists under the docs nav). For three designers over a few days the result sets are tiny, so a simple "loop while there's a next page" wrapper is plenty.

### HTTP client recommendation

Use **native `fetch`** (Node 22) with a ~20-line helper that sets the three headers, throws on non-2xx, and walks pages. No `axios`, `got`, or a Productive SDK wrapper needed — the surface is small and a thin self-owned client is more debuggable for a learner. (Community wrappers like `productive-client` exist but add an unmaintained dependency for little gain.)

---

## Item 3 — Google Calendar, reading THREE users unattended (Confidence: HIGH)

**Recommended: Service account + domain-wide delegation (DWD).** This is the standard, documented pattern for an unattended job reading multiple Workspace users' calendars.

Why DWD over an OAuth refresh token:
- **No human in the loop, ever.** A service account with DWD impersonates each designer (`subject: designer@domain`) and reads their calendar with zero interactive consent. An OAuth refresh token requires an initial human consent and can be silently revoked (password change, security policy, 6-month inactivity expiry on some configs) — exactly the "silent failure at 4:30pm" you want to avoid.
- **Three users cleanly.** One service account impersonates each of the three in turn — no three separate token dances.
- **Least privilege:** grant only the **read-only** scope `https://www.googleapis.com/auth/calendar.readonly` (or `calendar.events.readonly`) in the Admin console DWD config.

Setup (needs a Workspace admin — flag this as a dependency in the roadmap):
1. Create a GCP project, enable the Google Calendar API.
2. Create a service account, generate a JSON key.
3. In Google Admin console → Security → Access and data control → API controls → **Manage Domain-Wide Delegation**: add the service account's **client ID** with the `calendar.readonly` scope.
4. In code: `googleapis` `google.auth.JWT` (or `GoogleAuth`) with the service-account email, the private key, the scope, and `subject` set to each designer's email to impersonate.

Library: official **`googleapis`** Node client (`google.calendar('v3').events.list`). It mints and refreshes the short-lived access token from the service-account key internally — nothing to persist between runs, which is exactly right for ephemeral CI.

Store the service-account JSON key as a single GitHub secret (`GOOGLE_SA_KEY`), write it to a temp file (or pass the parsed object) at runtime.

---

## Item 4 — Google Chat delivery (Confidence: HIGH)

**Recommended: Incoming webhook.** One-way posting is all this project needs.

- **POST** to `https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=KEY&token=TOKEN`
- Body is JSON; **`cardsV2` is supported via webhooks** (cards v1 is deprecated — use v2). Plain `{ "text": "..." }` works for the simplest message; `cardsV2` with sections, headers, and decorated text gives the on-brand, structured look (designer names as section headers, hour figures as key/value rows, a colored header for "all sorted" vs "needs attention").
- **No OAuth/SDK needed** — the `key`+`token` in the URL are the auth. Store the whole webhook URL as a single secret (`GCHAT_WEBHOOK_URL`); never commit it.
- **Rate limit:** ~1 request/second per space — irrelevant for one nightly post.

Why NOT a full Chat app/bot: bots exist to *receive* messages and respond interactively (slash commands, dialogs). That requires app auth, an HTTPS endpoint, and Workspace app config — none of which a once-a-night one-way nudge needs. Build a bot only if you later want users to reply to or query the message.

**On-brand formatting note:** `cardsV2` supports header (title/subtitle/image), `sections` with `textParagraph`, `decoratedText` (icon + top/bottom label), and `buttonList`. That is enough for a polished, scannable card. Heavy custom branding (fonts, exact colors) is constrained by Chat's card system — design within `cardsV2` widgets, don't fight them.

**Gmail secondary option:** if email is added later, prefer the **Gmail API** over raw SMTP — it reuses the same Google service-account + DWD setup (add `gmail.send` scope, impersonate a sender), so no new credential type. SMTP would mean an app password / separate secret and is the weaker choice in a Workspace org. Mark Gmail as a later, optional channel.

---

## Item 5 — LLM on Claude Pro, unattended: VERDICT (this is the load-bearing finding)

### Verdict: **CONDITIONAL NO-GO for a free, durable, set-and-forget LLM. Ship the deterministic templated renderer as the real v1; treat the LLM as an optional, manually-maintained enhancement.** (Confidence: HIGH on the facts; the recommendation is opinionated.)

Two independent problems, either of which is enough to demote the LLM-on-Pro route from "the plan" to "a maybe."

**Problem A — Token expiry breaks unattended CI (Confidence: HIGH).**
- `claude setup-token` *does* work on **Pro** (not Max-only) and emits a `CLAUDE_CODE_OAUTH_TOKEN` (`sk-ant-oat01-...`). The `anthropics/claude-code-action@v1` accepts `claude_code_oauth_token:` in place of `anthropic_api_key:`, and the action *can* run on a pure `schedule:` cron with a `prompt:` (no `@claude` mention needed). So far, viable.
- **But** these tokens are short-lived — access token ~8 hours, practical validity ~1 day — and there is a well-documented open issue (`anthropics/claude-code-action#727`, plus `claude-code#38813`, `#31095`) that the **refresh token is not used in ephemeral CI**: GitHub runners are recreated each run, so a refreshed token can't be persisted. The token simply goes stale and the nightly job **fails silently** after roughly a day. Workarounds (storing a PAT to rewrite the secret, third-party `claude-code-login` actions) exist but are brittle, unofficial, and exactly the kind of fragile machinery you do not want under a "never silently skip a night" requirement. As of the research date there is no official refresh support.

**Problem B — From 15 June 2026 it is no longer free (Confidence: HIGH).**
- Anthropic's billing change effective **15 June 2026** moves *all programmatic/headless subscription usage — explicitly listing Claude Code GitHub Actions, `claude -p`, and the Agent SDK* — **off** your normal Pro chat limits and **onto a separate metered "Agent SDK credit" pool: $20/month for Pro, billed at full API rates, no rollover.** Interactive Claude Code in a terminal and claude.ai chat are unaffected — but a scheduled GitHub Action is precisely the metered category. When the $20 credit is exhausted, requests are **rejected** unless you opt in to "usage credits," which then bills at API rates.
- **Implication:** the project's stated "effectively zero ongoing cost" and "no new per-use billing" constraints are no longer satisfiable by the Pro-subscription LLM route after 15 June 2026. The route doesn't *technically* require an API key (so it threads the "org blocks API-key creation" needle), but it now consumes a metered, capped, potentially-billable credit pool tied to Liam's personal Pro subscription. Today is 2 June 2026 — you would be building directly into this transition.

**ToS standing (Confidence: MEDIUM — gray area, stated honestly):**
- Using Anthropic's **official** Claude Code CLI / GitHub Action under a subscription is *allowed* — Anthropic's enforcement in Jan 2026 targeted *third-party* tools (OpenClaw, etc.) that extracted OAuth tokens into their own API clients, not first-party Claude Code. So the *mechanism* is permitted.
- The grayer points: it runs **unattended for a business automation** on a **personal Pro subscription** under Consumer Terms; and it bills to **Liam's personal** subscription/credit for company work. Neither is clearly prohibited for first-party Claude Code, but it's not a clean commercial footing. For a sanctioned business tool, the clean answer is a commercial API key — which the org has blocked, which is the whole reason we're here.

**Therefore — recommended LLM strategy (matches the existing "swappable intelligence layer" key decision):**
1. **v1 = deterministic templated renderer, no LLM.** All hour math is already required to be deterministic. The message itself can be a well-crafted TypeScript template with conditional sections and varied phrasing. This fully satisfies every requirement except the LLM-flavored "fuzzy meeting reconciliation" and "naturally-written prose."
2. **Meeting reconciliation without an LLM:** implement as deterministic rules first (ignore-list for the daily WIP + creative-team meeting by title/organizer; match remaining calendar events to bookings by time-overlap + attendee). This handles the large majority of cases. Reserve genuinely ambiguous cases for an LLM later — or just flag them for a human.
3. **LLM as an optional enhancement layer** behind a clean interface (`renderMessage(data): string`), so it can be swapped in without touching the data/math layers. If the LLM is added:
   - **Preferred future path if policy allows:** a sanctioned **commercial API key** (cleanest ToS + reliable auth). Revisit with the org.
   - **Pro-subscription path (if pursued despite the above):** budget for the $20/mo Pro Agent SDK credit, decide the usage-credits toggle deliberately, and build an explicit auth-failure → fall-back-to-template path plus a token-staleness alert so a dead token never produces a silent no-post. Accept the ~daily-token-refresh maintenance burden.

**Bottom line for the roadmap:** do **not** make the LLM-on-Pro route a load-bearing dependency. The product must be fully functional and shippable with the templated renderer. The LLM is a "nice prose + edge-case judgment" upgrade with real auth-fragility and a now-non-zero cost.

---

## Item 6 — Secrets & config (Confidence: HIGH)

- **Secrets → GitHub Actions encrypted repository secrets** (Settings → Secrets and variables → Actions). Referenced as `${{ secrets.NAME }}` and injected as env vars. Encrypted at rest, masked in logs. Required secrets:
  - `PRODUCTIVE_API_TOKEN`, `PRODUCTIVE_ORG_ID`
  - `GOOGLE_SA_KEY` (full service-account JSON, single secret)
  - `GCHAT_WEBHOOK_URL`
  - (only if LLM enabled) `CLAUDE_CODE_OAUTH_TOKEN`
- **Non-secret config → committed file** (`config.ts` or `config.json`): the three designer person IDs + calendar emails, the 7.5h target, the meeting ignore-list (WIP / creative-team titles), the target Chat space, timezone. Keeping this in-repo (not in secrets) makes it reviewable and version-controlled; only credentials go in secrets.
- **Local dev:** `.env` (gitignored) loaded by `dotenv`, mirroring the secret names so `process.env.X` works identically locally and in CI.
- **Run config:** `schedule:` cron in the workflow (note: GitHub cron is **UTC** — convert 4:30pm local accordingly, and weekday-only via the cron day-of-week field) **plus** `workflow_dispatch:` so Liam can trigger a manual test run from the Actions tab. Beware: GitHub scheduled workflows can be delayed under load and are disabled after 60 days of repo inactivity — acceptable here, but worth noting.

---

## Installation

```bash
# Project init
npm init -y
npm pkg set type=module

# Core deps
npm install googleapis luxon zod

# Dev deps
npm install -D typescript tsx prettier dotenv @types/node @types/luxon

# Run locally
npx tsx src/index.ts
```

No HTTP-client, test framework, or LLM SDK dependency in the baseline. The LLM, if added, runs via the `anthropics/claude-code-action@v1` GitHub Action (no npm dep) — or a commercial-API-key SDK if policy changes.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Node.js + TypeScript | Python + `google-api-python-client` + `requests` | If Liam already knows Python — prior familiarity beats TS's type guardrails for a first project. Equally well-supported for all three APIs. |
| Native `fetch` for Productive | `axios` / `got` / `productive-client` wrapper | Never needed here; only if you outgrow simple GET + pagination. The community `productive-client` is unmaintained — avoid. |
| Service account + DWD (Calendar) | OAuth 2.0 refresh token | Only if you can't get Workspace-admin DWD approval. Downsides: human consent, silent revocation risk, refresh-token storage — worse for unattended. |
| Incoming webhook (Chat) | Chat app / bot (app auth) | Only if you later need two-way interaction (replies, slash commands, queries). |
| Gmail API (if email added) | SMTP + app password | Only if there's a hard reason not to reuse the Google service account. SMTP is the weaker option in a Workspace org. |
| Deterministic template renderer | LLM via Claude Code Action on Pro | LLM only as a swappable enhancement, accepting daily-token fragility + the post-15-Jun-2026 $20/mo metered Pro credit. Prefer a sanctioned commercial API key if the org ever allows one. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Claude Pro OAuth token as the **load-bearing** LLM auth | Tokens expire ~daily; refresh isn't used in ephemeral CI (open issue #727); job fails silently — violates "never silently skip a night." Plus metered/capped from 15 Jun 2026. | Deterministic template as v1; LLM optional behind a fallback. |
| Letting the LLM do any hour/capacity arithmetic | Numbers must be exact or the team stops trusting the message (explicit project constraint). | Compute all math in deterministic TS; LLM only phrases/judges. |
| A separate Productive `time_offs` endpoint as availability source | Time off is an **absence booking** (`booking_type=event`) on `/bookings`; there is no clean separate resource to depend on. | Split `/bookings` by `booking_type`. |
| Cards v1 in Google Chat | Deprecated. | `cardsV2`. |
| Native JS `Date` for the working-day/timezone math | Footguns around timezones, DST, date-only values — high bug risk for a learner on trust-critical logic. | `luxon`. |
| `axios`/`got` | Unneeded dependency; native `fetch` covers the tiny Productive surface. | Native `fetch` (Node 22). |
| Hardcoding any token in the repo or workflow YAML | Leaked credentials; the Chat webhook URL especially must stay secret. | GitHub encrypted secrets + gitignored `.env`. |

---

## Stack Patterns by Variant

**If the LLM-on-Pro route is pursued anyway:**
- Wrap it behind `renderMessage(data) → string` with a try/catch that falls back to the template on any auth/timeout failure, AND emits the degraded-mode note so a dead token can't cause a silent no-post.
- Add a lightweight token-staleness signal (e.g. job annotation / a one-line "LLM auth failed, used template" in the Chat message) so the ~daily token refresh isn't discovered by absence.

**If Workspace-admin DWD approval is blocked:**
- Fall back to a single OAuth client + stored refresh token for the three calendars (all three must consent once). Store the refresh token as a secret. Accept silent-revocation risk and add an auth-failure → degraded-message path.

**If email is added later:**
- Reuse the Google service account; add `gmail.send` scope to the DWD config and impersonate a sending address. No new credential type.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Node 22 LTS | `googleapis ^144`, `tsx ^4`, `typescript 5.x` | All current and mutually compatible as of 2026-06. |
| `googleapis ^144` | Google Calendar API v3 | Service-account JWT + DWD `subject` impersonation supported natively. |
| `luxon ^3` | `@types/luxon` | Pair the types; Luxon ships none bundled. |
| `anthropics/claude-code-action@v1` | `CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max) OR `ANTHROPIC_API_KEY` | OAuth token short-lived; v1 auto-detects schedule/prompt vs @claude trigger. |

---

## Sources

- developer.productive.io/index.html — base URL `https://api.productive.io/api/v2/`, JSON:API spec — HIGH
- developer.productive.io/guides/authorization — `X-Auth-Token` + `X-Organization-Id` headers, token generation, 403 on unauthorized — HIGH
- developer.productive.io/bookings.html — `/api/v2/bookings`, filters (`person_id`, `after`, `before`, `booking_type`, etc.), attributes (`started_on`/`ended_on`/`hours`/`approval_status`), absence (event) vs budget (service) booking distinction — HIGH
- developer.productive.io/people.html (referenced) — `/api/v2/people` — HIGH
- Pagination guide page returned 404 on fetch; `page[number]`/`page[size]` inferred from JSON:API spec + docs nav — MEDIUM, flagged for Phase-1 verification
- code.claude.com/docs/en/github-actions — `claude-code-action@v1`, `schedule:` cron + `prompt:`, `anthropic_api_key` vs alternatives, v1 auto-detection — HIGH
- github.com/anthropics/claude-code-action/blob/main/docs/setup.md — `claude setup-token` works for **Pro and Max**; `claude_code_oauth_token` interchangeable with API key — HIGH
- github.com/anthropics/claude-code-action/issues/727 + claude-code #38813/#31095 — OAuth token ~1-day expiry, refresh not used in ephemeral CI, open (no official fix) — HIGH
- codersera.com / InfoWorld / The New Stack / Anthropic help center coverage — 15 Jun 2026 billing change: programmatic use incl. GitHub Actions metered to separate Agent SDK credit pool ($20 Pro, API rates, no rollover, opt-in overflow) — HIGH (multiple sources agree)
- knowledge.workspace.google.com + developers.google.com/workspace/calendar — service account + domain-wide delegation for unattended multi-user calendar read; `calendar.readonly` scope — HIGH
- /websites/googleapis_dev_nodejs_googleapis (Context7) — official `googleapis` Node client supports JWT/service-account auth — HIGH
- developers.google.com/workspace/chat/quickstart/webhooks — incoming webhook POST URL, `text`/`cardsV2`, key+token auth, ~1 req/s limit — HIGH

---
*Stack research for: nightly Productive.io + Google Calendar + Google Chat resourcing-check automation*
*Researched: 2026-06-02*
