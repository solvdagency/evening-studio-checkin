# Phase 6: Designer Working-Day Availability - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 11 (3 new, 8 modified)
**Analogs found:** 11 / 11 (all analogs are in-repo; this phase extends an existing, mature pipeline)

> This phase adds NO new architectural shape. Every change copies an established
> pattern already proven in `src/productive`, `src/domain`, and `src/render`. The
> planner should treat the analogs below as the authoritative templates and keep new
> code structurally identical to them.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/productive/schemas.ts` (modify — add `PersonResource` / availabilities schema) | schema (zod boundary) | transform / request-response | `BookingResource` / `AllocationResource` (same file) | exact |
| `src/productive/mappers.ts` (modify — add availability → per-weekday minutes mapper) | mapper | transform | `mapToBookingsAndAbsences` / `minutesOnDay` (same file) | exact |
| `src/productive/gather.ts` (modify — add `/people` fetch + parse + per-designer rostered-minutes) | service (composition root) | request-response / batch | the `/allocations` block (lines 463–524, same file) | exact |
| `src/productive/types.ts` (modify — optional raw `availabilities` interface) | types | n/a | `RawBookingAttributes` (same file) | exact |
| `src/domain/capacity.ts` (modify — `availableMinutes` takes rostered minutes) | domain (pure arithmetic) | transform | `availableMinutes` (the function itself, lines 76–78) | exact (in-place) |
| `src/domain/report.ts` (modify — rollup uses per-weekday rostered minutes) | domain (composition) | transform / batch | the rollup loop (lines 193–202, same file) | exact (in-place) |
| `src/domain/types.ts` (modify — per-designer rostered-minutes contract) | domain types | n/a | `Booking` / `Absence` (same file) | exact |
| `src/render/rows.ts` (modify — D-05 "off" wording) | component (renderer) | transform | `statusLine` `"off"` branch (lines 62–64, same file) | exact (in-place) |
| `src/render/renderMessage.ts` (modify — D-06 degraded note routing, likely none) | component (renderer) | transform | `renderDegraded` + `calendarUnavailable` note (lines 84–93, 137–143) | exact |
| `src/productive/__tests__/mappers.test.ts` (modify — availability mapper tests) | test | n/a | `mappers.test.ts` (same file) | exact |
| `src/domain/__tests__/capacity.test.ts` (modify — rostered-minutes arithmetic tests) | test | n/a | `capacity.test.ts` (same file) | exact |

---

## Pattern Assignments

### `src/productive/schemas.ts` — add a person/availabilities zod schema (schema, boundary validation)

**Analog:** `AllocationResource` / `BookingResource` in the same file. This is the canonical "validate only the fields we use, tolerate everything else, never `.parse`" pattern.

**Resource schema shape to copy** (lines 173–184 — `AllocationResource`):
```typescript
export const AllocationResource = z.object({
  id: z.string(),
  type: z.literal("allocations"),
  attributes: AllocationAttributes,
  relationships: z
    .object({
      person: Relationship,
      service: Relationship,
      event: Relationship,
    })
    .loose(),
});
```

**Boundary discipline this phase must preserve** (file header, lines 4–8): every page is validated with `.safeParse` (NEVER `.parse`), schemas validate only the fields used and tolerate extras, and only `safeParse`-usable schemas are exported. The new `availabilities` schema must follow this exactly.

**Availabilities-specific guidance (Claude's discretion, D-01/D-02/D-08):**
- `availabilities` is an array on the **person** attributes block; each entry is `{ started_on, ended_on, working_hours, holiday_calendar_id }`.
- `ended_on` is nullable (`z.string().nullable()`) — `null` means current/open-ended (D-01).
- `working_hours` is a numeric array (`z.array(z.number())`), accept 7- OR 14-element (D-08). Do not hard-pin the length in zod; length handling is the mapper's job.
- Mirror the nullable-numeric tolerance already used in `BookingAttributes` (lines 54–66): `time`/`total_time`/`percentage` are `z.number().nullable()`.

---

### `src/productive/mappers.ts` — add availability → per-weekday rostered minutes (mapper, transform)

**Analog:** `minutesOnDay` + `workingDaysInRange` + `mapToBookingsAndAbsences` (same file). The whole "raw Productive shape → exact integer minutes, defensive coercion, only clean domain types leave" discipline.

**Defensive-coercion pattern to copy verbatim** (lines 65–67):
```typescript
function safe(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
```

**Date-range containment pattern (D-01 "period covering the target date")** — copy the exact string-comparison approach from `dayInRange` (lines 74–76), which selecting the right `availabilities` period also needs:
```typescript
function dayInRange(dayKey: string, started_on: string, ended_on: string): boolean {
  return started_on <= dayKey && dayKey <= ended_on;
}
```
For availability, treat `ended_on: null` as "open-ended / always covers" (D-01) — i.e. `ended_on === null || dayKey <= ended_on`.

**Switch-with-safe-default pattern** (`minutesOnDay`, lines 111–128) — the model for "given a weekday index, return that day's minutes; unknown/0 → 0, never throw":
```typescript
export function minutesOnDay(attrs, dayKey, workingDays): number {
  if (!dayInRange(dayKey, attrs.started_on, attrs.ended_on)) return 0;
  switch (attrs.booking_method_id) {
    case 1: return safe(attrs.time);
    case 3: return workingDays > 0 ? Math.round(safe(attrs.total_time) / workingDays) : 0;
    case 2: return Math.round((safe(attrs.percentage) / 100) * TARGET_MINUTES);
    default: return 0;
  }
}
```

**Availability mapper specifics (D-02 / D-08):**
- `working_hours` index is **Mon=0 .. Sun=6** (D-02). Derive the target weekday from a luxon `DateTime` in `STUDIO_ZONE` (the file already imports `DateTime`, `STUDIO_ZONE`, `isWorkingDay`). luxon `.weekday` is 1=Mon..7=Sun — convert to 0-based to index `working_hours`.
- Available minutes for a weekday = `Math.round(safe(working_hours[idx]) * 60)` (hours × 60, D-02). A `0` entry → 0 minutes (not rostered).
- **14-element handling (D-08):** if length is 14, compare `slice(0,7)` vs `slice(7,14)`; if equal, use week 1; if differing, log a warning (matches the `console.warn`/sourceError "log but continue" posture in gather) and use week 1. Do NOT implement true week-parity.
- The mapper returns a **date-free** per-weekday minutes function/array (e.g. `(weekdayIndex) => minutes`), mirroring how `Booking`/`Absence` are date-free and the date dimension is added later in the report. Only clean primitives/domain types leave this file (header lines 1–19).

---

### `src/productive/gather.ts` — fetch `/people` availabilities + thread rostered minutes (service, request-response)

**Analog:** the `/allocations` capture block (lines 463–524). This is the exact template for "add a second Productive pull alongside `/bookings`, parse via safeParse, degrade into `sourceErrors` on failure, never crash, never `return` (keep the run going)."

**Optional-source fetch + degrade pattern to copy** (lines 488–524, condensed):
```typescript
const allocationsResult = await fetchPages("/allocations", allocationsQuery);
if (!allocationsResult.ok) {
  sourceErrors.push(`allocations pull failed: ${allocationsResult.error}`);
  // Degrade: keep confirmed-only. Do NOT return — confirmed capacity stands.
} else {
  for (const entry of allocationsResult.value.data) {
    const parsed = AllocationResource.safeParse(entry);
    if (!parsed.success) {
      sourceErrors.push("an allocation entry failed validation (skipped)");
      continue;
    }
    // ... roster gate, per-row handling ...
  }
}
```

**Critical D-06 difference from the `/allocations` analog — per-designer unknown, NOT confirmed-only fallback:**
The `/allocations` block degrades to "confirmed-only" globally. Availability must degrade **per designer**: a designer whose availability can't be fetched/parsed is **unknown** — do NOT invent open time, do NOT flag underbooked, surface a degraded note. The mechanism that already does exactly this is `assessedDesigners` → `missingDesigners` (lines 564–579 + report.ts lines 218–220): **omit** an availability-unreadable designer from the set the report trusts so they surface as "couldn't read", instead of being given a silent flat-7.5h day. Do NOT fall back to `availableMinutes(absence)` with the old flat baseline (that re-introduces the bug D-06 forbids).

**Where the new pull goes (Claude's discretion):** either extend the existing bookings call's `include` to sideload `person.availabilities`, or add a dedicated `/people?filter[id]=...&include=...` pull. The `personFilter = DESIGNER_PERSON_IDS.join(",")` pattern (line 411) is the model for the people query. Prefer reading availabilities from `included`/the people response via `safeParse` (the `indexProjects` pattern, lines 177–196, shows the "iterate `included`, type pre-filter, safeParse, build a Map" idiom):
```typescript
function indexProjects(included: unknown[]): Map<string, boolean> {
  const isClientByProject = new Map<string, boolean>();
  for (const raw of included) {
    if (typeof raw !== "object" || raw === null ||
        (raw as { type?: unknown }).type !== "projects") continue;
    const parsed = ProjectResource.safeParse(raw);
    if (!parsed.success) continue;     // drift → skip (fail-safe)
    // ... set into map ...
  }
  return isClientByProject;
}
```
Build a `rostered-minutes-by-designer-by-date` map this way (a `Map<DesignerId, (date) => minutes>` or `Map<DesignerId, number[]>`), then feed it into both the per-designer target-day `computeDesignerDay` call and the rollup.

**Holiday/window derivation already present** (lines 382–388) — reuse `targetKey`/`windowKeys` to resolve which weekday each window day maps to; do not re-derive.

---

### `src/productive/types.ts` — optional raw availabilities interface (types)

**Analog:** `RawBookingAttributes` (lines 24–43). Add a `RawPersonAttributes` / `RawAvailability` interface in the same JSDoc-heavy, field-documented style. Boundary rule (header lines 1–11): these stay INSIDE `src/productive/` and MUST NOT be imported into `src/domain`. The mapper converts them; only clean primitives cross.

---

### `src/domain/capacity.ts` — `availableMinutes` takes rostered minutes (domain, transform) — THE CORE CHANGE

**Analog:** the function being changed, lines 76–78. This is the documented single choke point (CONTEXT code_context line 100).

**Current (flat baseline to replace):**
```typescript
export function availableMinutes(absenceMinutesForDay: number): number {
  return Math.max(0, TARGET_MINUTES - safeMinutes(absenceMinutesForDay));
}
```

**Change shape (D-02 / D-03):** the function takes the designer's **rostered minutes for that day** as the basis instead of the constant `TARGET_MINUTES`, then subtracts absence:
```typescript
export function availableMinutes(rosteredMinutesForDay: number, absenceMinutesForDay: number): number {
  return Math.max(0, safeMinutes(rosteredMinutesForDay) - safeMinutes(absenceMinutesForDay));
}
```
- Keep `safeMinutes` (lines 67–69) on BOTH inputs — non-finite → 0, never NaN (D-19 / T-01-03). This is non-negotiable trust-critical behaviour.
- A non-rostered day = 0 rostered minutes → `availableMin === 0` → `classifyDay` already returns `"off"` (lines 114–115). **Do NOT add a new status** (D-04). `classifyDay`, `bookedMinutes`, `computeDesignerDay` stay structurally intact — only `computeDesignerDay`'s call to `availableMinutes` (line 137) gains the rostered-minutes argument.
- All callers (`report.ts` lines 186 via `computeDesignerDay`, and 197 in the rollup) must pass rostered minutes.

**Keep arithmetic in exact integer minutes; round only at the display edge** (lines 149–151) — the `*Hours` derivation via `roundToQuarterHour(minutesToHours(...))` is unchanged.

---

### `src/domain/report.ts` — rollup uses per-weekday rostered minutes (domain, batch) — CAP-05 FIX

**Analog:** the rollup loop, lines 193–202.

**Current rollup (uses flat `availableMinutes(absence)` only):**
```typescript
for (const dayString of window) {
  for (const designerId of roster) {
    const available = availableMinutes(absenceMinutesFor(datedAbsences, designerId, dayString));
    const confirmed = confirmedMinutesFor(datedBookings, designerId, dayString);
    totalMin += available;
    openMin += Math.max(0, available - confirmed);
  }
}
```

**Change (D-07):** `available` must use the designer's real rostered minutes for `dayString` (e.g. Anisha contributes 0 on Wed/Fri), then subtract that slot's absence:
```typescript
const rostered = rosteredMinutesFor(designerId, dayString);   // new — from the availability map
const available = availableMinutes(rostered, absenceMinutesFor(datedAbsences, designerId, dayString));
```
- The rostered-minutes source threads in through `StudioReportInput` (add a field, e.g. `rosteredMinutes: (designerId, dateKey) => number` or a `Record<DesignerId, number[]>`), mirroring how `holidays` / `roster` / `assessedDesigners` are injected (lines 65–88). Keep the module **pure and deterministic** — no I/O, `now` injected (header lines 18–25).
- Per-day open floor at 0 stays (line 200) — D-06 overbooked still lives in `designers[]`, not the rollup.
- The target-day per-designer path (lines 181–187) also flows through the same rostered minutes via `computeDesignerDay`'s new signature.

**Degraded designers (D-06):** keep using the existing `assessedDesigners`/`missingDesigners` mechanism (lines 218–220). An availability-unknown designer is omitted from `assessedDesigners` upstream in gather, so the report names them missing — the rollup must NOT invent capacity for them.

---

### `src/domain/types.ts` — rostered-minutes contract (domain types)

**Analog:** `Booking` / `Absence` interfaces (lines 51–68) and the `TARGET_MINUTES` constant (line 35).

- `TARGET_MINUTES = 450` stays as the documented fallback/reference constant but is **no longer the available-minutes basis** for a designer with known availability. Update its JSDoc to note it is now the standard 7.5h reference, not the per-designer source of truth (D-02/D-03).
- Add a small, date-free contract for per-designer per-weekday rostered minutes in the same minimal, heavily-commented style as `Booking`/`Absence`. Keep it framework-agnostic (no Productive types — header / boundary rule).

---

### `src/render/rows.ts` — D-05 non-working-day wording (component, transform)

**Analog:** `statusLine` `"off"` branch, lines 62–64 (in-place change).

**Current "off" copy:**
```typescript
if (d.status === "off") {
  return `⚪ ${name} — ${muted("on leave / Full day off.")}`;
}
```
And the row body short-circuit for "off" (lines 124–126) keeps the row minimal.

**Change (D-05):** a *routine* non-working day is not booked leave. Resolve the wording **in the renderer** without adding a status value — read sensibly (e.g. "not in {day}" / "not rostered") rather than literally "on leave". The status model stays `"off"`. Keep:
- the `⚪` emoji + `muted(...)` colour treatment,
- HTML-escaping via `escapeHtml` (lines 25–27) for any dynamic day name,
- the minimal one-line row (no booked/flags) — lines 124–126.

If distinguishing booked-leave from routine-not-rostered needs extra context, the established channel is a `RenderContext` field (the `leaveNotes` pattern, cards.ts lines 188–195) — **do not** extend the domain `DesignerResult` (the domain stays untouched, per that field's own doc).

---

### `src/render/renderMessage.ts` — D-06 degraded note (component, transform)

**Analog:** `renderDegraded` (lines 84–93) and the soft `calendarUnavailable` note (lines 137–143).

The D-06 availability-unknown case should reuse the EXISTING per-designer miss path, not a new top-level variant: an availability-unreadable designer arrives in `report.missingDesigners` (via gather omitting them from `assessedDesigners`) and renders through the existing `missingDesignerRow` (rows.ts lines 81–88) — the `🤖 ... couldn't read` row. No new rendering code is likely needed; verify the wiring rather than adding a variant.

**Whole-source degraded pattern** (if the entire `/people` pull fails) — copy `renderDegraded` voice (lines 84–93): data-driven source label from `ctx.sourceErrors`, escaped, always returns a complete postable payload, never throws (REL-01 — never silently skip a night).

---

## Shared Patterns

### Boundary validation (zod safeParse, never throw)
**Source:** `src/productive/schemas.ts` (header lines 1–15) + `src/productive/client.ts` `fetchAllPages` (lines 85–118).
**Apply to:** the new availabilities schema + the `/people` parse in gather.
```typescript
const parsed = AllocationResource.safeParse(entry);
if (!parsed.success) { sourceErrors.push("...failed validation (skipped)"); continue; }
```
Every external shape is `.safeParse`d; drift on one entry is skipped, never thrown. Only `safeParse`-usable schemas are exported (no `.parse` wrapper).

### Non-finite coercion (trust-critical arithmetic)
**Source:** `capacity.ts::safeMinutes` (lines 67–69) and `mappers.ts::safe` (lines 65–67) — identical instinct.
**Apply to:** every numeric input in the new availability mapper and the changed `availableMinutes`.
```typescript
function safeMinutes(minutes: number): number {
  return Number.isFinite(minutes) ? minutes : 0;
}
```
NaN / Infinity → 0 so a garbage figure can never reach a surfaced number (D-19 / T-01-03). The CLAUDE.md cardinal rule: all hour/capacity arithmetic is deterministic, exact integer minutes, and fully unit-tested; the LLM never touches numbers.

### Degrade-into-sourceErrors, never crash, never silently skip
**Source:** `gather.ts` throughout (header lines 16–33; the `/allocations` and `/workflow_statuses` optional-pull blocks, lines 488–540).
**Apply to:** the new `/people` availability pull.
A failed/missing source pushes a string into `sourceErrors` and the run continues; the post always happens (REL: never silently skip a night). For availability specifically (D-06), a per-designer failure → omit from `assessedDesigners` → `missingDesigners` "couldn't read", NEVER a silent flat-7.5h fallback.

### Domain/ingestion boundary (raw types never cross)
**Source:** `mappers.ts` header (lines 1–19), `types.ts` (productive) header (lines 1–11), `capacity.ts` header (lines 10–13).
**Apply to:** the new raw availabilities type (stays in `src/productive/`) vs the rostered-minutes domain contract (lives in `src/domain/types.ts`, framework-agnostic). The mapper is the one-way gate.

### Injected-deps determinism (for the new rollup input + gather pull)
**Source:** `report.ts::StudioReportInput` (lines 65–88) and `gather.ts::GatherDeps` (lines 88–100).
**Apply to:** the new rostered-minutes input on `StudioReportInput` and any new fetch in gather. `now` and the page fetcher are injected so tests run offline and deterministically.

---

## Test Patterns

### Capacity arithmetic — `node:test` table of exact-minute assertions
**Source:** `src/domain/__tests__/capacity.test.ts` (lines 11–82).
**Apply to:** new `availableMinutes(rostered, absence)` cases. Copy the exact style:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("availableMinutes (CAP-01 / D-02)", () => {
  it("no absence -> full 450-minute day", () => {
    assert.equal(availableMinutes(0), 450);   // update to (450, 0) for new signature
  });
  it("non-finite absence is treated defensively as 0 absence (D-19, never NaN)", () => {
    assert.equal(availableMinutes(Number.NaN), 450);
  });
});
```
**New cases this phase needs:** rostered 0 → available 0 (`"off"` via `classifyDay(0,0)`); rostered 450 minus 120 absence → 330; rostered 450 with NaN rostered → 0 (defensive); a non-rostered weekday produces `"off"`, not `"underbooked"`. Pin them with concrete integer values like the existing `classifyDay` table (lines 62–82).

### Mapper — partial-builder helpers + `NO_HOLIDAYS` + method tables
**Source:** `src/productive/__tests__/mappers.test.ts` (lines 25–57).
**Apply to:** the availability mapper. Copy the `attrs(partial)` / `booking(partial, rel)` helper idiom and the `const TARGET = "..."` / `NO_HOLIDAYS = new Set()` constants. New tests: 7-element working_hours (Mon=0..Sun=6 → minutes), 14-element identical weeks → week 1, 14-element differing weeks → warns + uses week 1, weekday `0` → 0 minutes, period selection by `[started_on, ended_on]` with `ended_on: null` = open-ended (D-01).

### gather — stubbed `fetchPages` routed by path, fixture-driven
**Source:** `src/productive/__tests__/gather.test.ts` (lines 17–75).
**Apply to:** availability-pull tests. Copy `depsWith(pages)` (lines 67–73) which routes the stub by path and returns an empty success for unrouted paths — add the `/people` route. Prove: happy path threads real rostered minutes into the report; a failed `/people` pull pushes a sourceError and the failed designer lands in `missingDesigners` (mirror the existing partial-pull / `assessedDesigners` test, header lines 9–11).

---

## No Analog Found

None. Every file in scope is an in-place extension of an existing, mature module with a direct in-repo analog. The planner should NOT reach for RESEARCH.md generic patterns — the local code is the template.

---

## Metadata

**Analog search scope:** `src/productive/` (gather, client, schemas, mappers, types + tests), `src/domain/` (capacity, report, types + tests), `src/render/` (renderMessage, rows, cards), `src/config.ts`.
**Files scanned:** 14 source/test files read in full or targeted ranges.
**Pattern extraction date:** 2026-06-04
