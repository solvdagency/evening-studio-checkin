# Phase 2: Productive Pull & Briefed Discovery - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 11 new (1 modified is none — Phase 1 domain stays untouched)
**Analogs found:** 5 with style analogs / 11 total (6 files establish brand-new patterns: first HTTP/fetch, first zod, first external dep, first ingestion tier)

## Orientation

Phase 1 built a pure deterministic domain core under `src/domain/` with a strong, consistent house style. Phase 2 adds a **new ingestion tier** (`src/productive/`) in front of it. There is **no existing HTTP, fetch, zod, JSON:API, or external-API code** in this repo — Phase 2 establishes those patterns. So the analogs below split into two kinds:

- **Style analogs (strong):** every Phase 1 domain module + test is the authoritative reference for *module shape, doc-comment style, import conventions, export style, naming, defensive non-throwing posture, and `node:test` structure*. New ingestion files MUST mirror these.
- **No behavioural analog:** the actual fetch/pagination/zod/holiday-library mechanics have no in-repo precedent — RESEARCH.md Patterns 1–6 are the source for those, and the new files set the pattern for the rest of the project.

The single most important cross-cutting rule, already encoded in Phase 1 and reinforced here: **Productive shapes never cross into `src/domain`.** Mappers convert at the boundary; only `Booking` / `Absence` / `HolidaySet` / `StudioReportInput` go in.

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/productive/client.ts` | HTTP client (fetch + paginate, Result type) | request-response / network I/O | — (no analog) | none — establishes pattern (RESEARCH Patterns 1–2) |
| `src/productive/schemas.ts` | zod boundary schemas | transform / validation | — (no analog) | none — establishes pattern (RESEARCH Pattern 3) |
| `src/productive/types.ts` | ingestion-internal raw types | type contract | `src/domain/types.ts` | role-match (type-only file style) |
| `src/productive/briefed.ts` | pure logic (position compare) | transform | `src/domain/capacity.ts` | strong (pure deterministic logic) |
| `src/productive/mappers.ts` | mapper (per-day minutes + Productive→domain) | transform | `src/domain/capacity.ts` + `src/domain/round.ts` | strong (pure arithmetic + safe-coerce) |
| `src/productive/brief.ts` | typed output shape (`BriefFlag`) | type contract | `src/domain/capacity.ts` (`DesignerResult` interface) | strong (exported result interface) |
| `src/productive/gather.ts` | orchestrator (pull→validate→map→assemble) | request-response → transform | `src/domain/report.ts` (`computeStudioReport` composition) | strong (composition root) |
| `src/holidays.ts` (or `src/productive/holidays.ts`) | config/source (date-holidays → HolidaySet) | batch / external lib | `src/domain/clock.ts` (HolidaySet consumer) | partial — produces what clock consumes; lib usage has no analog (RESEARCH Pattern 6) |
| `src/config.ts` | config (designer IDs, org id, NSW region, closures) | config | `src/domain/types.ts` (constant-export block) | role-match (named const exports + doc rationale) |
| `src/productive/__tests__/briefed.test.ts` | test | — | `src/domain/__tests__/capacity.test.ts` | exact (node:test structure) |
| `src/productive/__tests__/mappers.test.ts` | test | — | `src/domain/__tests__/capacity.test.ts` + `round.test.ts` | exact (node:test + fixture helpers) |
| `src/productive/__tests__/schemas.test.ts` | test (fixture-driven safeParse) | — | `src/domain/__tests__/round.test.ts` (simple value asserts) | role-match — fixture-against-real-response is new |
| `src/holidays.test.ts` (or in `__tests__`) | test | — | `src/domain/__tests__/clock.test.ts` (date-key asserts) | strong |

> The planner may collapse/rename files (Claude's Discretion, CONTEXT D-15 / RESEARCH "Recommended Project Structure"). The role+flow classification holds regardless of final filenames.

## Shared Patterns (apply across all Phase 2 files)

These are extracted from Phase 1 and are non-negotiable house style. Anchor every new file to them.

### S-1: Module doc-header block (every module + test)

**Source:** all of `src/domain/*.ts` — e.g. `src/domain/capacity.ts` lines 1-14, `src/domain/clock.ts` lines 1-14.

Every module opens with a `/** ... */` block stating: what the module does, its trust posture, and the decision IDs it implements. Example shape to copy:

```typescript
/**
 * Per-designer capacity + day classification — the trust-critical arithmetic.
 *
 * ... what it does ...
 *
 * This module is framework-agnostic: it consumes the abstracted `isTentative`
 * boolean only and never imports any upstream-API response type (RESEARCH Pitfall 5).
 * It NEVER throws on odd input — non-finite minute values are coerced to 0 ...
 */
