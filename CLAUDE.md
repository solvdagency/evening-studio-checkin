<!-- GSD:project-start source:PROJECT.md -->
## Project

**Evening Studio Check-in**

A nightly automation for a design/marketing agency's creative studio. Every weekday around 4:30pm it reads the design team's resourcing from Productive.io and the designers' meetings from Google Calendar, then posts an on-brand "evening check-in" to Google Chat (Gmail optional) that flags what needs sorting before the next working day — designer hours that aren't fully booked, bookings missing a finished brief, and meetings that aren't accounted for in Productive. It's a collective nudge — really aimed at the project managers — so designers walk in to a full, ready day instead of chasing work.

**Core Value:** Every evening the team gets one clear, trustworthy heads-up of exactly what needs fixing before tomorrow — so the three designers start the day with full, briefed workloads instead of chasing the work themselves.

### Constraints

- **Tech stack**: Node.js 22 + TypeScript; GitHub Actions cron for scheduling; Google Chat incoming webhook with Cards v2.
- **LLM access**: LLM runs via a sanctioned Anthropic API key (pay-per-use). The unattended Pro/Max-subscription OAuth route is prohibited by Anthropic's terms and metered from 15 Jun 2026, so it is not used.
- **Hosting**: Runs unattended on a nightly schedule with no always-on server (GitHub Actions cron).
- **Trust**: All hour/capacity arithmetic is done in deterministic code, never by the LLM — the numbers must be exact or the team stops reading the message.
- **Dependencies**: Productive.io API; Google Calendar API via service account + domain-wide delegation (needs a Google Workspace admin to authorise); Google Chat incoming webhook; org-provisioned Anthropic API key (for the LLM phase only).
- **Cost**: Near-zero ongoing cost — free scheduled hosting; LLM is a few cents per night on the sanctioned API key.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR for the roadmap
- **Language:** Node.js + TypeScript. (Python is a close, defensible second — see Alternatives.)
- **Productive.io:** plain `fetch`/`undici` against `https://api.productive.io/api/v2/`, JSON:API headers `X-Auth-Token` + `X-Organization-Id`. Time-off is NOT a separate resource — it is an *absence booking* (`booking_type=event`) on the `/bookings` endpoint.
- **Google Calendar:** service account + domain-wide delegation, official `googleapis` Node client. This is the correct unattended path — no human re-consent, no refresh-token babysitting.
- **Google Chat:** incoming webhook (one POST, no OAuth), `cardsV2` payload for on-brand formatting. A Chat *app/bot* is overkill for one-way posting.
- **LLM on Pro:** **CONDITIONAL NO-GO as a free, durable solution (see item 5).** The Claude-Code-Action OAuth route technically runs, but (a) tokens expire ~daily and there is no working refresh in ephemeral CI, and (b) **from 15 June 2026 all programmatic/headless subscription use — explicitly including Claude Code GitHub Actions — is metered against a separate $20/mo Pro "Agent SDK credit" pool at API rates, not your normal Pro chat limits.** Build the deterministic templated renderer first; treat the LLM as a swappable enhancement.
- **Secrets:** GitHub Actions encrypted repository secrets; non-secret config in a committed `config.json`/`.ts`.
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
| `googleapis` | `^173` (latest) | Official Google Node client (Calendar) | Always, for Calendar. Built-in `google.auth.JWT` / `GoogleAuth` handles service-account + domain-wide-delegation token minting and refresh internally. |
| `luxon` | `^3` | Dates/timezones | Essential. "Next working day," Friday→Monday rollover, time-off date ranges, and Productive's `started_on`/`ended_on` all need correct timezone math. JS native `Date` is a trap for a learner. |
| `zod` | `^3` (or v4 if stable) | Validate API responses at the boundary | Parse Productive/Google responses into typed, trusted objects once, fail loudly on shape drift. Makes the "degraded message when a source fails" requirement clean. |
| (native `fetch`) | built into Node 22 | HTTP client | No axios/got needed. Productive is plain GET with three headers; one tiny wrapper handles pagination. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` | Local run + watch | `tsx watch src/index.ts` during dev. |
| Prettier | Formatting | One config, format-on-save. Removes a whole category of "why does it look wrong" for a learner. |
| `dotenv` (dev only) | Load secrets locally | `import 'dotenv/config'`. Local `.env` mirrors the GitHub secrets; never committed. In CI, secrets come from the Actions environment, so dotenv is a no-op there. |
| Node built-in test runner (`node:test`) | Test the deterministic hour math | The capacity arithmetic is the trust-critical part — unit-test it. No Jest/Vitest dependency needed. |
## Item 1 — Language/runtime verdict: **Node.js + TypeScript** (Confidence: HIGH)
## Item 2 — Productive.io API (Confidence: HIGH, verified against developer.productive.io)
- **Base URL:** `https://api.productive.io/api/v2/`
- **Format:** JSON:API spec (`https://jsonapi.org/`). Responses use `data` / `included` / `relationships` / `meta`. You will lean on `include=` to pull related resources in one call.
- **Auth headers (every request):**
- **Errors:** unauthorized returns HTTP `403` with an error body.
### Endpoints needed
| Resource | Path | Notes for this project |
|----------|------|------------------------|
| Bookings | `/api/v2/bookings` | The core resource. Supports filters incl. `filter[person_id]`, `filter[after]`, `filter[before]`, `filter[booking_type]`, `filter[project_id]`, `filter[budget_id]`, `filter[approval_status]`, `filter[draft]`. Key attributes: `started_on`, `ended_on`, `hours` (per day), `time` (minutes/day), `total_time`, `approved`, `approval_status`, `draft`, `booking_type`, plus relationships `person`, `service` (budget bookings) or `event` (absence bookings), and optionally `task`. |
| People | `/api/v2/people` | Resolve the three monitored designers to their person IDs (do this once, hardcode the IDs in config). |
| Projects | `/api/v2/projects` | Context/labels for bookings when composing the message. |
| Tasks | `/api/v2/tasks` | For the "booking has a linked task + briefed?" existence check. Reachable via the booking's `task` relationship and/or `service`→task linkage. |
| Services | (`service` relationship on a budget booking) | Budget bookings link to a `service`, which ties to project/budget. Useful when a booking has no direct task. |
### Pagination (Confidence: MEDIUM — pagination guide page 404'd on fetch; values from JSON:API norms + Productive docs index)
- JSON:API style: `page[number]` and `page[size]` query params.
- Default page size is small (commonly 30); a max applies (commonly 200). Read `meta.total_count` / `meta.total_pages` from the response to know when to stop.
- **Action item for Phase 1:** verify exact default/max page size against `developer.productive.io/guides/pagination` (the `.html` path 404'd during research; the guide exists under the docs nav). For three designers over a few days the result sets are tiny, so a simple "loop while there's a next page" wrapper is plenty.
### HTTP client recommendation
## Item 3 — Google Calendar, reading THREE users unattended (Confidence: HIGH)
- **No human in the loop, ever.** A service account with DWD impersonates each designer (`subject: designer@domain`) and reads their calendar with zero interactive consent. An OAuth refresh token requires an initial human consent and can be silently revoked (password change, security policy, 6-month inactivity expiry on some configs) — exactly the "silent failure at 4:30pm" you want to avoid.
- **Three users cleanly.** One service account impersonates each of the three in turn — no three separate token dances.
- **Least privilege:** grant only the **read-only** scope `https://www.googleapis.com/auth/calendar.readonly` (or `calendar.events.readonly`) in the Admin console DWD config.
## Item 4 — Google Chat delivery (Confidence: HIGH)
- **POST** to `https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=KEY&token=TOKEN`
- Body is JSON; **`cardsV2` is supported via webhooks** (cards v1 is deprecated — use v2). Plain `{ "text": "..." }` works for the simplest message; `cardsV2` with sections, headers, and decorated text gives the on-brand, structured look (designer names as section headers, hour figures as key/value rows, a colored header for "all sorted" vs "needs attention").
- **No OAuth/SDK needed** — the `key`+`token` in the URL are the auth. Store the whole webhook URL as a single secret (`GCHAT_WEBHOOK_URL`); never commit it.
- **Rate limit:** ~1 request/second per space — irrelevant for one nightly post.
## Item 5 — LLM on Claude Pro, unattended: VERDICT (this is the load-bearing finding)
### Verdict: **CONDITIONAL NO-GO for a free, durable, set-and-forget LLM. Ship the deterministic templated renderer as the real v1; treat the LLM as an optional, manually-maintained enhancement.** (Confidence: HIGH on the facts; the recommendation is opinionated.)
- `claude setup-token` *does* work on **Pro** (not Max-only) and emits a `CLAUDE_CODE_OAUTH_TOKEN` (`sk-ant-oat01-...`). The `anthropics/claude-code-action@v1` accepts `claude_code_oauth_token:` in place of `anthropic_api_key:`, and the action *can* run on a pure `schedule:` cron with a `prompt:` (no `@claude` mention needed). So far, viable.
- **But** these tokens are short-lived — access token ~8 hours, practical validity ~1 day — and there is a well-documented open issue (`anthropics/claude-code-action#727`, plus `claude-code#38813`, `#31095`) that the **refresh token is not used in ephemeral CI**: GitHub runners are recreated each run, so a refreshed token can't be persisted. The token simply goes stale and the nightly job **fails silently** after roughly a day. Workarounds (storing a PAT to rewrite the secret, third-party `claude-code-login` actions) exist but are brittle, unofficial, and exactly the kind of fragile machinery you do not want under a "never silently skip a night" requirement. As of the research date there is no official refresh support.
- Anthropic's billing change effective **15 June 2026** moves *all programmatic/headless subscription usage — explicitly listing Claude Code GitHub Actions, `claude -p`, and the Agent SDK* — **off** your normal Pro chat limits and **onto a separate metered "Agent SDK credit" pool: $20/month for Pro, billed at full API rates, no rollover.** Interactive Claude Code in a terminal and claude.ai chat are unaffected — but a scheduled GitHub Action is precisely the metered category. When the $20 credit is exhausted, requests are **rejected** unless you opt in to "usage credits," which then bills at API rates.
- **Implication:** the project's stated "effectively zero ongoing cost" and "no new per-use billing" constraints are no longer satisfiable by the Pro-subscription LLM route after 15 June 2026. The route doesn't *technically* require an API key (so it threads the "org blocks API-key creation" needle), but it now consumes a metered, capped, potentially-billable credit pool tied to Liam's personal Pro subscription. Today is 2 June 2026 — you would be building directly into this transition.
- Using Anthropic's **official** Claude Code CLI / GitHub Action under a subscription is *allowed* — Anthropic's enforcement in Jan 2026 targeted *third-party* tools (OpenClaw, etc.) that extracted OAuth tokens into their own API clients, not first-party Claude Code. So the *mechanism* is permitted.
- The grayer points: it runs **unattended for a business automation** on a **personal Pro subscription** under Consumer Terms; and it bills to **Liam's personal** subscription/credit for company work. Neither is clearly prohibited for first-party Claude Code, but it's not a clean commercial footing. For a sanctioned business tool, the clean answer is a commercial API key — which the org has blocked, which is the whole reason we're here.
## Item 6 — Secrets & config (Confidence: HIGH)
- **Secrets → GitHub Actions encrypted repository secrets** (Settings → Secrets and variables → Actions). Referenced as `${{ secrets.NAME }}` and injected as env vars. Encrypted at rest, masked in logs. Required secrets:
- **Non-secret config → committed file** (`config.ts` or `config.json`): the three designer person IDs + calendar emails, the 7.5h target, the meeting ignore-list (WIP / creative-team titles), the target Chat space, timezone. Keeping this in-repo (not in secrets) makes it reviewable and version-controlled; only credentials go in secrets.
- **Local dev:** `.env` (gitignored) loaded by `dotenv`, mirroring the secret names so `process.env.X` works identically locally and in CI.
- **Run config:** `schedule:` cron in the workflow (note: GitHub cron is **UTC** — convert 4:30pm local accordingly, and weekday-only via the cron day-of-week field) **plus** `workflow_dispatch:` so Liam can trigger a manual test run from the Actions tab. Beware: GitHub scheduled workflows can be delayed under load and are disabled after 60 days of repo inactivity — acceptable here, but worth noting.
## Installation
# Project init
# Core deps
# Dev deps
# Run locally
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Node.js + TypeScript | Python + `google-api-python-client` + `requests` | If Liam already knows Python — prior familiarity beats TS's type guardrails for a first project. Equally well-supported for all three APIs. |
| Native `fetch` for Productive | `axios` / `got` / `productive-client` wrapper | Never needed here; only if you outgrow simple GET + pagination. The community `productive-client` is unmaintained — avoid. |
| Service account + DWD (Calendar) | OAuth 2.0 refresh token | Only if you can't get Workspace-admin DWD approval. Downsides: human consent, silent revocation risk, refresh-token storage — worse for unattended. |
| Incoming webhook (Chat) | Chat app / bot (app auth) | Only if you later need two-way interaction (replies, slash commands, queries). |
| Gmail API (if email added) | SMTP + app password | Only if there's a hard reason not to reuse the Google service account. SMTP is the weaker option in a Workspace org. |
| Deterministic template renderer | LLM via Claude Code Action on Pro | LLM only as a swappable enhancement, accepting daily-token fragility + the post-15-Jun-2026 $20/mo metered Pro credit. Prefer a sanctioned commercial API key if the org ever allows one. |
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
## Stack Patterns by Variant
- Wrap it behind `renderMessage(data) → string` with a try/catch that falls back to the template on any auth/timeout failure, AND emits the degraded-mode note so a dead token can't cause a silent no-post.
- Add a lightweight token-staleness signal (e.g. job annotation / a one-line "LLM auth failed, used template" in the Chat message) so the ~daily token refresh isn't discovered by absence.
- Fall back to a single OAuth client + stored refresh token for the three calendars (all three must consent once). Store the refresh token as a secret. Accept silent-revocation risk and add an auth-failure → degraded-message path.
- Reuse the Google service account; add `gmail.send` scope to the DWD config and impersonate a sending address. No new credential type.
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Node 22 LTS | `googleapis ^173`, `tsx ^4`, `typescript 5.x` | All current and mutually compatible as of 2026-06. |
| `googleapis ^173` | Google Calendar API v3 | Service-account JWT + DWD `subject` impersonation supported natively. |
| `luxon ^3` | `@types/luxon` | Pair the types; Luxon ships none bundled. |
| `anthropics/claude-code-action@v1` | `CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max) OR `ANTHROPIC_API_KEY` | OAuth token short-lived; v1 auto-detects schedule/prompt vs @claude trigger. |
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
