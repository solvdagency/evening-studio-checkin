# Architecture Research

**Domain:** Nightly scheduled data-gather → compute → LLM-render → deliver pipeline (unattended cron job, no server)
**Researched:** 2026-06-02
**Confidence:** HIGH on pipeline structure and component boundaries; MEDIUM on the unattended Claude-on-Pro auth route (officially supported via `claude setup-token` but the policy around subscription-backed automation has shifted twice in 2026, so treat it as a swappable dependency).

## Standard Architecture

This is a **batch ETL-with-judgment pipeline**, not a service. The whole program is one short-lived process: it wakes, gathers, computes, renders, delivers, exits. The right shape is a **layered pipeline with a pure functional core and an imperative shell** ("functional core, imperative shell"). All I/O (APIs, LLM, chat) lives at the edges; all logic (the hour math, the flagging rules) lives in the middle as pure functions that take data and return data.

This matters for your trust requirement: the arithmetic is the core, it has no network and no LLM, so it is fully testable and deterministic. The LLM and the three APIs are all edge adapters you can stub.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     IMPERATIVE SHELL (orchestration)                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  entrypoint / scheduler  (GitHub Actions cron → main())         │  │
│  │  - resolves "today", target window, timezone                    │  │
│  │  - runs the pipeline, catches failures, guarantees a post       │  │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                     GATHER (edge adapters — I/O)                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ productive-client│  │ calendar-client  │  │  clock / window  │    │
│  │ bookings, tasks, │  │ 3 designers'     │  │  next working    │    │
│  │ briefed, time-off│  │ events in window │  │  day + week math │    │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘    │
│           │  (typed domain objects, each can fail independently)      │
├───────────┴─────────────────────┴─────────────────────┴──────────────┤
│                     COMPUTE (pure functional core)                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  analyzer  — pure functions, no I/O, no LLM, fully deterministic │  │
│  │  • capacity-after-timeoff   • booked-vs-available               │  │
│  │  • week-remaining studio total  • brief/booking presence check  │  │
│  │  • rule-based meeting-reconciliation candidates (pre-filter)    │  │
│  │  → produces a single typed StudioReport (all numbers final)     │  │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                     RENDER (swappable behind ONE interface)            │
│  ┌──────────────────────┐        ┌──────────────────────────────┐    │
│  │ template-renderer     │  OR    │ llm-renderer                 │    │
│  │ deterministic strings │ ◄────► │ judgment + on-brand prose    │    │
│  │ (fallback, always ok) │        │ (gets StudioReport, never    │    │
│  │                       │        │  raw numbers to add up)      │    │
│  └──────────────────────┘        └──────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────────┤
│                     DELIVER (edge adapters — I/O)                      │
│  ┌──────────────────────┐        ┌──────────────────────────────┐    │
│  │ chat-notifier (primary)│       │ gmail-notifier (optional)    │    │
│  └──────────────────────┘        └──────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Boundary rule |
|-----------|----------------|---------------|
| `entrypoint` / scheduler | Resolve "now" → target window; run pipeline; on any failure still produce + deliver a degraded message; set process exit code | Only place allowed to know about the wall clock, env vars, and "the job ran". Knows the order of steps; knows nothing about *how* each step works. |
| `clock` / window resolver | Pure: given a trigger instant + timezone, return `{ targetDay, isFridayLookahead, weekRemainingDays }` | Pure function. The one timezone decision lives here so tests can pin "now". |
| `productive-client` | Call Productive API; map raw JSON → typed `Booking[]`, `TimeOff[]`, task/briefed flags. No business logic. | Returns domain objects or a typed failure. Never computes hours. |
| `calendar-client` | Call Google Calendar for 3 calendars in the window; map → typed `Meeting[]`. Knows which recurring meetings to drop (WIP, creative-team) by rule. | Returns domain objects or a typed failure. |
| `analyzer` | All arithmetic + rule logic. Pure functions only. Produces one immutable `StudioReport`. | No network, no LLM, no `Date.now()`, no env reads. This is the trust boundary. |
| `renderer` (interface) | Turn a `StudioReport` into a `RenderedMessage` (text/blocks). Two implementations. | The interface receives only the finished report. Numbers are already strings/values, never operands. |
| `notifier` (interface) | Deliver a `RenderedMessage`. Chat impl + Gmail impl. | Returns delivery success/failure; does not format. |