```

For Phase 2, the headers should cite the relevant D-IDs (D-02/D-03/D-04 for `briefed.ts`, D-09 for `mappers.ts`, D-13 for `holidays.ts`, etc.) the same way Phase 1 cites them inline.

### S-2: Import conventions (`.ts` extensions, `type`-only imports, `verbatimModuleSyntax`)

**Source:** `src/domain/report.ts` lines 31-36, `src/domain/capacity.ts` lines 16-18.

```typescript
import type { DateTime } from "luxon";
import type { Absence, Booking, DesignerId, HolidaySet } from "./types.ts";
import { availableMinutes, bookedMinutes, computeDesignerDay } from "./capacity.ts";
import type { DesignerResult } from "./capacity.ts";
```

Hard rules confirmed against `tsconfig.json` (`"module": "nodenext"`, `"verbatimModuleSyntax": true`) and `package.json` (`"type": "module"`):
- **Relative imports carry the `.ts` extension** (`"./types.ts"`, `"../clock.ts"`). This is mandatory under nodenext + tsx — not optional.
- **Type-only imports use `import type`** (verbatimModuleSyntax enforces this — mixing will fail compile). Domain contracts pulled into ingestion (`Booking`, `Absence`, `DesignerId`, `HolidaySet`) are ALWAYS `import type`.
- Mappers importing the domain: `import type { Booking, Absence, DesignerId, HolidaySet } from "../domain/types.ts";` and `import { STUDIO_ZONE, TARGET_MINUTES } from "../domain/types.ts";` (values, not type-only).

### S-3: Non-throwing / safe-coerce defensive posture

**Source:** `src/domain/capacity.ts` lines 67-69 (`safeMinutes`), and the report header `src/domain/report.ts` lines 22-25.

```typescript
function safeMinutes(minutes: number): number {
  return Number.isFinite(minutes) ? minutes : 0;
}
```

Phase 1 guarantees "NON-THROWING: partial / empty / garbage input degrades gracefully." Phase 2 extends this across the network boundary via the Result type (RESEARCH Pattern 1) and zod `safeParse` (RESEARCH Pattern 3, never `parse`). Mappers must reuse the same `Number.isFinite(...) ? x : 0` guard pattern for `time`/`total_time`/`percentage`, and the method-3 divisor must be guarded `workingDaysInRange > 0` (RESEARCH Pitfall 5) — same defensive style as `availableMinutes` flooring at 0.

### S-4: Constant + interface export style

**Source:** `src/domain/types.ts` lines 27-35 (constants), lines 41-68 (branded type + interfaces); `src/domain/capacity.ts` lines 29, 41-60 (exported `type` + `interface` with per-field doc comments).

```typescript
export const STUDIO_ZONE = "Australia/Sydney" as const;
export const TARGET_MINUTES = 450 as const;

export type DayStatus = "off" | "underbooked" | "overbooked" | "ok";

