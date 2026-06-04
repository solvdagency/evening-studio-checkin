# Phase 4: Calendar & Meeting Reconciliation - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 11 new / 3 modified
**Analogs found:** 12 / 14 (2 net-new with no analog: `auth.ts`, `spike.ts`)

This codebase is small, mature, and deeply idiomatic — Phase 4 is almost entirely
*reuse* of the Phase 1–3 patterns. The single genuinely new external surface is one
`events.list` call per designer. Every other new file has a near-exact twin in
`src/productive/` or `src/render/`. Copy those twins line-for-line where noted.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/calendar/auth.ts` | config/auth | request-response | (none — new auth surface; see No Analog) | new |
| `src/calendar/client.ts` | service (network boundary) | request-response | `src/productive/client.ts` | role + flow exact |
| `src/calendar/schemas.ts` | model (zod boundary) | transform | `src/productive/schemas.ts` | exact |
| `src/calendar/gather.ts` | service (ingestion root) | request-response | `src/productive/gather.ts` | exact |
| `src/calendar/filter.ts` | utility (pure rules) | transform | `src/productive/brief.ts` / `briefed.ts` | role-match |
| `src/calendar/reconcile.ts` | service (pure reconciler) | transform | `src/productive/brief.ts` (`assessBriefs`) | role-match |
| `src/calendar/spike.ts` | script (standalone) | batch / file-I/O | (none — new standalone probe; see No Analog) | new |
| `src/calendar/__tests__/*.test.ts` | test | — | `src/productive/__tests__/gather.test.ts` | exact |
| `src/calendar/__fixtures__/*.json` | test fixture | — | `src/productive/__fixtures__/bookings-page.json` | exact |
| `src/config.ts` (MODIFY) | config | — | (self — existing constants) | self |
| `src/render/cards.ts` (MODIFY) | model (type contract) | — | `TentativeNote` / `RenderContext` (same file) | self |
| `src/render/rows.ts` (MODIFY) | component (row builder) | transform | `buildRow` ⚠️/📄 sub-lines (same file) | self |
| `src/render/renderMessage.ts` (MODIFY, maybe) | component | — | `renderTemplate` busy-row wiring (same file) | self |
| `src/index.ts` (MODIFY) | controller (composition root) | request-response | `runNightly` / `buildRenderContext` (same file) | self |

---

## Pattern Assignments

### `src/calendar/client.ts` (network boundary, request-response)

**Analog:** `src/productive/client.ts` — copy the `Result<T>` type and the
non-throwing `getJson`/wrapper structure exactly.

**Reuse the existing `Result<T>` type** (do NOT redefine it). Import it:
`src/productive/client.ts` lines 23-25:
```typescript
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

**Non-throwing GET pattern** (`client.ts` lines 62-75) — the calendar `events.list`
call must be wrapped the SAME way: any throw becomes a Result error, the error
string carries only status/message (never the SA key or token):
```typescript
export async function getJson(url, headers): Promise<Result<unknown>> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, value: await res.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```
For calendar, the googleapis client throws on error rather than returning a status,
so the equivalent is: `try { const res = await client.events.list(...); return { ok: true, value: res.data.items ?? [] }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }`. Same contract: **never throws across the boundary.**

**Security note carried from `client.ts` line 7-9 docblock:** the error string must
NOT echo headers/credentials. Mirror that exactly for the SA key.

---

### `src/calendar/schemas.ts` (zod boundary, transform)

**Analog:** `src/productive/schemas.ts` — mirror the tolerant, `.safeParse`-only,
extra-field-tolerant posture exactly. The RESEARCH §"zod boundary for the Event
shape" (lines 335-356) gives the literal schema to build.

**Tolerance pattern** (`schemas.ts` lines 29-35, the `Relationship` shape): every
nested object uses `.loose()` and optional fields so a new Google field never breaks
the parse. Apply the same to `EventDateTime` and `attendees[]`.

**Export posture** (`schemas.ts` docblock lines 11-15): export ONLY safeParse-usable
schemas; never export a `.parse` wrapper (throws across the boundary).

**The Event schema to build** (from RESEARCH, validate only fields this phase reads):
```typescript
import { z } from "zod";
const EventDateTime = z.object({
  date: z.string().optional(),      // present ⟺ all-day
  dateTime: z.string().optional(),  // present ⟺ timed (RFC3339)
  timeZone: z.string().optional(),
}).loose();
export const CalendarEventResource = z.object({
  id: z.string(),
  status: z.string().optional(),       // confirmed/tentative/cancelled (NOT the RSVP)
  summary: z.string().optional(),
  htmlLink: z.string().optional(),     // MSG-06 deep-link
  eventType: z.string().optional(),    // default/outOfOffice/focusTime/workingLocation
  start: EventDateTime.optional(),
  attendeesOmitted: z.boolean().optional(),
  attendees: z.array(z.object({
    self: z.boolean().optional(),
    responseStatus: z.string().optional(),  // needsAction/declined/tentative/accepted
  }).loose()).optional(),
}).loose();
```

---

### `src/calendar/gather.ts` (ingestion root, request-response)

**Analog:** `src/productive/gather.ts` — this is the closest and most important
analog. Copy its entire skeleton: injected-deps object, the `degraded()` helper,
the per-entry `safeParse` loop that pushes to `sourceErrors` and `continue`s on
drift, and the well-formed-object-on-failure contract.

**Result interface shape** (`gather.ts` lines 66-79) — mirror as `CalendarResult`:
```typescript
export interface GatherResult {
  bookings: DatedBooking[];
  absences: DatedAbsence[];
  briefFlags: BriefFlag[];
  holidays: HolidaySet;
  assessedDesigners: DesignerId[];
  sourceErrors: string[];   // ← non-empty ⇒ degraded run, never a crash
}
```
Calendar equivalent: `{ eventsByDesigner: Record<DesignerId, FilteredEvent[]>, sourceErrors: string[] }` (see Architecture diagram in RESEARCH lines 132-135).

**Injected-deps for determinism** (`gather.ts` lines 86-93) — copy this exactly so
tests run with no network. The calendar twin injects `now` + a stubbable
`fetchEvents(subject, window)`:
```typescript
export interface GatherDeps {
  now: DateTime;
  fetchPages?: (path, query) => Promise<Result<{ data; included }>>;
}
```

**The non-throwing per-entry validate loop** (`gather.ts` lines 379-405) — THE core
degrade pattern to replicate per designer's events:
```typescript
for (const entry of bookingsResult.value.data) {
  const parsed = BookingResource.safeParse(entry);
  if (!parsed.success) {
    sourceErrors.push("a booking entry failed validation (skipped)");
    continue;   // drift on one entry → skip, never throw
  }
  // ... use parsed.data
}
```

**Degrade-don't-throw on a failed source** (`gather.ts` lines 369-373) — a failed
calendar read for a designer pushes one `sourceErrors` string and the run continues
(REL-01); the existing 🤖 degraded card (renderMessage.ts `renderDegraded`, lines
84-93) is already data-driven off `ctx.sourceErrors` and will read "Couldn't reach
Calendar" with NO renderer change:
```typescript
if (!bookingsResult.ok) {
  sourceErrors.push(`bookings pull failed: ${bookingsResult.error}`);
  return degraded();
}
```

**The clock/window derivation** (`gather.ts` lines 332-337) — reuse the SAME target-day
derivation so calendar and productive agree on "tomorrow":
```typescript
const holidays = buildHolidaySet(yearsForWindow(deps.now), STUDIO_CLOSURES);
const targetDay = nextWorkingDay(deps.now, holidays);
const targetKey = targetDay.toISODate() ?? "";
```
(For calendar you need only `targetDay`/`targetKey`, not the full window.)

---

### `src/calendar/reconcile.ts` (pure reconciler, transform)

**Analog:** `src/productive/brief.ts` `assessBriefs` — a pure function that takes
pre-resolved inputs + a lookup map and returns per-designer flags, applying
suppression gates. Mirror that signature shape.

**Pure-inputs contract** (`gather.ts` `buildAssessInputs` lines 554-591 + the
`assessBriefs(inputs, briefedMap)` call line 513): the reconciler receives
already-filtered counting meetings + a ready-made `Set<companyId>` per designer +
the committed alias map. It reads the report's figures but **NEVER recomputes hours**
(CLAUDE.md trust boundary; `capacity.ts` docblock lines 11-13; anti-pattern in
RESEARCH line 271).

**The reconcile core** (RESEARCH Pattern 4, lines 242-250) — bias-against-false-
positives is the prime directive:
```typescript
for (const meeting of countingMeetings) {
  const meetingClient = matchTitleToClient(meeting.summary, CLIENT_ALIAS_MAP);
  if (meetingClient === null) continue;          // uncertain → STAY QUIET (D-04)
  if (bookedClientIdsToday.has(meetingClient.companyId)) continue; // covered same-day
  worthALook[designerId].push({ title, start, link });
}
```

**Output type** mirrors the `BriefFlag[]` / per-designer grouping `assessBriefs`
produces — a `Record<DesignerId, Array<{title, start, link}>>` consumed by rows.ts.

---

### `src/calendar/filter.ts` (pure rules, transform)

**Analog:** `src/productive/briefed.ts` (small pure predicate helpers) + the
`descriptionNonEmpty` style guard in `gather.ts` lines 121-125 (pure string
predicate). Each mechanical filter is a small pure boolean function.

**The overhead matcher** (RESEARCH Pattern 3, lines 232-234) — case-insensitive
substring against committed phrases:
```typescript
const isOverhead = (title: string) =>
  MEETING_IGNORE_LIST.some((p) => title.toLowerCase().includes(p.toLowerCase()));
```

**Mechanical filters** (RESEARCH Pitfalls 1-4): `isDeclined` reads the `self:true`
attendee's `responseStatus === "declined"` (NOT event-level `status`); `isAllDay`
⟺ `start.date` present; `isOutOfOffice` ⟺ `eventType ∈ {outOfOffice, focusTime,
workingLocation}`; `isSolo` ⟺ `attendees` absent OR (≤1 and only `self:true`);
`isAfterHours` parses `start.dateTime` with luxon `.setZone("Australia/Sydney")`
and compares the local hour to `WORK_DAY_START`/`WORK_DAY_END` (RESEARCH Pitfall 2).
Solo + eventType reliability are **spike-pinned** (A1/A2) — build the golden fixture
from the real shape, not the assumption.

---

### `src/calendar/__tests__/*.test.ts` + `__fixtures__/*.json`

**Analog:** `src/productive/__tests__/gather.test.ts` (read in full) — copy the
test harness exactly:
- `node:test` + `node:assert/strict` (project convention, NO Jest/Vitest) —
  `gather.test.ts` lines 17-18.
- A **stubbed fetcher** so tests are offline/deterministic — lines 1-15 docblock +
  the `GatherDeps` stub pattern.
- A fixed studio-zone `NOW` const — line 32: `DateTime.fromISO("2026-06-03T17:00:00", { zone: STUDIO_ZONE })`.
- **Load JSON fixtures via `fileURLToPath(new URL("../__fixtures__/...", import.meta.url))`** — lines 35-44.
- Three test classes to mirror: happy path (golden fixtures), forced-error stub
  (degrade → sourceErrors), partial/empty path.

Fixtures mirror `src/productive/__fixtures__/bookings-page.json` (real captured
shape, zod-valid). Build them from the spike's real events incl. the two D-09 golden
cases (covered 3 Jun, worth-a-look 26 May) + one each of declined/all-day/OOO/solo/
after-hours/overhead.

---

### `src/config.ts` (MODIFY — add committed non-secret config)

**Analog:** the existing exported constants in the same file (`DESIGNER_PERSON_IDS`
lines 28, `DESIGNER_NAMES` lines 36-40, `BRAND_COLORS` lines 93-99). Follow the
exact style: `export const NAME = [...] as const;` with a per-constant docblock
explaining the decision it satisfies.

**Add** (RESEARCH Patterns 3, lines 224-230; client-alias shape lines 379-394):
```typescript
export const MEETING_IGNORE_LIST: readonly string[] = [
  "Daily Stand-up", "Weekly WIP", "Creative WIP", "Creative team",
];
export interface ClientAlias { companyId: string; companyName: string; code?: string; aliases: string[]; }
export const CLIENT_ALIAS_MAP: readonly ClientAlias[] = [
  { companyId: "1333899", companyName: "FDC Construction", code: "FDCC",
    aliases: ["FDC", "FDC Construction", "FDCC", "IPO Launch"] }, // spike confirms/extends
];
export const DESIGNER_CALENDAR_EMAILS = {
  "686717": "liamm@solvdagency.com.au",
  "686712": "anishag@solvdagency.com.au",
  "686716": "ellaw@solvdagency.com.au",
} as const; // keyed by person id to align with DESIGNER_PERSON_IDS/NAMES
export const WORK_DAY_START = "08:30" as const;
export const WORK_DAY_END = "17:30" as const;
```
**Trust note** (config.ts docblock lines 1-8): the SA key is a SECRET and goes in
`process.env.GOOGLE_SA_KEY`, NEVER in this committed file — same rule as the
Productive token. Only non-secret config (the maps/lists/emails above) lives here.

---

### `src/render/cards.ts` (MODIFY — add the `worthALook` RenderContext field)

**Analog:** the `tentativeNotes` field on `RenderContext` (same file, lines 162-163)
and the `TentativeNote` interface (lines 140-149). The 📅 field follows the IDENTICAL
"presentation-only detail lives in RenderContext so src/domain stays untouched"
pattern documented there.

**Add to `RenderContext`** (after line 163, RESEARCH Pattern 5 lines 259-260):
```typescript
/** Per-designer "worth a look" meetings → the 📅 sub-line (D-14). Presentation-only. */
worthALook?: Record<string, Array<{ title: string; start: string; link: string }>>;
```
Mirror the existing per-field docblock style (every `RenderContext` field documents
its decision). Do NOT touch the Cards v2 widget types — the 📅 line reuses the
existing `decoratedText` `text` field.

---

### `src/render/rows.ts` (MODIFY — emit the 📅 sub-line)

**Analog:** the ⚠️ tentative block (`rows.ts` lines 139-143) and the 📄 brief loop
(lines 146-151) inside `buildRow` — the 📅 line is the EXACT same nested-sub-line
widget pattern.

**Reuse `escapeHtml`** (lines 24-29) and `muted` (lines 37-39) — already in the file.

**The 📅 block to add** (after the 📄 loop, RESEARCH Pattern 5 lines 262-265):
```typescript
for (const m of ctx.worthALook?.[d.designerId] ?? []) {
  const titleLink = `<a href="${escapeHtml(m.link)}">${escapeHtml(m.title)}</a>`; // MSG-06 deep-link
  lines.push(`📅 ${titleLink} · ${muted(escapeHtml(m.start))} · ${muted("worth a look")}`);
}
```
**Security** (rows.ts docblock lines 18-20): every dynamic string (title, link, start)
HTML-escaped before insertion — exactly as the 📄/⚠️ lines do. **Voice** (D-04):
soft "worth a look" only, never "conflict". Extend `buildRow`'s `ctx` param type to
carry `worthALook` (mirror how `tentativeNotes`/`leaveNotes` are threaded in the
`ctx: { ... }` object at lines 102-108).

---

### `src/render/renderMessage.ts` (MODIFY — thread `worthALook` into `buildRow`)

**Analog:** the existing `buildRow(d, { ... })` call inside the busy-rows loop
(`renderMessage.ts` lines 142-149). Add `worthALook: ctx.worthALook` to that
options object — the same way `tentativeNotes`/`leaveNotes`/`missingDesigners`
are already passed through. No other change; the variant cascade is untouched.

---

### `src/index.ts` (MODIFY — wire the calendar source + reconciler)

**Analog:** the existing composition in `runNightly` (lines 130-172) and
`buildRenderContext` (lines 84-123) — same file.

**The integration point** (RESEARCH diagram lines 124-156): after `gather` (line 138)
and `computeStudioReport` (line 150), call `gatherCalendar({ now })`, then the pure
`reconcileMeetings(report, eventsByDesigner, bookedClientsByDesignerDay, CLIENT_ALIAS_MAP)`,
then put the result on `ctx.worthALook`. Calendar `sourceErrors` are **concatenated
into the existing `g.sourceErrors`** before `buildRenderContext` so the existing 🤖
degraded path covers a calendar failure (REL-01).

**The two-path reliability rule** (index.ts docblock lines 19-31) — calendar is a
DATA source: a failure degrades-and-posts (exit 0), it is NEVER the POST-failure
exit-1 path. Mirror exactly how a Productive failure is handled (it never reaches
the exit-1 branch at lines 165-168).

**Determinism boundary** (index.ts docblock lines 13-17): this is the ONE clock/env
boundary. `gatherCalendar` reads `process.env.GOOGLE_SA_KEY` HERE (or inside
`src/calendar/auth.ts` called from gather) — never in the pure reconciler/filter.

---

## Shared Patterns

### Result type (non-throwing boundary)
**Source:** `src/productive/client.ts` lines 23-25.
**Apply to:** `src/calendar/client.ts` (import, do not redefine).
The whole codebase models failure as a `Result<T>` VALUE, never an exception. The
calendar client's `events.list` wrapper returns `Result<RawEvent[]>`.

### zod safeParse at the boundary
**Source:** `src/productive/schemas.ts` (docblock lines 1-15) + the per-entry loop in
`src/productive/gather.ts` lines 381-405.
**Apply to:** `src/calendar/schemas.ts` + the validate loop in `src/calendar/gather.ts`.
`.safeParse` ONLY (never `.parse`); a drift on one entry pushes a `sourceErrors`
string and `continue`s — it never crashes the night.

### Degrade-via-sourceErrors (additive source, never throws)
**Source:** `src/productive/gather.ts` lines 340-347 (`degraded()`) + 369-373 (push +
return); consumed by `src/render/renderMessage.ts` lines 84-93 (`renderDegraded`,
already data-driven off `ctx.sourceErrors`).
**Apply to:** `src/calendar/gather.ts` + the `src/index.ts` concat of calendar
`sourceErrors` into the existing list. A calendar outage → 🤖 degraded card that still
posts (REL-01). **No renderer change needed** — `renderDegraded` joins `ctx.sourceErrors`
verbatim, so it already reads "Couldn't reach Calendar …".

### Injected-deps determinism (stubbable, no system clock / no network in tests)
**Source:** `src/productive/gather.ts` lines 86-93 (`GatherDeps`) + the
`fetchPages = deps.fetchPages ?? fetchAllPages` default at line 321; test stub usage in
`src/productive/__tests__/gather.test.ts`.
**Apply to:** `src/calendar/gather.ts` (`now` + stubbable `fetchEvents`) and all
`src/calendar/__tests__/`.

### Pure-rules-over-injected-inputs (the trust boundary)
**Source:** `src/domain/capacity.ts` docblock lines 11-13; `src/productive/brief.ts`
`assessBriefs`; anti-pattern note in RESEARCH line 271.
**Apply to:** `src/calendar/reconcile.ts` + `src/calendar/filter.ts`. They read the
`StudioReport` figures + a ready-made booked-client `Set` — they NEVER recompute
minutes and NEVER read the clock or network. `src/domain` is not imported by, and
does not import, the calendar layer.

### Presentation-only detail in RenderContext (keeps src/domain untouched)
**Source:** `src/render/cards.ts` `TentativeNote` (lines 140-149) + `leaveNotes`
(lines 168-175) — both document "carried in RenderContext so the domain stays
untouched".
**Apply to:** the new `worthALook` field — same rationale, same per-field docblock.

### Nested sub-line in the designer row
**Source:** `src/render/rows.ts` ⚠️ block lines 139-143, 📄 loop lines 146-151.
**Apply to:** the 📅 block — identical `lines.push(...)` into the single `<br>`-joined
`decoratedText.text`, with `escapeHtml` on every dynamic value.

### Secret-from-env, never committed/logged
**Source:** `src/productive/client.ts` `authHeaders` lines 35-54 + docblock lines 4-9;
`src/index.ts` webhook-URL handling lines 28-31, 160.
**Apply to:** `src/calendar/auth.ts` — read `process.env.GOOGLE_SA_KEY` (JSON.parse),
NEVER log the parsed key or the minted token; the error string carries status/message
only (V2/V6/V7 in RESEARCH §Security).

---

## No Analog Found

| File | Role | Data Flow | Reason / What to use instead |
|------|------|-----------|------------------------------|
| `src/calendar/auth.ts` | auth | request-response | No existing googleapis/JWT/OAuth auth in the repo — Productive auth is three plain headers (`client.ts` `authHeaders`). Use **RESEARCH Pattern 1 (lines 184-195)** verbatim: `new google.auth.JWT({ email, key, scopes, subject })` → `google.calendar({version:"v3", auth})`. Borrow only the **secret-from-env / never-log** posture from `authHeaders` (lines 35-54). |
| `src/calendar/spike.ts` | script | batch / file-I/O | No standalone script exists yet (no `scripts/` dir; all code is library + tests). It is a one-off probe, NOT part of the nightly path. Use **RESEARCH §"The labelling spike" (lines 358-375)**: reuse `buildCalendarClient` + `productive/client.ts fetchAllPages`, write a Markdown table to a gitignored scratch file (`.planning/phases/04-.../spike-output.md`); NEVER posts to Chat. |

**Partial planning unknown (not a missing analog) — Open Q1 / Assumption A4:**
The reconciler needs each designer's `Set<companyId>` booked on the target day. The
data IS fetched today — `gather.ts` requests
`task.project.company` (line 361) so the company is in `bookingsResult.value.included`
— but it is **thrown away**: `mappers.ts` reduces a booking to `{ designerId, minutes,
isTentative }` (confirmed line 165) and `indexProjects` (gather.ts lines 172-191) reads
`project.company` only as a boolean (client-vs-internal), discarding the id. **Planner
decision:** surface a `bookedClientsByDesignerDay: Record<DesignerId, Set<companyId>>`
by reading the SAME already-fetched `included` company linkage (no second `/bookings`
call) inside an extended `gather` or a thin sibling, threaded via `index.ts`. Do NOT
add `company` to the domain `Booking` type (keeps `src/domain` untouched). The spike's
Productive pull can dump the exact `task.project.company` linkage path to confirm.

---

## Metadata

**Analog search scope:** `src/productive/`, `src/render/`, `src/domain/`, `src/config.ts`,
`src/index.ts`, `src/**/__tests__/`, `src/**/__fixtures__/`.
**Files scanned:** 9 source files read in full or targeted (gather.ts, client.ts,
schemas.ts, cards.ts, rows.ts, config.ts, index.ts, renderMessage.ts, gather.test.ts)
plus targeted greps of report.ts, mappers.ts, capacity.ts, types.ts.
**Pattern extraction date:** 2026-06-04
**Cross-references:** 04-CONTEXT.md (D-01..D-14), 04-RESEARCH.md (Patterns 1-5,
Pitfalls 1-5, Open Q1, recommended structure lines 159-172).