## Recommended Project Structure

```
src/
├── main.ts                  # entrypoint: wire everything, guarantee a post, exit code
├── clock.ts                 # pure window/timezone logic (next working day, week-remaining)
├── domain/
│   └── types.ts             # Booking, TimeOff, Meeting, Designer, StudioReport, RenderedMessage
├── gather/
│   ├── productive-client.ts # API → Booking[]/TimeOff[]; returns Result<T>
│   ├── calendar-client.ts   # API → Meeting[]; drops known overhead meetings
│   └── fixtures/            # recorded API responses for tests + dry runs
├── analyze/
│   ├── capacity.ts          # available-after-timeoff, booked-vs-available
│   ├── week.ts              # studio rest-of-week total
│   ├── briefs.ts            # booking has task? marked briefed?
│   ├── meetings.ts          # rule-based reconciliation candidates (pre-filter)
│   └── report.ts            # assembles the single StudioReport
├── render/
│   ├── renderer.ts          # the Renderer interface + a chooser (llm w/ fallback)
│   ├── template-renderer.ts # deterministic strings (always works)
│   └── llm-renderer.ts      # builds prompt from StudioReport, calls Claude, validates
├── deliver/
│   ├── notifier.ts          # Notifier interface
│   ├── chat-notifier.ts     # Google Chat (primary)
│   └── gmail-notifier.ts    # optional
└── observability/
    └── log.ts               # structured run log (single JSON line per run is enough)
.github/workflows/
└── checkin.yml              # cron 1-5 weekdays, sets CLAUDE_CODE_OAUTH_TOKEN, runs main
```

### Structure Rationale

- **`analyze/` is isolated and import-pure:** nothing in it imports from `gather/`, `render/`, or any SDK. Enforce this with a lint rule or a dependency-direction test. It is the only code your team needs to *trust*, so it must be the easiest code to read and test.
- **`gather/` and `deliver/` are thin adapters:** each maps an external shape to/from your domain types. Keeping mapping here (not in the analyzer) means a Productive API change touches one file.
- **`render/` hides the LLM entirely behind an interface:** `main.ts` calls `renderer.render(report)` and does not know or care whether the LLM ran. This is what makes the LLM truly optional and the templated fallback a first-class path.
- **One `domain/types.ts`:** the contracts between layers are the types. Get these right early; they are the cheapest thing to change before code exists and the most expensive after.

## Architectural Patterns

### Pattern 1: Functional core, imperative shell

**What:** Pure compute (`analyze/`, `clock`) in the middle; all I/O (`gather/`, `render/llm`, `deliver/`) at the edges; `main.ts` is the only orchestrator.
**When to use:** Any pipeline where correctness of the core matters and the edges are flaky (APIs, LLM). This is exactly your trust requirement.
**Trade-offs:** Slightly more files and a couple of mapping layers. The payoff is that the numbers are testable with zero mocks and the flaky parts are swappable.

**Example:**
```typescript
// main.ts — imperative shell
const window = resolveWindow(now(), "Australia/Brisbane");
const productive = await productiveClient.fetch(window);   // Result<…>
const calendar   = await calendarClient.fetch(window);     // Result<…>

const report = buildReport({ window, productive, calendar }); // PURE, always succeeds
const message = await renderer.render(report);                // llm or template
await notifier.deliver(message);
```

### Pattern 2: Swappable renderer behind one interface (Strategy)

**What:** A single `Renderer` interface with two implementations. The shell holds *one* of them; a tiny chooser decides which.
**When to use:** When you have a preferred-but-fragile implementation (LLM-on-Pro) and a guaranteed fallback (template).
**Trade-offs:** You must define the interface narrowly — the LLM renderer must not need anything the template renderer can't also do. That constraint is healthy: it forces all numbers to be pre-computed.