export interface DesignerResult {
  designerId: DesignerId;
  /** Exact available minutes for the day = TARGET_MINUTES - absence, floored at 0. */
  availableMin: number;
  // ... each field carries a one-line doc comment ...
}
```

Apply to: `config.ts` (named `const` exports with a rationale doc-block — mirror the `STUDIO_ZONE`/`TARGET_MINUTES` justification at `types.ts` lines 9-19), `brief.ts` (`BriefFlag` interface, RESEARCH "Brief-check Output Shape" lines 415-422, with per-field doc comments), and any union types (`reason: "no-task" | "not-briefed" | "blank-brief"` — same shape as `DayStatus`).

## Pattern Assignments (per file)

---

### `src/config.ts` (config)

**Analog:** `src/domain/types.ts` (constant-export block + rationale doc).

CONTEXT D-14/D-15 and RESEARCH "Recommended Project Structure" (lines 220) call this discretionary-but-recommended. Phase 1 explicitly pre-authorised it (`src/domain/types.ts` lines 9-19): *"If Phase 2 grows real runtime config (designer IDs, calendar emails, webhook), a thin src/config.ts can be added then."* It now has designer IDs + org id + NSW region + closures.

**Copy the constant-export + rationale style** (`types.ts` lines 27-35):
```typescript
export const STUDIO_ZONE = "Australia/Sydney" as const;
export const TARGET_MINUTES = 450 as const;
```
For Phase 2: `DESIGNER_PERSON_IDS = ["686717", "686712", "686716"] as const` (D-14), `HOLIDAY_REGION = { country: "AU", state: "NSW" } as const` (D-13), `STUDIO_CLOSURES: readonly string[]` (committed "yyyy-MM-dd" list).

**Hard constraints:**
- Keep `STUDIO_ZONE` / `TARGET_MINUTES` in `domain/types.ts` — do NOT move them (Phase 1 decision, RESEARCH line 220). `config.ts` is ingestion config only.
- Secrets (`X-Auth-Token`, `X-Organization-Id` value) come from `process.env`, NEVER in this committed file (D-15). The numeric org id `34092` is non-secret config; the token is a secret.

---

### `src/productive/types.ts` (ingestion-internal raw types)

**Analog:** `src/domain/types.ts` (type-only module, branded ids, doc-commented interfaces).

Mirror the doc-block + per-type comment style. **Critical boundary rule** (the whole reason this file is separate from `domain/types.ts`): nothing here is ever imported into `src/domain/`. See the anti-pattern in `src/domain/report.ts` header and RESEARCH lines 363. These hold the raw JSON:API shapes (booking attrs, task, workflow_status) that zod produces and mappers consume.

---

### `src/productive/client.ts` (HTTP client) — NO ANALOG, establishes pattern

**Analog:** none in repo. Source = RESEARCH Pattern 1 (lines 226-241) and Pattern 2 (lines 246-263).

This is the first network code in the project. Establish:
- A `Result<T>` discriminated union (`{ ok: true; value } | { ok: false; error }`) — never throw across the boundary (RESEARCH Pattern 1, Pitfall 6). This is the network-layer analogue of Phase 1's `safeMinutes` defensive posture (S-3).
- Three JSON:API headers `X-Auth-Token` / `X-Organization-Id` / `Content-Type: application/vnd.api+json` (RESEARCH Auth section lines 122-127). Token from env; **never log the token or full URL with key** (RESEARCH Security lines 537).
- Paginate `page[size]=200`, loop to `meta.total_pages` — never assume one page (RESEARCH Pattern 2, anti-pattern lines 367).

**Style to still inherit from Phase 1:** the S-1 doc-header, S-2 imports (`.ts` extensions), and the `Number.isFinite`/nullish-safe defensive instinct. Even though the mechanics are new, the file should *read* like a Phase 1 module.

**Execution probe (RESEARCH Open Q1 / A1):** first authenticated call must verify `X-Organization-Id=34092` returns 200 not 403 (e.g. GET `/people/686717`).

---

### `src/productive/schemas.ts` (zod boundary validation) — NO ANALOG, establishes pattern

**Analog:** none in repo (first zod usage). Source = RESEARCH Pattern 3 (lines 270-298).

Establish:
- `safeParse` only, never `parse` (anti-pattern lines 364, Pitfall 6).
- Validate only fields the phase uses; tolerate extra fields (loose/passthrough) so a new Productive field never breaks the nightly pull (RESEARCH line 297).
- **Use the corrected API field names** — `booking_method_id`, `draft`, `canceled` (NOT the CONTEXT.md conceptual names `booking_method` / `is_draft` / `is_canceled`). RESEARCH Pitfall 1 (lines 430-434) — this is the single highest-risk bug in the phase.

**Test against a real captured fixture** before trusting the schema (RESEARCH Pitfall 1 "Warning signs").

---

### `src/productive/briefed.ts` (pure logic) — strong style analog

**Analog:** `src/domain/capacity.ts` — pure, deterministic, exported small functions, fail-safe defaults.

This is the closest behavioural cousin to Phase 1: a small pure function (`isBriefed`) over already-resolved inputs. **Copy the `classifyDay` shape** (`capacity.ts` lines 108-122) — a function that takes plain numbers/flags and returns a decision, ordering significant, documented with D-IDs:

```typescript
// capacity.ts classifyDay — the style to mirror: pure, ordered, D-cited
export function classifyDay(availableMin: number, confirmedMin: number): { status: DayStatus; openMin: number } {
  const openMin = availableMin - confirmedMin; // confirmed only (D-04)
  let status: DayStatus;
  if (availableMin === 0) status = "off"; // D-01 ...
  // ...
  return { status, openMin };
}
```

For `isBriefed`, the RESEARCH Pattern 4 logic (lines 306-311) maps directly onto this style:
```typescript
function isBriefed(taskStatus: { workflowId: string; position: number; descriptionNonEmpty: boolean }, map: Map<string, number>): boolean {
  const briefedPos = map.get(taskStatus.workflowId);
  if (briefedPos === undefined) return false;   // D-03: no Briefed column → fail safe
  return taskStatus.position >= briefedPos       // D-02: at or past Briefed
      && taskStatus.descriptionNonEmpty;         // D-04: non-empty guard
}
```
**Fail-safe default** (`return false` when undefined) is the briefed-analogue of Phase 1's "floor at 0 / coerce NaN→0" instinct (S-3). Do NOT hardcode the 6 status IDs (D-03, anti-pattern lines 365).

---

### `src/productive/mappers.ts` (mapper) — strong style analog

**Analog:** `src/domain/capacity.ts` (safe arithmetic) + `src/domain/round.ts` (single-source-of-truth pure conversion).

The per-day minutes normalizer (D-09) is pure trust-critical arithmetic — exactly the class Phase 1 treats most carefully. **Copy two things:**

1. **`safeMinutes` coercion** (`capacity.ts` lines 67-69) for every `time ?? 0` / `total_time ?? 0` / `percentage ?? 0`, and `default: return 0` for unknown `booking_method_id` (never throw). RESEARCH Pattern 5 (lines 322-331) already follows this:
```typescript
switch (b.booking_method_id) {
  case 1: return b.time ?? 0;
  case 3: return workingDaysInRange > 0 ? Math.round((b.total_time ?? 0) / workingDaysInRange) : 0;
  case 2: return Math.round(((b.percentage ?? 0) / 100) * TARGET_MINUTES);
  default: return 0; // unknown method → 0, never throw
}
```
2. **Reuse, don't re-derive:** import `TARGET_MINUTES` from `domain/types.ts` (the % capacity basis, RESEARCH line 328) and import `isWorkingDay` from `domain/clock.ts` for the method-3 working-days-in-range count (RESEARCH line 333 / Open Q3) — same `HolidaySet`/weekday logic the clock already exports (`src/domain/clock.ts` lines 27-31). Do not replicate weekday math.

**Output:** clean `Booking` / `Absence` only. Split by `booking_type` (`service` vs `event`, D-11). `isTentative ⟺ draft === true` (D-07, NOT approval_status — anti-pattern lines 366).

---

### `src/productive/brief.ts` (typed output shape) — strong style analog

**Analog:** `src/domain/capacity.ts` `DesignerResult` interface (lines 41-60) — exported interface, per-field doc comments, stable contract for the next phase.

Copy the per-field-documented `interface` style for `BriefFlag` (RESEARCH lines 415-422). The `reason` union mirrors `DayStatus` (`capacity.ts` line 29). Constraints baked into doc comments: emit only for confirmed + target-day + client bookings (D-05/D-08/D-06), never store a PM (BRIEF-03, RESEARCH line 426).

---

### `src/productive/gather.ts` (orchestrator) — strong style analog

**Analog:** `src/domain/report.ts` `computeStudioReport` (lines 164-223) — the composition-root pattern.

This is the ingestion-tier analogue of `computeStudioReport`: it composes the smaller pieces (client → schemas → briefed → mappers) into one assembled output. **Copy the composition style** — a single exported function that destructures an input object, calls the pure helpers in order, and returns a well-formed object even on partial/empty data (`report.ts` lines 164-187):

```typescript
export function computeStudioReport(input: StudioReportInput): StudioReport {
  const { now, holidays, roster, bookings, absences, assessedDesigners } = input;
  const targetDay = nextWorkingDay(now, holidays);
  // ... compose pure pieces ...
  return { targetDay: targetKey, window, designers, rollup, missingDesigners };
}
```

`gather.ts` produces `{ bookings: Booking[], absences: Absence[], briefFlags: BriefFlag[], assessedDesigners, sourceErrors }` (RESEARCH diagram lines 191-193). The `assessedDesigners` / `sourceErrors` outputs feed directly into Phase 1's `StudioReportInput.assessedDesigners` (`report.ts` lines 76-87) — note the deliberate "present-but-empty vs absent-from-pull" distinction documented there; `gather.ts` must pass only designers it actually reached. On a source failure, accumulate into `sourceErrors: string[]` and degrade — never throw (RESEARCH Pitfall 6).

---

### `src/holidays.ts` (date-holidays → HolidaySet) — partial analog + new lib usage

**Analog (consumer side):** `src/domain/clock.ts` lines 27-31 — defines what a `HolidaySet` IS (`ReadonlySet<"yyyy-MM-dd">`, studio-zone keys, compared via `toISODate()`). This file PRODUCES exactly that. The `date-holidays` library usage itself has no analog — source = RESEARCH Pattern 6 (lines 339-355).

Establish:
- `new Holidays("AU", "NSW")`, filter `type === "public"` (RESEARCH lines 357-358, D-13).
- **Date-string gotcha** (RESEARCH Pitfall 4, lines 448-450): do NOT push `h.date` (`"YYYY-MM-DD HH:mm:ss"`) into the set raw — it won't match the clock's `toISODate()` keys. Parse `h.start` via luxon in `STUDIO_ZONE` then `.toISODate()`. This is precisely why Phase 1 chose `ReadonlySet<string>` over `Set<DateTime>` (`types.ts` lines 80-86) — honour that contract exactly.
- Merge committed `STUDIO_CLOSURES` from `config.ts` into the same set (D-13).
- Enumerate current + next year (window can cross a year boundary — RESEARCH line 360).

Import `STUDIO_ZONE` from `domain/types.ts` (value import, per S-2).

---

### Tests: `src/productive/__tests__/*.test.ts` — exact analog

**Analog:** `src/domain/__tests__/capacity.test.ts` (fixture helper + describe/it + D-cited assertions), `clock.test.ts` (date-key asserts), `round.test.ts` (simple value asserts).

**Copy the exact node:test skeleton** (`capacity.test.ts` lines 1-22):
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Booking, DesignerId } from "../types.ts";
import { availableMinutes, bookedMinutes, classifyDay, computeDesignerDay } from "../capacity.ts";

const DESIGNER = "designer-1" as DesignerId;

/** Helper: build a Booking without repeating the designerId everywhere. */
function booking(minutes: number, isTentative: boolean): Booking {
  return { designerId: DESIGNER, minutes, isTentative };
}

