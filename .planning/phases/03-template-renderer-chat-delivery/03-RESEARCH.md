# Phase 3: Template Renderer & Chat Delivery - Research

**Researched:** 2026-06-03
**Domain:** Google Chat Cards v2 rendering + incoming-webhook delivery + GitHub Actions scheduling (Node 22 / TypeScript)
**Confidence:** HIGH on platform mechanics; HIGH on the deterministic-renderer architecture; MEDIUM on a few exact Cards-v2 typographic behaviours (Google's own docs are thin on label font-size, but the behaviour is corroborated by the API reference + the live HTML mockup, which is the binding visual contract anyway).

## Summary

The design is locked; this phase is pure mechanics + mapping. The good news is that almost everything resolves cleanly and three of the seven flagged unknowns turned out simpler than feared:

1. **Cron/DST is now trivial.** As of GitHub Actions' **late-March-2026 update (GA)**, the `schedule:` trigger accepts a native IANA `timezone:` field with automatic DST handling. A single `cron: '30 16 * * 1-5'` + `timezone: "Australia/Sydney"` posts at 4:30pm Sydney all year with no UTC math and no dual-cron. We still recommend a cheap in-code studio-tz guard as defence-in-depth (scheduled runs can be delayed; a delayed run must still target the right day and never fire on a weekend).
2. **The webhook POST is one `fetch` with a JSON `cardsV2` body.** No SDK, no OAuth — the secret URL carries auth. Errors come back as HTTP 4xx/5xx with a `google.rpc.Status` body, which the degrade-don't-throw wrapper checks via `res.ok`.
3. **The deep-link is well-formed.** `NzQ5NTY2` base64-decodes to exactly `749566` (matches D-24), and the `app.productive.io/.../scheduling/bookings` path is a real app route. Format `date` as `YYYY-MM-DD` (it already is — `report.targetDay`).

The Cards v2 mapping confirms D-09's instinct: `decoratedText`'s `topLabel`/`bottomLabel` are **fixed small-caption** fields that you cannot resize, so the greyed detail lines MUST live in the main `text` (body-size) with `<br>` + `<font color="#5f6368">`, exactly as D-09 says. There is no background/highlight and no custom-font support, matching D-02/D-03. Roboto Mono is NOT guaranteed to render in card text — the only reliable monospace is the `<code>`/`<pre>` tags, so the D-23 dot-bar should use `<code>…</code>` (or accept proportional Roboto), not a Roboto-Mono `<font>`.

**Primary recommendation:** Build a single pure `renderMessage(report, ctx) → CardsV2Payload` in a new `src/render/` layer that consumes `StudioReport` + the degraded/holiday/brief inputs (never `src/productive` raw types), plus a thin `postToChat(payload)` in `src/chat/` that wraps one `fetch`. Compose them behind a never-throwing `runNightly()` entrypoint. Schedule with the native `timezone:` cron + an in-code guard. Test the renderer by `assert.deepStrictEqual` against committed expected-JSON fixtures (one per mockup scenario) — not `node:test`'s experimental snapshot API.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Render `StudioReport` → card JSON | Pure domain/render module (`src/render/`) | — | Deterministic, no I/O; mirrors the Phase-1 trust boundary. Must be unit-testable without network. |
| Deliver card to Google Chat | Delivery/transport (`src/chat/`) | — | Single side-effecting `fetch`; isolated so the renderer stays pure and the post is independently mockable. |
| Decide degraded vs clean vs holiday variant | Render module (reads `sourceErrors`/`missingDesigners`/holiday) | Composition root | Variant selection is presentation logic, not arithmetic — but the *inputs* come from gather/report. |
| Schedule the run (weekday 4:30pm) | CI / GitHub Actions (`.github/workflows/`) | In-code clock guard (`src/domain/clock.ts`) | Cron triggers; the studio-tz guard is the authoritative weekday/day gate (trust posture: never post on the wrong day). |
| Total-failure alert | CI / GitHub Actions built-in failed-run email | — | Only channel that works when the job can't reach Chat (D-25). |
| Compose gather → report → render → post | Composition root (`src/index.ts` / `src/runNightly.ts`) | — | Wires the layers; owns the degrade-don't-throw try/catch and process exit code. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (native `fetch`) | built into Node 22.22 | POST the card to the webhook | The webhook is one POST with one header; axios/got are unneeded (CLAUDE.md "What NOT to Use"). `[VERIFIED: codebase — Node v22.22.1]` |
| `luxon` | `^3.7.2` (installed) | Studio-tz "now" + weekday/target-day guard in code | Already the project's date library; `src/domain/clock.ts` consumes it. `[VERIFIED: package.json]` |
| TypeScript | `~5.9.3` (installed) | Type the card payload + renderer interface | Project standard. `[VERIFIED: package.json]` |
| `tsx` | `^4.22.4` (installed) | Run the entrypoint in CI with no build step | `node --import tsx src/index.ts` in the workflow. `[VERIFIED: package.json]` |
| GitHub Actions | hosted | Weekday 4:30pm schedule + manual dispatch | Free, secrets built in, built-in failure email. `[VERIFIED: CLAUDE.md]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `node:assert/strict` | built into Node 22 | Unit-test the renderer against expected card JSON | Already the project's test runner (`package.json` `test` script). Use `assert.deepStrictEqual`. `[VERIFIED: package.json]` |
| `dotenv` | `^17.4.2` (dev) | Load `GCHAT_WEBHOOK_URL` locally | `import 'dotenv/config'` for local dry-runs; no-op in CI. `[VERIFIED: package.json]` |

**No new dependencies are required for this phase.** Everything is native Node + the existing stack.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written card JSON object | `chriseaton/google-chat-cards` builder npm pkg | Adds a dependency for what is a handful of plain object literals; the card shape is small and stable. Avoid — hand-roll the typed object. `[ASSUMED — package exists but unnecessary]` |
| `assert.deepStrictEqual` vs committed JSON | `node:test` `t.assert.snapshot` | Snapshot API is **experimental** (`--experimental-test-snapshots`) with documented `util.inspect` drift between Node versions → false positives. For trust-critical JSON, explicit expected fixtures are more stable and reviewable. `[CITED: github.com/nodejs/node/issues/44466]` |
| Native `timezone:` cron | Dual-cron (AEST+AEDT) + in-code gate | Dual-cron was the pre-March-2026 workaround. Native `timezone:` is GA and DST-aware — simpler. Keep the in-code guard regardless. `[VERIFIED: docs.github.com]` |

**Installation:** None — no packages to install.

## Package Legitimacy Audit

> No external packages are installed in this phase. The audit is N/A. The one package *mentioned* (`chriseaton/google-chat-cards`) is explicitly **not recommended** and must not be added.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none — phase adds no dependencies) | — | N/A |

slopcheck was not run because no packages are being installed.

## Architecture Patterns

### System Architecture Diagram

```
GitHub Actions cron (timezone: Australia/Sydney, 30 16 * * 1-5)
        │  also: workflow_dispatch (manual)
        ▼
  src/index.ts  (runNightly entrypoint)
        │  injects now = DateTime.now() in STUDIO_ZONE
        ▼
  ┌─ in-code studio-tz guard ─────────────────────────┐
  │  isWorkingDay(today)? AND ~16:30 window?           │
  │  NO  → log "off-schedule, skipping" → exit 0       │
  │  YES → continue                                    │
  └────────────────────────────────────────────────────┘
        ▼
  gather(deps)  ──────────────►  { bookings, absences, briefFlags,
   (src/productive)                holidays, assessedDesigners, sourceErrors }
        ▼
  computeStudioReport(input) ──►  StudioReport
   (src/domain)                   { targetDay, window, designers[], rollup, missingDesigners }
        ▼
  renderMessage(report, ctx) ──►  CardsV2Payload   ◄── ctx = { sourceErrors, briefFlags,
   (src/render — PURE)             (variant chosen          holidayTomorrow?, closureTomorrow? }
        │                          here: clean / busy /
        │                          degraded / per-miss /
        │                          holiday / closure)
        ▼
  postToChat(payload)  ────────►  POST GCHAT_WEBHOOK_URL  (one fetch)
   (src/chat)                     │
        │                         ├─ res.ok        → done, exit 0
        ▼                         └─ !res.ok / throw → log + rethrow
  any uncaught error in the whole chain
        │  (degrade-don't-throw applies to DATA-source failures via sourceErrors;
        │   a TOTAL failure that can't post is allowed to fail the JOB)
        ▼
  process exits non-zero  ──►  GitHub Actions built-in failed-run email (D-25 / REL-02)
```

The split is deliberate: **data-source failures degrade into a posted message** (REL-01 — gather already accumulates `sourceErrors`, and the renderer turns them into the 🤖 degraded card). A **total failure that prevents posting at all** (e.g. webhook 500, malformed secret, network down) is allowed to crash the job so the GitHub failure email fires (REL-02). These are two different reliability requirements and must not be conflated.

### Recommended Project Structure
```
src/
├── index.ts              # NEW — runNightly composition root + studio-tz guard
├── render/
│   ├── renderMessage.ts  # NEW — renderMessage(report, ctx) → CardsV2Payload (PURE, the LLM-01 interface)
│   ├── variants.ts       # NEW — variant selection (clean/busy/degraded/holiday/closure/per-miss)
│   ├── verdict.ts        # NEW — nameless verdict line (D-12/D-13)
│   ├── rows.ts           # NEW — per-designer decoratedText rows + nested ⚠️/📄 lines (D-09/D-14/D-16)
│   ├── weekBar.ts        # NEW — dot-bar footer (D-23)
│   ├── cards.ts          # NEW — CardsV2Payload TypeScript types
│   └── __tests__/
│       ├── renderMessage.test.ts
│       └── fixtures/             # committed expected card JSON, one per scenario
├── chat/
│   └── postToChat.ts     # NEW — fetch wrapper, returns Result<void>
├── config.ts             # EXTEND — add avatar PNG URL, Productive deep-link template, brand colours
├── domain/  (unchanged — must not import render/chat)
└── productive/ (unchanged)
.github/workflows/
└── nightly.yml           # NEW — schedule + workflow_dispatch
```

### Pattern 1: The swappable renderer interface (LLM-01 prep)
**What:** A single function type the templated renderer satisfies today and the Phase-5 LLM renderer will satisfy later.
**When to use:** Always — this is the contract MSG-* + LLM-01 hang off.
**Example:**
```typescript
// src/render/cards.ts
// Source: cardsV2 shape from developers.google.com/workspace/chat/api/reference/rest/v1/cards
export interface CardsV2Payload {
  cardsV2: Array<{ cardId: string; card: GoogleCard }>;
}

// src/render/renderMessage.ts
import type { StudioReport } from "../domain/report.ts";
import type { BriefFlag } from "../productive/brief.ts"; // a domain-shaped flag, not a raw API type

/** Everything the renderer needs that is NOT in StudioReport. */
export interface RenderContext {
  /** Display names + deep-link metadata keyed by DesignerId (from config, not API). */
  designerNames: Record<string, string>;
  /** Non-empty ⇒ degraded variant (D-18). Verbatim source labels e.g. "Productive". */
  sourceErrors: string[];
  /** Per-designer brief problems (D-16). */
  briefFlags: BriefFlag[];
  /** Set when tomorrow is a public holiday (D-20) — short warm message, no rows. */
  holidayTomorrow?: { dateLabel: string };
  /** Set when tomorrow is a studio closure/offsite (D-21). */
  closureTomorrow?: { backDayLabel: string };
  /** Pre-formatted "Tomorrow · Thursday 4 June" subtitle + the YYYY-MM-DD for the deep-link. */
  header: { subtitle: string; targetDate: string };
}

/** The ONE interface. Templated renderer = this. Phase-5 LLM renderer = same signature. */
export type RenderMessage = (report: StudioReport, ctx: RenderContext) => CardsV2Payload;

export const renderTemplate: RenderMessage = (report, ctx) => { /* ... */ };
```
**Boundary note:** `BriefFlag` lives in `src/productive/brief.ts` but is a *domain-shaped* result type (no raw JSON:API shapes), so importing it into `src/render/` is acceptable. What `src/render/` must NOT import is `src/productive/schemas.ts`, `client.ts`, or raw response types. The CLAUDE.md rule is specifically `src/domain` must not import `src/productive`; the new `src/render/` layer sits *above* both and may consume both their output types. `[CITED: CLAUDE.md + 03-CONTEXT code_context]`

### Pattern 2: Per-designer row mapping (D-09 — the load-bearing one)
**What:** Each designer row is a `decoratedText` widget whose **main `text`** holds line 1 (emoji + name + coloured status) AND the greyed detail lines, separated by `<br>`. The nested ⚠️ tentative and 📄 brief lines are additional `<br>` lines in the **same** `text` (body size), NOT a `bottomLabel`.
**When to use:** Every busy-night designer row.
**Why:** `topLabel`/`bottomLabel` render in a **fixed small caption font that cannot be enlarged** (`topLabel` always truncates; `bottomLabel` always wraps). D-09 explicitly rejects the tiny `bottomLabel` — so all detail goes in `text` at body size, with hierarchy expressed by colour (`<font color="#5f6368">` grey) and weight (`<b>`), exactly as D-09 specifies. `[CITED: developers.google.com decoratedText — topLabel truncates / bottomLabel wraps, labels are fixed caption styling; corroborated by the live mockup]`
**Example (the underbooked-with-tentative row from the mockup):**
```json
{
  "decoratedText": {
    "startIcon": { "iconUrl": "https://…/dot-red.png" },
    "text": "<b>Anisha Gittins</b> — <font color=\"#d93025\">7.5h open</font><br><font color=\"#5f6368\">Nothing booked</font><br>⚠️ 3.5h tentative (on top) · <font color=\"#5f6368\">Dairy Farmers</font>",
    "wrapText": true
  }
}
```
> Mapping note: the mockup uses an emoji "ic" gutter (🔴🟢🟠⚪🤖). Two valid implementations — (a) keep the emoji **inline at the start of `text`** (simplest, guaranteed to render), or (b) use `startIcon.iconUrl` with hosted PNG dots. Emoji-inline is the lower-risk default and matches the mockup's literal characters. Leave the choice to the planner but recommend emoji-inline for the status marker since D-10 specifies emoji, not icons.

### Pattern 3: The week-bar footer (D-23)
**What:** A `textParagraph` (its own `section` with a header "Remaining studio time this week") containing the dot run + caption.
**Caveat — Roboto Mono is NOT guaranteed.** Card text renders in Google's font; there is no custom-font support and no way to force Roboto Mono on a `<font>`. The only monospace guarantee is the `<code>`/`<pre>` tags. The dot characters `●`/`○` are fixed-width-ish glyphs and will look fine in proportional Roboto, but if exact monospace alignment matters, wrap the bar in `<code>…</code>`.
**Example:**
```json
{
  "header": "Remaining studio time this week",
  "widgets": [
    { "textParagraph": { "text": "●●●<font color=\"#c9ccd1\">●●●●●●●</font>" } },
    { "textParagraph": { "text": "<font color=\"#5f6368\">12h booked · 33h open</font>" } }
  ]
}
```
`[ASSUMED — that ●/○ render acceptably in proportional Roboto; verify visually in the real Chat space during execution. The <code> fallback is the safe path.]`

### Pattern 4: Minimal full-card skeleton (hand to the executor)
```json
{
  "cardsV2": [
    {
      "cardId": "studio-checkin",
      "card": {
        "header": {
          "title": "Solvd Studio Check-in",
          "subtitle": "Tomorrow · Thursday 4 June",
          "imageUrl": "https://raw.githubusercontent.com/solvdagency/evening-studio-checkin/main/assets/avatar-asterisk.png",
          "imageType": "CIRCLE"
        },
        "sections": [
          { "widgets": [ { "textParagraph": { "text": "<b>Two designers have open time tomorrow.</b>" } } ] },
          { "widgets": [
              { "decoratedText": { "text": "🔴 <b>Anisha Gittins</b> — <font color=\"#d93025\">7.5h open</font><br><font color=\"#5f6368\">Nothing booked</font><br>⚠️ 3.5h tentative (on top) · <font color=\"#5f6368\">Dairy Farmers</font>", "wrapText": true } },
              { "divider": {} },
              { "decoratedText": { "text": "🔴 <b>Ella Wright</b> — <font color=\"#d93025\">3.0h open</font><br><font color=\"#5f6368\">4.5h booked</font><br>📄 Brief empty · <font color=\"#5f6368\">STR_050 · 4.5h</font>", "wrapText": true } },
              { "divider": {} },
              { "decoratedText": { "text": "🟢 <b>Liam Mills</b> — <font color=\"#188038\">full day</font><br><font color=\"#5f6368\">7.5h booked</font>", "wrapText": true } }
          ] },
          { "widgets": [ { "buttonList": { "buttons": [ { "text": "Open in Productive", "onClick": { "openLink": { "url": "https://app.productive.io/34092-solvd-agency/scheduling/bookings?date=2026-06-04&filter=NzQ5NTY2&groupBy=people" } } } ] } } ] },
          { "header": "Remaining studio time this week", "widgets": [
              { "textParagraph": { "text": "●●●<font color=\"#c9ccd1\">●●●●●●●</font>" } },
              { "textParagraph": { "text": "<font color=\"#5f6368\">12h booked · 33h open</font>" } }
          ] }
        ]
      }
    }
  ]
}
```
`[VERIFIED: structure against developers.google.com/workspace/chat/api/reference/rest/v1/cards; HTML subset against /format-messages; matches the mockup contract]`

### Pattern 5: The webhook POST
```typescript
// src/chat/postToChat.ts
export type PostResult = { ok: true } | { ok: false; error: string };

export async function postToChat(payload: CardsV2Payload, webhookUrl: string): Promise<PostResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `chat post ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `chat post threw: ${String(e)}` };
  }
}
```
On success Google returns **HTTP 200** with a `Message` JSON (only `name`/`thread.name` populated). On failure it returns 4xx/5xx with a `google.rpc.Status` body `{ "code", "message", "status" }`. `res.ok` (200–299) is the reliable success check. `[VERIFIED: developers.google.com/workspace/chat/quickstart/webhooks + format-messages]`

### Pattern 6: Cron + in-code guard (SCHED-01/02/04)
```yaml
# .github/workflows/nightly.yml
name: Evening Studio Check-in
on:
  schedule:
    - cron: "30 16 * * 1-5"      # 4:30pm Mon–Fri …
      timezone: "Australia/Sydney" # …in studio time, DST-aware (GA Mar 2026)
  workflow_dispatch: {}            # SCHED-02 manual trigger
jobs:
  checkin:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: npm ci
      - run: node --import tsx src/index.ts
        env:
          GCHAT_WEBHOOK_URL: ${{ secrets.GCHAT_WEBHOOK_URL }}
          PRODUCTIVE_AUTH_TOKEN: ${{ secrets.PRODUCTIVE_AUTH_TOKEN }}
          PRODUCTIVE_ORG_ID: ${{ secrets.PRODUCTIVE_ORG_ID }}
```
```typescript
// in src/index.ts — defence-in-depth guard (trust posture: never the wrong day)
import { DateTime } from "luxon";
import { STUDIO_ZONE } from "./domain/types.ts";
const now = DateTime.now().setZone(STUDIO_ZONE);
// Weekend safety net even if the cron is ever edited (SCHED-01: never weekends).
if (now.weekday >= 6) { console.log("weekend — skipping"); process.exit(0); }
// Manual dispatch (workflow_dispatch) bypasses the time window so testing works any time.
```
**Notes:** GitHub scheduled workflows (a) can be **delayed under load** — don't assume exactly 16:30; the guard checks the day, not the minute; (b) are **disabled after 60 days of repo inactivity** — acceptable here, note it for the owner; (c) `workflow_dispatch` runs should bypass the weekday/time window so a manual test fires any time. `[VERIFIED: docs.github.com workflow-syntax; community discussions on delays/60-day disable]`

### Anti-Patterns to Avoid
- **Putting greyed detail in `bottomLabel`.** It renders tiny and fixed — violates D-09. Use main `text` + `<br>` + grey `<font>`.
- **Computing any hours in the renderer.** All figures come pre-rounded from `report` (`*Hours` fields) and `round.ts`. The renderer formats, never calculates (CLAUDE.md trust constraint). It must read `designer.openHours`, not derive from `openMin`.
- **Letting a Chat 500 silently swallow the night.** A post failure must propagate to a non-zero exit so the GitHub failure email fires (REL-02). Don't catch-and-continue at the top level for post failures.
- **Using a custom-font `<font face>` or background colour.** Unsupported in Cards v2 (D-02/D-03). Will be ignored or break rendering.
- **Hosting the avatar as SVG.** SVG support is unreliable (D-04) — export to PNG, host at a public HTTPS URL (GitHub raw is fine).
- **Re-rendering names into the verdict.** D-12: the verdict line never names a person. Names only in rows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone-correct weekday scheduling | UTC offset math + dual-cron | Native `timezone:` cron field + luxon guard | GitHub now does DST correctly; luxon already owns the day logic. `[VERIFIED]` |
| HTTP retry/backoff for the post | Custom retry loop | One POST, surface failure to CI | ~1 req/night; a failed post should alert (REL-02), not silently retry. Idempotency/retry is **Phase 6**, out of scope. |
| Card JSON construction | A card-builder dependency | Plain typed object literals | The shape is small and fixed; a dep adds slop-risk for no gain. |
| Snapshot serialisation | `node:test` experimental snapshots | `assert.deepStrictEqual` vs committed JSON fixtures | Experimental API drifts across Node versions → false positives on trust-critical output. `[CITED: nodejs/node#44466]` |

**Key insight:** This phase has almost no genuinely hard problems left — the design is locked, the math is done upstream, and the platform pieces are all single well-documented calls. The risk is *fidelity drift* (rendering not matching the mockup) and *trust drift* (renderer accidentally recomputing a number). Both are controlled by: (1) per-scenario JSON fixtures pinned to the mockup, and (2) the renderer reading only `*Hours` display fields.

## Common Pitfalls

### Pitfall 1: Treating a data-source failure and a post failure the same way
**What goes wrong:** Wrapping the whole run in one try/catch that always exits 0 → a dead webhook produces no post AND no alert (silent night). Or: a Productive outage crashes the job instead of posting the 🤖 degraded card.
**Why it happens:** REL-01 and REL-02 pull in opposite directions and are easy to merge.
**How to avoid:** Two distinct paths. Source failures → already captured in `gather`'s `sourceErrors` → renderer emits degraded card → **still posts** (REL-01). Post/render-crash failures → **non-zero exit** → GitHub email (REL-02). Test both.
**Warning signs:** A single top-level `catch { process.exit(0) }`.

### Pitfall 2: `decoratedText` label font surprises
**What goes wrong:** Detail text put in `bottomLabel` renders tiny; multi-line detail in `topLabel` truncates instead of wrapping.
**Why it happens:** The labels have fixed caption styling distinct from main `text`.
**How to avoid:** All body-size detail in main `text` with `<br>`; only the status emoji optionally as `startIcon`. `[CITED: developers.google.com decoratedText]`
**Warning signs:** Detail lines that look smaller than the name line in the real Chat client.

### Pitfall 3: HTML entity / quote escaping in card JSON
**What goes wrong:** A client name with `&`, `<`, or a quote breaks the card or the JSON.
**Why it happens:** Card text is HTML; the same string is also JSON-serialised.
**How to avoid:** HTML-escape dynamic text (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`) before inserting into `text`; let `JSON.stringify` handle the JSON layer. Job codes and client names are the main injection points.
**Warning signs:** A card that renders blank or with raw tags for one designer only.

### Pitfall 4: Avatar PNG not publicly reachable
**What goes wrong:** `imageUrl` 404s or requires auth → header shows a broken/blank avatar.
**Why it happens:** GitHub raw URLs on a private repo aren't anonymously fetchable; Google's renderer fetches the image server-side without your auth.
**How to avoid:** Host the PNG where Google can GET it anonymously (public repo raw URL, or a public bucket). Verify the URL in an incognito browser. `[VERIFIED: D-04 reasoning + Google fetches imageUrl server-side]`
**Warning signs:** Avatar works for you (logged in) but not in the posted card.

## Runtime State Inventory

> Greenfield rendering/delivery layer — no rename/refactor/migration. The only "state" is a new secret and a new hosted asset, both first-time setup, not migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — renderer is stateless. | None. |
| Live service config | Google Chat space + incoming webhook must exist; the webhook URL is the `GCHAT_WEBHOOK_URL` secret. This is created in the Chat space UI, NOT in git. | Owner creates the webhook in the target space; store URL as a GitHub secret. |
| OS-registered state | None — runs in ephemeral CI. | None. |
| Secrets/env vars | NEW secret `GCHAT_WEBHOOK_URL` (GitHub Actions repo secret + local `.env`). Existing `PRODUCTIVE_AUTH_TOKEN`/`PRODUCTIVE_ORG_ID` reused by gather. | Add `GCHAT_WEBHOOK_URL` to repo secrets and `.env.example`. |
| Build artifacts | NEW hosted avatar PNG (export brand asterisk white-on-black to PNG, commit to repo `assets/`, reference via public raw URL). | Export + commit PNG; confirm public reachability. |

## Code Examples

### Variant selection (D-17 to D-21)
```typescript
// src/render/variants.ts
type Variant = "holiday" | "closure" | "degraded" | "card";
export function selectVariant(report: StudioReport, ctx: RenderContext): Variant {
  if (ctx.holidayTomorrow) return "holiday";   // D-20 — short warm message, no rows
  if (ctx.closureTomorrow) return "closure";   // D-21 — offsite message
  if (ctx.sourceErrors.length > 0) return "degraded"; // D-18 — 🤖 couldn't reach
  return "card"; // clean (no rows, just bar) or busy (rows) — decided inside by severity
}
```
> `missingDesigners` (one/two designers unreadable, D-19) is NOT a top-level variant — it renders a 🤖 row *inside* the normal card for that person, with a nameless verdict. Source: `report.missingDesigners` + `RenderContext`.

### Clean-vs-busy severity (D-17 / MSG-05)
```typescript
// "clean" when every designer is "ok"/"off" with no open time and no brief flags →
// short verdict "All sorted for tomorrow." + status line + week bar, NO per-designer rows.
// Otherwise → full rows. Leave drives a row but NEVER the verdict (D-13 last bullet).
const anyActionable =
  report.designers.some((d) => d.status === "underbooked" || d.status === "overbooked") ||
  ctx.briefFlags.length > 0;
```

### Renderer test against a committed fixture
```typescript
// src/render/__tests__/renderMessage.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderTemplate } from "../renderMessage.ts";
// build a StudioReport + ctx matching the mockup "two-open" scenario, then:
it("two-open scenario matches the locked card JSON", () => {
  const out = renderTemplate(report, ctx);
  const expected = JSON.parse(readFileSync(new URL("./fixtures/two-open.json", import.meta.url), "utf8"));
  assert.deepStrictEqual(out, expected);
});
```
Dry-run the POST without network: inject the webhook URL and stub `fetch` (or just call `JSON.stringify(payload)` and assert size < 32 KB). For a real end-to-end smoke test, run `node --import tsx src/index.ts` locally with a real `GCHAT_WEBHOOK_URL` pointing at a test space (manual, not in CI).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UTC-only cron + manual DST math / dual-cron | Native `timezone:` IANA field, DST-aware | GitHub Actions, late March 2026 (GA) | Eliminates the entire D-"cron UTC conversion" complexity. One cron line. `[VERIFIED: docs.github.com + github.blog changelog]` |
| Cards v1 | Cards v2 (`cardsV2`) | v1 deprecated | Use `cardsV2` only (D-01). |
| Jest/Vitest snapshots | `node:test` built-in runner | Node 22 | No test dep needed; but use `deepStrictEqual` not the experimental snapshot API. |

**Deprecated/outdated:**
- Google Chat **Cards v1** — deprecated; never use.
- The pre-2026 advice to compute UTC offsets for AEST/AEDT and run dual crons — superseded by the native `timezone:` field (still worth the in-code guard for delayed-run day-correctness).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `●`/`○` dot glyphs render acceptably in Chat's proportional Roboto (Roboto Mono not guaranteed) | Pattern 3 | Bar looks slightly uneven; mitigated by `<code>` wrapper fallback — verify visually in the real space. |
| A2 | Inline emoji status markers (🔴🟢🟠⚪🤖📄⚠️) render consistently in the Chat client | Pattern 2/4 | Some emoji could render differently per platform; they're the locked D-10 markers and match the mockup, so low risk. Verify in real client. |
| A3 | A public GitHub raw URL is anonymously fetchable by Google's image renderer | Pitfall 4 | If repo is private, avatar breaks — confirm repo visibility / use a public host. |
| A4 | `chriseaton/google-chat-cards` exists on npm (mentioned only to reject it) | Alternatives | None — not being used. |

## Open Questions

1. **Is the target repo public or private?**
   - What we know: avatar `imageUrl` must be anonymously GET-able by Google.
   - What's unclear: repo visibility (the homepage URL suggests `github.com/solvdagency/evening-studio-checkin`).
   - Recommendation: if private, host the avatar PNG on a public bucket or a public assets repo; verify in incognito before relying on it.

2. **Exact dot-bar segment count / rounding rule for the fuel gauge (D-23).**
   - What we know: filled = booked, empty = open; caption shows both `{X}h booked · {Y}h open`; mockup shows a 10-dot bar (3 filled / 7 empty for 12h booked of ~45h total).
   - What's unclear: the precise dots-per-hour or fixed-10-dots-proportional rule.
   - Recommendation: fixed 10 dots, `filled = round(bookedMin / totalMin * 10)`, computed from `rollup.totalMin`/`openMin` (exact minutes), rendered display-only. Confirm the count rule with Liam in planning — it's a presentation detail, not locked verbatim.

3. **Half-day leave row exact wording source (D-22).**
   - What we know: D-22 locks "On leave until midday · {X}h booked"; capacity treats partial leave as reduced `availableMin`.
   - What's unclear: there's no explicit "leave end time" in `DesignerResult` (only `availableMin`). Deriving "until midday" needs the absence detail, which `report` doesn't currently carry.
   - Recommendation: flag for planning — either pass absence detail through `RenderContext`, or render a simpler "Part-day leave · {X}h available" from `availableMin` if the exact time isn't available. This may need a small upstream data pass-through (note: that edges toward Phase-2 territory; keep it in `RenderContext` to avoid touching domain).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v22.22.1 | — |
| `fetch` (native) | Webhook POST | ✓ | built-in (Node 22) | — |
| `luxon` | Studio-tz guard | ✓ | ^3.7.2 | — |
| GitHub Actions `timezone:` cron | SCHED-01/04 | ✓ (GA Mar 2026) | hosted | in-code guard already planned |
| Google Chat incoming webhook | Delivery | ✗ (must be created) | — | None — owner must create it + set `GCHAT_WEBHOOK_URL` secret before first real post |
| Public avatar PNG host | Header avatar (D-07) | ✗ (must be created) | — | Card still posts without avatar; degraded brand fidelity |

**Missing dependencies with no fallback:**
- `GCHAT_WEBHOOK_URL` secret + the Chat webhook itself — blocking for any real post (but the renderer + JSON-size tests run without it).

**Missing dependencies with fallback:**
- Avatar PNG — card posts without it (header just lacks the image); set up before go-live for brand fidelity.

## Validation Architecture

> `nyquist_validation` config not located as explicitly `false`; treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (Node 22 built-in) |
| Config file | none — driven by the `test` npm script |
| Quick run command | `node --import tsx --test "src/render/**/*.test.ts"` |
| Full suite command | `npm test` |

> **Wave 0 fix needed:** the existing `package.json` `test` glob is `"src/**/*.test.ts"`, but Phase-2 tests live in `src/**/__tests__/*.test.ts`. New render tests should follow the existing `__tests__/` convention (`src/render/__tests__/*.test.ts`). Confirm the glob actually matches `__tests__` (it does via `**`), so place new tests in `src/render/__tests__/`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSG-01 | Posts Cards v2 w/ header avatar + sections | unit (JSON shape) | `node --import tsx --test "src/render/__tests__/renderMessage.test.ts"` | ❌ Wave 0 |
| MSG-02 | Order: verdict → week rollup → rows → flags; deep-link present | unit (fixture) | same | ❌ Wave 0 |
| MSG-03 | Names designer w/ open time; never a PM | unit (assert no PM field; verdict nameless) | same | ❌ Wave 0 |
| MSG-04 | Always posts; clean-night positive note | unit (clean fixture) | same | ❌ Wave 0 |
| MSG-05 | Length scales with severity (clean = no rows) | unit (clean vs busy fixtures) | same | ❌ Wave 0 |
| MSG-06 | Deep-link to Productive present + correct date | unit (assert URL) | same | ❌ Wave 0 |
| MSG-07 | Tentative + shaky visually distinguished (⚠️ on top) | unit (fixture) | same | ❌ Wave 0 |
| REL-01 | Degraded message names unreachable source, still posts | unit (degraded fixture) | same | ❌ Wave 0 |
| REL-02 | Post failure → non-zero exit (alert) | unit (postToChat returns !ok → entrypoint exits non-zero) | `…src/chat/__tests__/postToChat.test.ts` | ❌ Wave 0 |
| SCHED-01 | Weekend guard skips | unit (clock guard) | `…src/__tests__/guard.test.ts` | ❌ Wave 0 |
| SCHED-02 | Manual dispatch path | manual (workflow_dispatch run) | n/a — verified by triggering in Actions tab | manual |

### Sampling Rate
- **Per task commit:** `node --import tsx --test "src/render/**/*.test.ts"`
- **Per wave merge:** `npm test` (full suite — must stay green; Phase-1/2 trust tests included)
- **Phase gate:** Full suite green + one real manual `workflow_dispatch` post into a test space before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/render/cards.ts` — CardsV2Payload types (no test, type-only)
- [ ] `src/render/__tests__/fixtures/*.json` — one expected card per mockup scenario (clean, two-open, busy, overbooked, on-leave, half-day, briefs, couldn't-read-one, degraded, holiday, closure)
- [ ] `src/render/__tests__/renderMessage.test.ts` — fixture comparisons
- [ ] `src/chat/__tests__/postToChat.test.ts` — stub `fetch`, assert ok/!ok mapping + 32 KB size guard
- [ ] `src/__tests__/guard.test.ts` — weekend/holiday guard with injected `now`

## Security Domain

> `security_enforcement` not located as explicitly `false`; including a scoped pass. This phase has a small surface: one outbound POST with secret-bearing URL, no inbound, no auth, no user input.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Webhook auth is the secret URL itself; no login flow. |
| V3 Session Management | no | Stateless one-shot job. |
| V4 Access Control | no | No multi-user surface. |
| V5 Input Validation | yes | Upstream Productive data is already zod-validated in gather; renderer must HTML-escape dynamic text (client names, job codes) before embedding in card `text`. |
| V6 Cryptography | no | No crypto; rely on HTTPS for transport. |
| V7 Secrets / Error handling | yes | `GCHAT_WEBHOOK_URL` is a secret (GitHub encrypted secret + gitignored `.env`); never logged. Error logs must not echo the full webhook URL (it contains the auth `key`/`token`). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook URL leak (in logs / errors) | Information Disclosure | Never log the URL; log only `res.status`. Store as GitHub secret (masked) + gitignored `.env`. |
| HTML/markup injection via client name or job code into card text | Tampering | HTML-escape all dynamic strings before insertion (Pitfall 3). |
| Silent non-delivery (dead webhook) | Denial of Service / availability | Post failure → non-zero exit → GitHub failure email (REL-02); never swallow. |
| Avatar URL pointing somewhere attacker-controlled | Tampering | Hardcode the avatar URL in committed config; not user-supplied. |

## Sources

### Primary (HIGH confidence)
- developers.google.com/workspace/chat/api/reference/rest/v1/cards — cardsV2 / cardHeader / decoratedText / textParagraph / divider / buttonList+openLink structure; 32 KB card size limit
- developers.google.com/workspace/chat/format-messages — supported HTML subset (`<b><i><u><s><font color><a><br><code><pre><ul><ol><li>`), NO background/highlight, NO custom fonts
- developers.google.com/workspace/chat/quickstart/webhooks — POST shape, `Content-Type: application/json; charset=UTF-8`, success Message body, `google.rpc.Status` errors, 1 req/s/space
- developers.google.com/chat/ui/widgets/decorated-text — topLabel truncates / bottomLabel wraps; labels are fixed caption styling distinct from main `text` (validates D-09)
- docs.github.com/.../workflow-syntax-for-github-actions — `schedule:` `cron:` + `timezone:` IANA field, DST spring-forward handling
- github.blog/changelog/2026-03-19 — timezone field GA announcement (late March 2026)
- Codebase: `src/domain/report.ts`, `capacity.ts`, `round.ts`, `types.ts`, `src/productive/gather.ts`, `brief.ts`, `src/config.ts`, `src/domain/clock.ts`, `package.json` (v22.22.1, deps verified)
- `design/chat-card-mockups.html` — the binding visual contract (round 15)
- Live check: `NzQ5NTY2` base64 → `749566` (confirms D-24 filter); `app.productive.io/.../scheduling/bookings` is a real app route

### Secondary (MEDIUM confidence)
- github.com community discussions #43415 / #25351 — scheduled-workflow failure email goes to the workflow creator (REL-02 nuance); scheduled-run delays + 60-day inactivity disable
- nodejs/node#44466 — `node:test` snapshot API instability (basis for preferring deepStrictEqual)

### Tertiary (LOW confidence)
- Various blog posts on GitHub Actions cron/timezone (corroborating, not relied upon over the official docs)

## Metadata

**Confidence breakdown:**
- Platform mechanics (webhook, cron, deep-link): HIGH — verified against official docs + live checks
- Cards v2 mapping: HIGH on structure, MEDIUM on exact glyph/emoji rendering (verify visually in the real space)
- Architecture / renderer interface: HIGH — fits the existing Phase-1/2 boundary patterns
- Scheduling (timezone cron): HIGH — GA feature confirmed in official docs + changelog
- Testing approach: HIGH

**Research date:** 2026-06-03
**Valid until:** ~2026-09-03 (Cards v2 + webhook are stable; recheck only if Google deprecates cardsV2 or GitHub changes the timezone field)