**Example:**
```typescript
interface Renderer {
  render(report: StudioReport): Promise<RenderedMessage>;
}

// chooser: prefer LLM, fall back to template on ANY failure
async function render(report: StudioReport): Promise<RenderedMessage> {
  if (LLM_ENABLED) {
    try { return await llmRenderer.render(report); }
    catch (e) { log.warn("llm_render_failed", e); }
  }
  return templateRenderer.render(report);   // never throws
}
```
The key design rule: `StudioReport` carries **finished facts**, not operands. The LLM renderer receives `{ designer: "Sam", availableHours: 7.5, bookedHours: 4.0, openHours: 3.5, status: "underbooked" }` — every number already computed. It is asked to choose words and tone, never to subtract.

### Pattern 3: Two-stage LLM step — decide, then write

**What:** Split the LLM work into (a) a *judgment* call that classifies each ad-hoc meeting as `accounted | unaccounted | ambiguous` against the candidate pairings the analyzer pre-filtered, returning **structured output only** (JSON/tool schema), and (b) a *writing* call (or the same call's second field) that turns the now-final picture into prose.
**When to use:** Whenever an LLM both decides something and writes about it. Mixing the two in one free-text prompt is where hallucinated numbers and inconsistent flags come from.
**Trade-offs:** Slightly more prompt plumbing. The win: the judgment is captured as data you can log, validate, and even feed to the *template* renderer if the writing step fails. The analyzer does the cheap, obvious reconciliations by rule; the LLM only adjudicates the genuinely fuzzy residue.

**Example:**
```typescript
// Stage 1: judgment — constrained, structured, no prose
// input: candidate pairs the analyzer couldn't resolve by rule
// output (validated against a schema):
[{ meetingId: "m12", verdict: "unaccounted", confidence: "high",
   reason: "1h client call, no booking overlaps its time" }]

// Analyzer/shell merges verdicts back into the report → finalReport
// Stage 2: writing — gets finalReport (all verdicts now facts), returns text only
```
If Stage 1 output fails schema validation, treat it as a renderer failure and fall back — you still post, just with the templated voice.

### Pattern 4: Degraded mode via Result types (never throw across the gather boundary)

**What:** Each gather client returns a `Result<T>` (`{ ok: true, data }` or `{ ok: false, error, source }`). The analyzer accepts partial input and records which sources were missing in the `StudioReport`.
**When to use:** Any unattended job that must always produce output even on partial failure.
**Trade-offs:** A little ceremony at the boundaries. It is the mechanism that satisfies "never silently skip a night."

**Example:**
```typescript
buildReport({
  productive: { ok: false, source: "productive", error: "401" },
  calendar:   { ok: true,  data: meetings },
})
// → StudioReport { degraded: ["productive"], … whatever could be computed … }
// renderer says: "Heads up — couldn't reach Productive tonight, so hours are unverified.
//                 Calendar looked clear of unaccounted meetings."
```

## Data Flow

### Run flow (single pass, top to bottom, ~once per weekday)

```
GitHub Actions cron (UTC) fires
    ↓
main()  →  resolveWindow(now, tz)                  → { targetDay, fridayLookahead, weekDays }
    ↓
   ┌── productiveClient.fetch(window)  ──┐  (parallel; each returns Result, never throws)
   └── calendarClient.fetch(window)   ──┘
    ↓
buildReport(window, productiveResult, calendarResult)   ← PURE: all hours + flags computed here
    ↓                                                     ← records degraded[] if a source failed
[optional] llmRenderer.judge(report.meetingCandidates)  → verdicts (structured, validated)
    ↓                                                       merge verdicts → finalReport
renderer.render(finalReport)   →  llm prose  OR  template strings  (fallback on any failure)
    ↓
notifier.deliver(message)  → Google Chat  (then optional Gmail)
    ↓
log one structured line { ran, window, degraded[], renderer: "llm"|"template", delivered }  → exit
```

### The time-window logic (your question 4)

Resolve everything once, in `clock.ts`, from a single injected `now`:

- **Trigger:** GitHub cron is **UTC only** — there is no timezone field. Pick the UTC expression that lands ~4:30pm studio-local and accept that you must change it across DST, *or* (cleaner) set the cron a safe margin earlier and gate inside the job. Given Brisbane (no DST) this is simple; if the studio is in a DST zone, prefer running the job a bit early and computing the window from the studio timezone in code so wall-clock correctness lives in `clock.ts`, not the cron string.
- **Next working day:** Mon–Thu → tomorrow. **Fri → Monday** (skip the weekend). No weekend runs at all (`cron: '… 1-5'`, the range, not `1,5`).
- **Rest-of-week studio view:** from `targetDay` through Friday of the current week, sum the 3 designers' available hours (7.5 × days − time-off) and subtract booked → "X of Y studio hours still open."
- **Single source of "now":** `main` reads the clock once and passes the instant into `resolveWindow`. Nothing else calls `Date.now()`. This makes "what would Friday's message say?" a pure, testable question.

### Idempotency / duplicate posts

GitHub cron can occasionally double-fire or you may re-run manually. Make a duplicate cheap to avoid:
- **Stamp the message** with the target-day date and post a stable run key. Simplest viable guard: include the resolved `targetDay` in a hidden marker and have the chat step skip if a message with that key already posted today — or accept at-least-once and make the message clearly dated so a rare double looks harmless. For v1, a dated message + manual-rerun awareness is enough; a persisted "last posted day" (committed to the repo or a tiny gist/state file) is the upgrade if doubles become annoying.

## Scaling Considerations

This project does not scale on users — it scales on *data volume and run frequency*, both tiny. The honest table:

| Scale | Architecture adjustments |
|-------|--------------------------|
| 3 designers, 1 run/weekday (today) | Single process, parallel fetch, no persistence. The whole thing finishes in seconds. |
| Whole agency / multiple teams | Parameterize the designer set + calendars; the pure core is unchanged. Still one run. |
| Many runs/day or multiple studios | Only then consider a state store for idempotency and a queue. Not now. |

### Scaling priorities (what actually breaks first)

1. **API rate limits / pagination**, not compute. Productive bookings + 3 calendars over a window is small, but handle pagination in the clients from day one.
2. **The Claude-on-Pro auth route**, not load. The `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` is valid ~1 year and the Agent SDK gets a fixed monthly subscription credit (from 15 Jun 2026, $20/mo on Pro). Token expiry and the monthly credit ceiling are your real operational risks — both are *handled by the templated fallback*, which is why the renderer must be swappable.

## Anti-Patterns

### Anti-Pattern 1: Letting the LLM see raw numbers and "do the math"

**What people do:** Dump bookings and time-off into the prompt and ask the model to compute available hours.
**Why it's wrong:** LLMs do arithmetic unreliably; one wrong total and the team stops trusting the whole message — your explicit failure mode.
**Do this instead:** Compute every number in `analyze/`. The LLM receives finished figures and only chooses words. The renderer interface should make it structurally hard to pass operands.

### Anti-Pattern 2: Throwing on partial failure (so the night goes silent)

**What people do:** `await fetch()` that throws, an uncaught error, the job dies, nothing posts.
**Why it's wrong:** Violates "never silently skip a night" — and a silent unattended job is the worst kind of broken because no one notices for days.
**Do this instead:** `Result` types at gather boundaries; `buildReport` tolerates missing sources; the chooser falls back to template on render failure; `main` wraps the whole thing and posts a degraded message on truly unexpected errors. The only acceptable no-post is the scheduler itself never firing.

### Anti-Pattern 3: Business logic creeping into the API clients

**What people do:** Compute "underbooked" inside `productive-client` because the data is right there.
**Why it's wrong:** Splits the trust boundary across files, makes the math untestable without mocking HTTP, and couples logic to API shape.
**Do this instead:** Clients only map JSON → domain types. All judgement lives in `analyze/`.

### Anti-Pattern 4: Reading the clock everywhere

**What people do:** `new Date()` sprinkled through analyzer and renderer.
**Why it's wrong:** Makes "next working day" and "Friday → Monday" untestable and timezone bugs invisible.
**Do this instead:** One clock read in `main`, passed down. `clock.ts` owns all date math.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Productive.io API | REST from `productive-client`; token in GH secret; map to domain types; handle pagination | Source of truth for capacity + time-off + briefed flag. One bad schema assumption breaks hours — pin to recorded fixtures in tests. |
| Google Calendar API | Service-account or OAuth; read 3 calendars over the window; drop known recurring overhead (WIP, creative-team) by rule in the client | Verify auth route for unattended access (service account with domain-wide delegation is the usual headless answer). |
| Claude (LLM) via Pro subscription | `claude setup-token` → 1-year `CLAUDE_CODE_OAUTH_TOKEN` as a GH secret; Agent SDK / Claude Code in headless mode reads it | **Officially supported for CI as of 2026**, but Anthropic changed subscription-automation policy twice in 2026 (blocked third-party harnesses Apr 2026; introduced a dedicated monthly Agent SDK credit 15 Jun 2026). MEDIUM confidence it stays stable — which is *exactly* why it sits behind the swappable interface with a template fallback. Token expires (~1yr) → renew is a manual op; log loudly when LLM render is skipped. |
| Google Chat | Webhook (simplest) or Chat app | Webhook URL in GH secret. Webhook = no app review, fine for one-way posts. |
| Gmail | Optional; same Google auth as Calendar | Defer to a later phase. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| shell ↔ gather clients | direct call returning `Result<DomainType>` | Clients never throw across this line. |
| gather → analyzer | plain domain objects (no SDK types) | Mapping done in clients; analyzer is SDK-agnostic. |
| analyzer → renderer | one immutable `StudioReport` (finished facts only) | The numbers contract. No operands cross here. |
| renderer ↔ LLM | structured judgment in/out + validated; prose out | Two-stage: decide (schema) then write. Validation failure → fallback. |
| renderer → notifier | `RenderedMessage` (text/blocks) | Notifier never formats. |

## Suggested Build Order (dependencies → phase structure)

Build inside-out: the trustworthy core first (provable with fixtures, no live APIs, no LLM), then the edges, then the optional intelligence. This means you have a *working, posting* automation before you ever touch the LLM.

1. **Domain types + clock + analyzer (pure core).** No network, no LLM. Hand-written fixture `Booking[]`/`TimeOff[]`/`Meeting[]` in, `StudioReport` out. Unit-testable to exhaustion. *Delivers: trustworthy math, the heart of the product.*
2. **Template renderer + chooser interface.** Turn a `StudioReport` into a readable message deterministically. *Delivers: a real message from fixtures, end-of-pipeline shape locked.*
3. **Productive client + Calendar client (gather).** Replace fixtures with live data; record real responses as new fixtures. Wire `main` for the happy path. *Delivers: a real message from real data, run locally.*
4. **Chat notifier + entrypoint/cron + degraded mode + dry-run flag.** Now it posts, on schedule, weekdays, and posts a degraded message on partial failure. *Delivers: the shippable v1 — full value with the templated voice, LLM not yet involved.*
5. **LLM renderer (judgment + writing) behind the existing interface.** Add `claude setup-token` auth, the two-stage decide-then-write step, schema validation, and fallback-on-failure. The pipeline already works without it, so this is a pure upgrade that can't break the night. *Delivers: the on-brand voice and fuzzy meeting reconciliation.*
6. **Gmail notifier + idempotency hardening + observability polish.** Optional channel, duplicate-post guard, structured run log. *Delivers: nice-to-haves.*

The critical insight for phasing: **steps 1–4 are a complete, shippable product** using only deterministic code. The LLM (step 5) is genuinely optional, which de-risks the most uncertain dependency (Claude-on-Pro auth) by making it the *last* thing you add, on top of something that already works.

## Sources

- Use the Claude Agent SDK with your Claude plan — Claude Help Center: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan (HIGH — official; confirms subscription-backed Agent SDK + GitHub Actions, monthly credit from 15 Jun 2026)
- anthropics/claude-code-action setup docs (`claude setup-token`, `CLAUDE_CODE_OAUTH_TOKEN`): https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md (HIGH — official; 1-year OAuth token for CI/headless)
- Claude Code authentication docs: https://code.claude.com/docs/en/authentication (HIGH — official)
- GitHub Actions cron timezone/UTC + weekday range + best-effort delays: https://github.com/orgs/community/discussions/13454 and https://cronbuilder.dev/blog/github-actions-cron-schedule.html (MEDIUM — community + reference; UTC-only, 1-5 weekday range, 5–30 min drift, 60-day inactivity auto-disable)
- "Functional core, imperative shell" (Gary Bernhardt) — established pattern, training-data backed (HIGH for the pattern itself)

---
*Architecture research for: nightly scheduled gather → compute → LLM-render → deliver pipeline*
*Researched: 2026-06-02*