describe("availableMinutes (CAP-01 / D-02)", () => {
  it("no absence -> full 450-minute day", () => {
    assert.equal(availableMinutes(0), 450);
  });
});
```

Hard rules to mirror:
- `import { describe, it } from "node:test"` + `import assert from "node:assert/strict"`. No Jest/Vitest (CLAUDE.md standard).
- `describe` titles cite the D-ID / requirement; `it` titles state the concrete value (`"480 min over Jun 3–4 = 240/day"`).
- A small local fixture-builder helper (the `booking(...)` factory pattern) to avoid repetition.
- For dates use `DateTime.fromISO(iso, { zone: STUDIO_ZONE })` exactly as `clock.test.ts` line 16 (`const sydney = ...`).
- Tests run via the existing `package.json` script `node --import tsx --test "src/**/*.test.ts"` — the glob already covers `src/productive/__tests__/`, so no config change needed.

**Trust-critical, unit-test hard with fixtures** (RESEARCH line 379, Don't-Hand-Roll): the D-09 minutes math (all three `booking_method_id`s incl. method-3 division + zero-divisor guard), the D-02 position-compare (at/past/before Briefed, missing-workflow fail-safe), the D-04 non-empty guard. `schemas.test.ts` should `safeParse` a captured real-response fixture (catches the Pitfall-1 field-name bug). `holidays.test.ts` should assert a known NSW public holiday (e.g. Australia Day) yields the right `"yyyy-MM-dd"` key.

## No Analog Found (planner uses RESEARCH patterns)

| File | Role | Data Flow | Reason / Source |
|------|------|-----------|-----------------|
| `src/productive/client.ts` | HTTP client | network | First fetch/HTTP/JSON:API/pagination/Result-type code in repo. Use RESEARCH Patterns 1–2. |
| `src/productive/schemas.ts` | zod schema | validation | First zod usage in repo. Use RESEARCH Pattern 3. Correct field names (Pitfall 1). |
| `src/holidays.ts` (lib usage) | external lib | batch | First `date-holidays` (and first external-dep) usage. Use RESEARCH Pattern 6 (consumer contract anchored to `clock.ts`/`types.ts`). |

These three carry **net-new dependency installs** (`zod`, `date-holidays`, dev `dotenv`). RESEARCH "Package Legitimacy Audit" (lines 102-116) flags slopcheck was unavailable; the planner should gate the installs behind a `checkpoint:human-verify` (all four are CLAUDE.md/D-13-locked, long-lived, high-download).

## Metadata

**Analog search scope:** `src/domain/*.ts` (5 modules), `src/domain/__tests__/*.test.ts` (4 tests), `package.json`, `tsconfig.json`. No `src/productive/`, no HTTP/fetch/zod code exists yet.
**Files scanned:** 11 (4 domain modules + 4 tests + types + 2 config files).
**Key conventions confirmed:** nodenext + `verbatimModuleSyntax` → `.ts` import extensions + `import type` mandatory; ESM (`"type": "module"`); `node:test` runner via `node --import tsx --test "src/**/*.test.ts"`; no axios/Jest/Vitest; native `Date` banned (luxon only).
**Pattern extraction date:** 2026-06-03

