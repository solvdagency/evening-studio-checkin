# Phase 3: Template Renderer & Chat Delivery - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 13 new + 2 modified
**Analogs found:** 13 / 13 (every new file maps onto an existing Phase-1/2 pattern; no greenfield-without-precedent files)

> This is a Node 22 + TypeScript project with a strong, already-established trust architecture (Phases 1–2). The new `src/render/` and `src/chat/` layers are NOT inventing patterns — they are extending three patterns that already exist and are tested: (1) the **pure, deterministic, injected-deps module** (`report.ts`, `capacity.ts`), (2) the **non-throwing `Result` boundary** (`client.ts`, `gather.ts`'s `sourceErrors`), and (3) the **per-field-documented exported interface** with an exact-fixture test suite. The planner should copy these verbatim, not re-derive them.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/render/cards.ts` | model (type defs) | transform | `src/domain/capacity.ts` (`DesignerResult` iface) + `src/productive/brief.ts` (`BriefFlag` iface) | role-match (type-only module) |
| `src/render/renderMessage.ts` | service (pure) | transform (report → card) | `src/domain/report.ts` (`computeStudioReport`) | exact |
| `src/render/variants.ts` | utility (pure) | transform/branch | `src/domain/capacity.ts` (`classifyDay`) | exact |
| `src/render/verdict.ts` | utility (pure) | transform | `src/domain/capacity.ts` (`classifyDay` switch) | role-match |
| `src/render/rows.ts` | utility (pure) | transform | `src/domain/capacity.ts` (`computeDesignerDay`) | exact |
| `src/render/weekBar.ts` | utility (pure) | transform | `src/domain/round.ts` (display-only formatter) | role-match |
| `src/render/__tests__/renderMessage.test.ts` | test | transform | `src/domain/__tests__/report.test.ts` | exact |
| `src/render/__tests__/fixtures/*.json` | test fixture | n/a | `src/productive/__fixtures__/bookings-page.json` | role-match |
| `src/chat/postToChat.ts` | service (transport) | request-response (one POST) | `src/productive/client.ts` (`getJson`) | exact |
| `src/chat/__tests__/postToChat.test.ts` | test | request-response | `src/productive/__tests__/gather.test.ts` (stubbed fetch) | exact |
| `src/index.ts` | composition root | event-driven (cron-triggered) | `src/productive/gather.ts` (orchestration) + `report.ts` (injected `now`) | role-match |
| `src/__tests__/guard.test.ts` | test | branch | `src/domain/__tests__/clock.test.ts` (injected `now`) | exact |
| `.github/workflows/nightly.yml` | config | n/a | RESEARCH Pattern 6 (no in-repo analog) | no analog |
| `src/config.ts` | config (EXTEND) | n/a | itself (existing `src/config.ts`) | exact |
| `package.json` | config (EXTEND — test glob) | n/a | itself | exact |

---

## Pattern Assignments

### `src/render/renderMessage.ts` (service, pure transform — the LLM-01 interface)

**Analog:** `src/domain/report.ts::computeStudioReport` (lines 164–223). This is the closest twin: a pure function that takes an injected input object and returns a single well-formed contract object, never throwing, never doing I/O. The renderer is the same shape one layer up.

**Copy — the injected-input + destructure + assemble-and-return skeleton** (`report.ts` 164–223):
```typescript
export function computeStudioReport(input: StudioReportInput): StudioReport {
  const { now, holidays, roster, bookings, absences, assessedDesigners } = input;
  // ...pure helpers called in order, no I/O, no throw...
  return { targetDay: targetKey, window, designers, rollup, missingDesigners };
}
```
Render equivalent: `renderTemplate(report, ctx)` destructures `report` + `ctx`, calls `selectVariant` → `buildVerdict` → `buildRows` → `buildWeekBar`, returns one `CardsV2Payload`. Signature is fixed by RESEARCH Pattern 1 (`export type RenderMessage = (report, ctx) => CardsV2Payload`).

**Copy — the module-header trust docblock** (`report.ts` 1–29 / `capacity.ts` 1–14). Every domain module opens with a `/** ... */` header stating the trust guarantees (DETERMINISTIC / NON-THROWING / display-only). The renderer header must state: *pure, no I/O, reads only `*Hours` display fields, never recomputes a number* (RESEARCH Anti-Pattern "Computing any hours in the renderer", line 297).

**Import-style pattern** (`report.ts` 31–36 — note the `.ts` extensions and `type` imports):
```typescript
import type { DateTime } from "luxon";
import type { Absence, Booking, DesignerId, HolidaySet } from "./types.ts";
import { availableMinutes, bookedMinutes, computeDesignerDay } from "./capacity.ts";
import type { DesignerResult } from "./capacity.ts";
```
Renderer imports: `import type { StudioReport } from "../domain/report.ts";`, `import type { BriefFlag } from "../productive/brief.ts";`. **Boundary note (CLAUDE.md + CONTEXT code_context line 110):** `src/render/` sits ABOVE both `domain` and `productive` and may import their *output* types (`StudioReport`, `DesignerResult`, `BriefFlag`). It must NOT import `src/productive/schemas.ts`, `client.ts`, or raw JSON:API types. The forbidden edge is `domain → productive`, not `render → {domain, productive}`.

---

### `src/render/cards.ts` (model — Cards v2 type defs)

**Analog:** `src/domain/capacity.ts::DesignerResult` (lines 41–60) and `src/productive/brief.ts::BriefFlag` (lines 46–59). Both are exported interfaces where **every field carries a `/** ... */` doc comment** citing the decision it satisfies. Match this exactly for `CardsV2Payload`, `GoogleCard`, `decoratedText`, etc.

**Copy — the per-field-documented interface style** (`capacity.ts` 41–60):
```typescript
export interface DesignerResult {
  designerId: DesignerId;
  /** Exact available minutes for the day = TARGET_MINUTES - absence, floored at 0. */
  availableMin: number;
  /** True when any tentative time exists (D-05). Orthogonal to status. */
  shaky: boolean;
  // ...
}
```
The `RenderContext` interface (RESEARCH Pattern 1, lines 149–162) follows this convention — each field documents its source decision (`sourceErrors` → D-18, `holidayTomorrow` → D-20, etc.).

**Source for the actual card shape:** RESEARCH Pattern 4 (full-card skeleton, lines 203–235) and Pattern 2 (the row, lines 176–184). These are validated against the cardsV2 reference and the mockup — type the literals to match them.

---

### `src/render/variants.ts` (utility — variant selection)

**Analog:** `src/domain/capacity.ts::classifyDay` (lines 108–122). Same pattern: an ordered if/else cascade returning a discriminated outcome, with the ordering being *significant* and documented. Variant selection is the presentation-layer twin of day classification.

**Copy — the ordered, commented branch cascade** (`capacity.ts` 108–122):
```typescript
export function classifyDay(availableMin, confirmedMin): { status; openMin } {
  const openMin = availableMin - confirmedMin;
  let status: DayStatus;
  if (availableMin === 0) status = "off";        // D-01
  else if (confirmedMin > availableMin) status = "overbooked"; // D-06
  else if (openMin > 0) status = "underbooked";  // D-03
  else status = "ok";
  return { status, openMin };
}
```
Variant equivalent (RESEARCH Code Examples lines 357–363): `if (ctx.holidayTomorrow) return "holiday";` → `if (ctx.closureTomorrow) return "closure";` → `if (ctx.sourceErrors.length > 0) return "degraded";` → `return "card";`. Note ordering is significant (holiday/closure beat degraded). `missingDesigners` is NOT a top-level variant — it renders a 🤖 row inside the normal card (RESEARCH line 365).

---

### `src/render/verdict.ts` and `src/render/rows.ts` (utilities — pure formatters)

**Analog:** `src/domain/capacity.ts::computeDesignerDay` (lines 132–153) for `rows.ts` — one function maps one designer to one output object; the renderer maps one `DesignerResult` to one `decoratedText`. `verdict.ts` mirrors the `classifyDay` switch (severity → locked string).

**Hard rules to encode (from UI-SPEC Copywriting Contract + RESEARCH Pattern 2):**
- `rows.ts` builds ALL row text in the single `text` field with `<br>` separators (D-09). NEVER `topLabel`/`bottomLabel` (RESEARCH Anti-Pattern line 296, Pitfall 2 line 322).
- Read display fields ONLY: `designer.openHours`, `designer.bookedHours`, `designer.availableHours` — never `openMin`/`confirmedMin` (RESEARCH Anti-Pattern line 297, "It must read `designer.openHours`, not derive from `openMin`"). This is the trust-critical rule.
- `verdict.ts` returns the locked nameless strings (UI-SPEC verdict table, lines 152–161). The verdict NEVER names a person (D-12 / RESEARCH Anti-Pattern line 301).
- Status-emoji + colour map is locked (UI-SPEC Color tables): 🔴`#d93025` open, 🟢`#188038` full, 🟠`#b06000` over, ⚪ leave, 🤖 couldn't-read, 📄 brief, ⚠️ tentative; muted grey `#5f6368`.
- Locked formats: tentative `⚠️ {X.X}h tentative (on top) · {Client}` (D-14, NO job code); brief `📄 {label} · {CODE} · {X}h` where label ∈ {`No brief`,`Brief empty`,`Not briefed`} (D-16). `BriefFlag.reason` (`"no-task"|"not-briefed"|"blank-brief"`, brief.ts line 56) maps to those labels.

**Display-rounding source:** all `*Hours` already come pre-rounded from `round.ts::roundToQuarterHour` (capacity.ts 149–151). The renderer formats them as `{n}h` / `{n.n}h` strings — it does NOT call `round.ts` again and does NOT do arithmetic.

---

### `src/render/weekBar.ts` (utility — dot-bar footer formatter)

**Analog:** `src/domain/round.ts` (display-only formatter docblock, lines 1–15). Same posture: a small pure formatter whose output is display-only and "never re-enters arithmetic."

**Dot-count rule (Open Item 1, planner's discretion):** RESEARCH recommends fixed 10 dots, `filled = round(bookedMin / totalMin * 10)` computed from `report.rollup.totalMin`/`openMin` (exact minutes), rendered display-only (UI-SPEC line 184). `bookedMin = totalMin - openMin`. Caption uses `rollup.totalHours`/`openHours` (already rounded). Output shape (RESEARCH Pattern 3, lines 191–198): filled `●` = default ink, empty wrapped in `<font color="#c9ccd1">`; caption greyed `#5f6368`; consider `<code>` wrap if alignment drifts (verify in real space — A1).

---

### `src/chat/postToChat.ts` (service — transport, one POST)

**Analog:** `src/productive/client.ts::getJson` (lines 62–75). This is the exact pattern — a single `fetch` wrapped in try/catch returning a `Result`-style value, `res.ok` as the success check, error string carrying only the status (never the secret URL).

**Copy — the never-throw fetch boundary** (`client.ts` 62–75):
```typescript
export async function getJson(url, headers): Promise<Result<unknown>> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, value: await res.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```
`postToChat` equivalent (RESEARCH Pattern 5, lines 242–257): POST with `Content-Type: application/json; charset=UTF-8`, body `JSON.stringify(payload)`, return `{ ok: true } | { ok: false; error }`. **Reuse the existing `Result<T>` type** from `client.ts` (lines 23–25) or mirror its shape — do not invent a third result convention.

**Security (matches client.ts 56–60 + RESEARCH V7 line 502):** NEVER log the webhook URL (it carries the `key`/`token` auth). Log `res.status` only. The URL comes from `process.env.GCHAT_WEBHOOK_URL`, exactly as `client.ts` reads `process.env.PRODUCTIVE_AUTH_TOKEN` (client.ts 36–44).

---

### `src/index.ts` (composition root — runNightly entrypoint)

**Analog:** `src/productive/gather.ts::gather` (lines 320–537) for the orchestration shape, and `report.ts`/`gather.ts`'s **injected-`now`** discipline for the clock guard.

**Copy — injected studio-zone `now` + clock guard** (gather.ts 41 + 336–339, RESEARCH Pattern 6 lines 285–292):
```typescript
import { DateTime } from "luxon";
import { STUDIO_ZONE } from "./domain/types.ts";
const now = DateTime.now().setZone(STUDIO_ZONE);
if (now.weekday >= 6) { console.log("weekend — skipping"); process.exit(0); } // SCHED-01
```
Note: `index.ts` is the ONE place allowed to call `DateTime.now()` (the boundary). Every module below it takes `now` injected — preserve that (gather.ts header line 14, report.ts header lines 19–21).

**Composition spine** (CONTEXT line 113 / RESEARCH diagram lines 76–106): `gather(deps)` → `computeStudioReport(input)` → `renderMessage(report, ctx)` → `postToChat(payload, url)`.

**The two-path reliability rule (RESEARCH Pitfall 1, lines 316–320 — DO NOT MERGE):**
- Data-source failure → already in `gather`'s `sourceErrors` (gather.ts 77–79, 344–351) → renderer emits degraded card → **still posts** (REL-01).
- Post/render crash → `postToChat` returns `{ ok: false }` → entrypoint **exits non-zero** → GitHub failure email (REL-02). Do NOT wrap the post in a swallow-and-exit-0 catch (Anti-Pattern line 298).

**Holiday/closure context wiring:** `gather` already returns `holidays` (a `HolidaySet`); `index.ts` derives `holidayTomorrow`/`closureTomorrow` for `RenderContext` by testing `report.targetDay` against the holiday set + `STUDIO_CLOSURES` (config.ts 45). The holiday key derivation pattern is in `holidays.ts` (studio-zone `toISODate` keys, lines 8–18).

---

### `src/render/__tests__/renderMessage.test.ts` + fixtures (tests)

**Analog:** `src/domain/__tests__/report.test.ts` (lines 1–59) for structure, and `src/productive/__tests__/gather.test.ts` (lines 17–43) for the load-a-committed-fixture pattern.

**Copy — the test header + deterministic-input + deepStrictEqual style** (report.test.ts 15–52):
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
// ...build a deterministic input (no system clock)...
const r = computeStudioReport(input({}));
assert.deepEqual(r.window, ["2026-06-09", ...]);
```
Renderer tests: build a `StudioReport` + `RenderContext` per mockup scenario, render, then `assert.deepStrictEqual(out, JSON.parse(readFileSync(fixtureUrl)))` (RESEARCH lines 379–389). Use `assert.deepStrictEqual` against committed JSON — NOT `node:test`'s experimental snapshot API (RESEARCH lines 53, 310).

**Copy — fixture-loading via `new URL(..., import.meta.url)`** (gather.test.ts 35–43):
```typescript
const path = fileURLToPath(new URL("../__fixtures__/bookings-page.json", import.meta.url));
const raw = JSON.parse(readFileSync(path, "utf8"));
```
Fixtures live in `src/render/__tests__/fixtures/` (one per scenario: clean, two-open, busy, overbooked, on-leave, half-day, briefs, couldn't-read-one, degraded, holiday, closure — RESEARCH Wave 0 line 484).

---

### `src/chat/__tests__/postToChat.test.ts` (test — stubbed fetch)

**Analog:** `src/productive/__tests__/gather.test.ts` (the stubbed-dependency pattern, lines 7–13). gather is tested by injecting a stub `fetchPages` so no network runs; `postToChat` is tested by stubbing global `fetch` (or injecting it) and asserting the `{ ok }` mapping for 200 vs 4xx/5xx, plus the 32 KB payload-size guard (RESEARCH lines 391, 486).

---

### `.github/workflows/nightly.yml` (config — no in-repo analog)

**No existing analog** (no `.github/workflows/` directory yet). Use RESEARCH Pattern 6 verbatim (lines 262–283): native `timezone: "Australia/Sydney"` + `cron: "30 16 * * 1-5"` + `workflow_dispatch: {}`, `node --import tsx src/index.ts`, env from secrets (`GCHAT_WEBHOOK_URL`, `PRODUCTIVE_AUTH_TOKEN`, `PRODUCTIVE_ORG_ID`).

---

### `src/config.ts` (EXTEND) and `package.json` (EXTEND)

**Analog:** the existing `src/config.ts` (lines 1–46) — extend it in the same style: exported `as const` non-secret values with a `/** ... */` rationale block, secrets stay in env. Add: avatar PNG URL, Productive deep-link template (D-24), brand inline-`<font>` colour constants. Follow the existing docblock convention (config.ts 1–14 states the trust posture: committed = non-secret only).

**`package.json`:** the existing `test` glob `"src/**/*.test.ts"` already matches `__tests__/*.test.ts` via `**` (RESEARCH line 460), so no change is strictly required — but confirm new render/chat tests are discovered. The `homepage`/`repository` already point at `github.com/solvdagency/evening-studio-checkin` (relevant to Open Question 1: avatar PNG must be anonymously fetchable — verify repo visibility).

---

## Shared Patterns

### The non-throwing `Result` boundary
**Source:** `src/productive/client.ts` lines 23–25 (the type) + 62–75 (`getJson` usage).
**Apply to:** `src/chat/postToChat.ts` (reuse `Result<void>` / `{ ok } ` union), and the entrypoint's handling of post failures.
```typescript
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

### Pure module + injected deps + trust docblock
**Source:** `src/domain/report.ts` lines 1–29 (header) + 164–223 (function); `src/domain/capacity.ts` lines 1–14.
**Apply to:** ALL of `src/render/*` (pure, no I/O, never throws, reads only display fields) and the clock guard in `src/index.ts` (inject `now`, never read system clock below the boundary).

### Per-field-documented exported interface
**Source:** `src/domain/capacity.ts` lines 41–60 (`DesignerResult`); `src/productive/brief.ts` lines 46–59 (`BriefFlag`).
**Apply to:** `src/render/cards.ts` (`CardsV2Payload` + widget types) and `RenderContext`. Each field documents the D-xx it satisfies.

### Display-only rounding (never recompute)
**Source:** `src/domain/round.ts` lines 1–37 + `src/domain/capacity.ts` lines 149–151.
**Apply to:** every renderer module — read `report.designers[].{openHours,bookedHours,availableHours}` and `report.rollup.{totalHours,openHours}` directly; only the dot-count derives from exact `*Min`, and that is display-only.

### Deterministic test: committed fixture + deepStrictEqual
**Source:** `src/domain/__tests__/report.test.ts` lines 15–52 (deterministic input, `node:test`, `assert/strict`); `src/productive/__tests__/gather.test.ts` lines 35–43 (`new URL(..., import.meta.url)` fixture load).
**Apply to:** `src/render/__tests__/renderMessage.test.ts` (per-scenario JSON fixtures) and `src/chat/__tests__/postToChat.test.ts` (stubbed fetch).

### Secret-from-env, never logged
**Source:** `src/productive/client.ts` lines 36–54 (`authHeaders` reads `process.env`, returns `Result`, never logs token) + the security note lines 56–60.
**Apply to:** `src/chat/postToChat.ts` (`GCHAT_WEBHOOK_URL` from env; log `res.status` only, never the URL) and the `nightly.yml` env block.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.github/workflows/nightly.yml` | config | n/a | No `.github/workflows/` exists yet. Use RESEARCH Pattern 6 (lines 262–283) directly — it is fully specified and verified. |

> No *source* file lacks an analog. Every `.ts` file in `src/render/` and `src/chat/` extends an established Phase-1/2 pattern; the only true greenfield artifact is the CI workflow, which RESEARCH already pins.

---

## Metadata

**Analog search scope:** `src/domain/` (report, capacity, round, clock, types), `src/productive/` (gather, brief, client, schemas), `src/__tests__` + `__tests__/` dirs, `src/config.ts`, `src/holidays.ts`, `package.json`, `tsconfig.json`.
**Files scanned:** 11 source files read in full or targeted (report.ts, types.ts, capacity.ts, round.ts, clock.ts, gather.ts, brief.ts, client.ts, config.ts, holidays.ts, package.json) + 2 test files (report.test.ts, gather.test.ts) for the test pattern.
**Pattern extraction date:** 2026-06-04