---

## PATTERN MAPPING COMPLETE

**Phase:** 2 - Productive Pull & Briefed Discovery
**Files classified:** 11
**Analogs found:** 5 strong style analogs / 11 total (3 files establish brand-new patterns)

### Coverage
- Files with strong/exact style analog: 8 (config, ingestion types, briefed, mappers, brief, gather, + tests)
- Files with partial analog: 1 (holidays — consumer contract anchored, lib usage new)
- Files with no analog (new pattern): 3 (client, schemas, date-holidays lib usage)

### Key Patterns Identified
- All Phase 2 modules mirror the Phase 1 house style: `/** */` doc-header citing D-IDs, `.ts` import extensions + `import type` (nodenext + verbatimModuleSyntax), per-field-documented exported interfaces, and a non-throwing defensive posture (`Number.isFinite(...) ? x : 0`, fail-safe defaults).
- The boundary is the load-bearing rule: Productive raw shapes live only in `src/productive/`; mappers emit clean `Booking`/`Absence`/`HolidaySet` and reuse `TARGET_MINUTES` + `isWorkingDay` from the domain rather than re-deriving.
- `gather.ts` is the ingestion-tier twin of `report.ts::computeStudioReport` — a composition root that assembles pure pieces and degrades (sourceErrors) instead of throwing; its `assessedDesigners` output feeds Phase 1's existing present-but-empty-vs-absent gap logic.
- Tests copy the `node:test` + `node:assert/strict` skeleton with a local fixture-builder helper and D-ID-cited describe/it titles; the existing test glob already covers the new `src/productive/__tests__/` dir.
- Three files have no in-repo precedent (first HTTP/fetch + Result type, first zod safeParse, first `date-holidays`); RESEARCH Patterns 1–3 and 6 are the source, and they carry the net-new installs to gate behind human verification.

### File Created
`/Users/liammills/Documents/CLAUDE/evening design team check/.planning/phases/02-productive-pull-briefed-discovery/02-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. The planner can reference concrete analog files + line numbers (Phase 1 domain modules/tests) for style and the cited RESEARCH patterns for the new HTTP/zod/holiday mechanics.
