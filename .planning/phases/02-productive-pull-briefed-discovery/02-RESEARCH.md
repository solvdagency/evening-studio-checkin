# Phase 2: Productive Pull & Briefed Discovery - Research

**Researched:** 2026-06-03
**Domain:** JSON:API ingestion (Productive.io v2), boundary validation (zod), workflow-status briefed mapping, holiday sourcing (date-holidays)
**Confidence:** HIGH (API field names, pagination, billing/project signals, date-holidays); MEDIUM (live-org-specific values not re-verified this session — see notes)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** "Briefed" is NOT a custom field. It is a **workflow status** (a column) named "Briefed" present in each workflow. Confirmed in SOLVD Standard Workflow (status `101563`, position 3) and SOLVD Design Retainers (status `111230`, position 2), plus 4 other workflows.
- **D-02:** Briefed = task is **at OR past the "Briefed" column** in its own workflow (status position ≥ the Briefed status's position in that workflow). A pure `status == "Briefed"` check would wrongly flag active work.
- **D-03:** Resolve the "Briefed" position **per workflow, dynamically** — do NOT hardcode the 6 status IDs. If a task's workflow has no "Briefed" status, treat as not-briefed (fail safe).
- **D-04:** A booking is **fully briefed** only if ALL of: (a) a task is linked, (b) the task's status is at/past Briefed (D-02), AND (c) the task **description is non-empty**. Missing any → surface by job/task (existence check only, never name a PM).
- **D-05:** Brief checks run on **confirmed bookings only**. Tentative (`draft=true`) bookings are surfaced as shaky but NOT brief-flagged.
- **D-06:** **Internal/non-client bookings** are a known edge. Decision deferred to planning: researcher investigates how reliably internal vs client work can be distinguished before deciding whether to exclude them from brief flags. They still count toward hours regardless. **(Recommendation below — Section "D-06 Internal-vs-Client Distinction".)**
- **D-07:** A booking is **tentative/shaky ⟺ `draft = true`**. `approval_status` is a secondary axis (mostly absence approval) — do NOT use it as the tentative signal for work bookings.
- **D-08:** **Pull window = target day through that target day's Friday.** Filter `after >= window_start`, `before <= window_end`, `canceled = false`, person `any_of [686717, 686712, 686716]`. **Brief checks apply only to target-day bookings**; the wider window feeds the rest-of-week rollup.
- **D-09:** **Normalize every booking to "minutes on the target day"** before handing to Phase 1. Three `booking_method`s: `1` per-day (`time` minutes/day), `3` total-hours (`total_time` / working days in range), `2` percentage (`percentage`/100 × daily capacity 450).
- **D-10:** **Bookings with no linked task** are real, count toward hours AND trigger the missing-task flag (BRIEF-01).
- **D-11:** Time-off = absence bookings (`booking_type=event`), pulled in the same windowed query, split from work bookings (`booking_type=service`). Map to Phase 1 `Absence` with same per-day normalization. Partial-day absences reduce availability proportionally.
- **D-12:** **All non-canceled absences reduce availability** — approved AND pending.
- **D-13:** `HolidaySet` sourced from **`date-holidays` (region NSW, Australia)** for public holidays, PLUS a small committed config list for studio closures (e.g. Christmas shutdown).
- **D-14:** Designers → person IDs: Liam Mills `686717`, Anisha Gittins `686712`, Ella Wright `686716`. Org = SOLVD Agency (slug `34092-solvd-agency`; `X-Organization-Id` candidate `34092` — confirm during execution). Dan/Lexie not tracked.
- **D-15:** `X-Auth-Token` + `X-Organization-Id` live in GitHub Actions encrypted secrets (and gitignored `.env` locally). Non-secret config (person IDs, NSW region, closures list) in a committed config file.

### Claude's Discretion
- HTTP client wrapper shape, pagination loop, `zod` schema layout, module structure, exact Productive→Phase-1 mapping functions.
- Whether designer person IDs live in `types.ts` constants or a new thin `src/config.ts` (Phase 1 noted config.ts can be added "if Phase 2 grows real runtime config" — it now has designer IDs, secrets, closures).
- The internal/client booking-distinction signal (D-06) — researcher recommends below.

### Deferred Ideas (OUT OF SCOPE)
- **Unfilled-template detection** (filled brief vs blank template skeleton) — Phase 5 (LLM). v1 only guards genuinely empty descriptions (D-04).
- **Brief *quality* analysis** — v2 / BQ-01.
- Message rendering / Cards v2 (Phase 3), scheduling (Phase 3), Google Calendar (Phase 4), LLM renderer (Phase 5), idempotency / run logging (Phase 6).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRIEF-01 | For each booking on the target day, verify a task is linked | Booking `task` relationship presence check (Section "Bookings query + include="). No task → flag (D-10). |
| BRIEF-02 | Verify the task is marked "briefed" per the studio's actual Productive convention (discovered, not assumed) | Workflow-status position comparison (Section "Briefed resolution"). Mapping discovered live in CONTEXT.md; mechanism verified against API docs here. |
| BRIEF-03 | Bookings missing a linked task or not briefed are flagged by job/task (never by PM), existence check only | Output a typed `BriefFlag` shape keyed by job/task title + Productive id; never read/surface PM. Section "Brief-check output shape". |
</phase_requirements>

## Summary

Phase 2 is a thin ingestion + brief-discovery layer in front of the already-complete Phase 1 pure core. It does three things: (1) pull the three designers' bookings + absences from Productive's JSON:API `/bookings` endpoint for the target→Friday window, validate the raw JSON with zod at the boundary, and map to the clean Phase-1 `Booking[]`/`Absence[]` contracts; (2) for each target-day work booking, resolve "is it briefed?" by comparing the linked task's workflow-status position against the "Briefed" column's position **in that same workflow**, plus a non-empty-description guard; (3) wire `date-holidays` (NSW) into the `HolidaySet` the Phase-1 clock already accepts.

Every API field name in CONTEXT.md should be treated as the *concept* — the **actual API attribute names differ** in two places and must be corrected in the plan: the field is `booking_method_id` (not `booking_method`), and the boolean flags are `draft` / `canceled` (not `is_draft` / `is_canceled`). Filters are `filter[draft]`, `filter[canceled]`, `filter[booking_type]`, `filter[person_id]`, `filter[after]`, `filter[before]`. Pagination is `page[number]` / `page[size]` (default 30, max 200), with `meta.total_pages` / `meta.total_count` driving loop termination.

**Primary recommendation:** Build one small `fetch`-based JSON:API client (3 headers, a paginate-until-`total_pages` loop, never throws — returns a `Result`-style discriminated union). Run a **single bookings call per window** with `include=task,task.workflow_status,service,event` plus a one-time `workflow_statuses` fetch to map every workflow's Briefed position. Validate with zod `safeParse` at the boundary; map into Phase-1 types in dedicated mapper functions. For D-06, **do not exclude internal bookings from brief flags by default** — instead exclude only when a fail-safe signal (project `project_type_id` = internal AND no `company` relationship) is present, and verify the enum direction live before trusting it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP fetch + pagination | Ingestion (new `src/productive/`) | — | Network I/O; must stay out of `src/domain` (Phase 1 trust boundary). |
| JSON:API response validation (zod) | Ingestion | — | Boundary validation belongs where raw shapes live; domain never sees them. |
| Briefed resolution (position compare) | Ingestion | — | Depends on Productive workflow_statuses; a brand-specific rule, not pure math. |
| Per-day minutes normalization (D-09) | Ingestion (mapper) | — | Translates `booking_method_id`/`time`/`total_time`/`percentage` → `Booking.minutes`. Pure arithmetic but it's *mapping* Productive shapes, so it lives in the mapper, not domain. |
| Capacity / underbooked / rollup math | Domain (Phase 1, done) | — | Already built; Phase 2 only feeds it typed inputs. |
| Holiday set construction (date-holidays + closures) | Ingestion / config | — | Sourcing decision deferred from Phase 1; produces the injected `HolidaySet`. |
| Brief-flag output shape | Ingestion (new typed result) | Domain (consumed by Phase 3) | New data the report doesn't yet carry; design as a clean typed result alongside StudioReport. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node 22 native `fetch` | built-in | HTTP client for Productive | Locked by CLAUDE.md (no axios). Productive is GET + 3 headers + pagination — native fetch is sufficient. |
| `zod` | `^3.25` (3.25.76) or `^4` (4.4.3) | Boundary validation of JSON:API responses | Locked by CLAUDE.md. `.safeParse()` gives the non-throwing boundary the phase requires. |
| `luxon` | `^3.7` (installed 3.7.2) | Date math for window + per-day attribution + holiday date keys | Already a dependency; needed for "minutes on the target day" date-in-range checks and `date-holidays` date parsing. |
| `date-holidays` | `^3.30` (3.30.2, published 2026-05-26) | NSW public holidays → `HolidaySet` | Locked by D-13. Actively maintained. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | `^16` (dev only) | Load `X-Auth-Token` / `X-Organization-Id` from local `.env` | Local dev only; CI uses Actions secrets directly. CLAUDE.md "Development Tools". |
| `node:test` | built-in | Unit-test mappers + briefed-position logic + minutes normalization | Project standard. The minutes math (D-09) and position-compare (D-02) are trust-critical and must be tested with fixtures. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| native `fetch` | `productive-client` (npm) / `BenEdgeContra/productive-client` (GitHub) | CLAUDE.md explicitly says the community client is unmaintained — avoid. Hand-rolling 3 headers + a paginate loop is trivial and keeps zero risky deps. |
| zod 4 | zod 3 | Both current. zod 4 is the latest major. Either is fine; pin whichever the planner picks. The `.safeParse` API used here is identical across both. |

**Installation:**
```bash
npm install zod date-holidays
npm install --save-dev dotenv
```
(`luxon` already installed.)

**Version verification (this session, against npm registry):**
- `date-holidays` 3.30.2, last modified 2026-05-26 — current. `[VERIFIED: npm registry]`
- `zod` 4.4.3 (latest), 3.25.76 (latest v3) — current. `[VERIFIED: npm registry]`
- `luxon` 3.7.2 — already installed. `[VERIFIED: npm registry]`

## Package Legitimacy Audit

> slopcheck was installed but failed to run in this environment (`slopcheck install ... --json` returned a non-zero failure with no parseable output). Per the graceful-degradation rule, packages are tagged `[ASSUMED]` and the planner should gate net-new installs behind a `checkpoint:human-verify`. Registry existence and age were confirmed via `npm view`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `zod` | npm | 7+ yrs | very high (industry standard) | github.com/colinhacks/zod | unavailable | Approved `[ASSUMED]` — locked by CLAUDE.md |
| `date-holidays` | npm | 8+ yrs (3.30.2, 2026-05-26) | high | github.com/commenthol/date-holidays | unavailable | Approved `[ASSUMED]` — locked by D-13 |
| `luxon` | npm | already installed | very high | github.com/moment/luxon | unavailable | Already a dependency |
| `dotenv` | npm | 7+ yrs | very high | github.com/motdotla/dotenv | unavailable | Approved `[ASSUMED]` — dev-only, CLAUDE.md |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck unavailable at research time. All packages above are tagged `[ASSUMED]`; the planner should add a `checkpoint:human-verify` before installing `zod` and `date-holidays`. All four are well-known, long-lived, high-download packages with public source repos, and `zod`/`date-holidays` are pre-locked by CLAUDE.md/D-13.*

## Productive.io API — Verified Facts

> Field-name corrections below override the conceptual names used in CONTEXT.md. CONTEXT.md captured concepts from a live discovery spike; the exact API attribute spellings are corrected here from the official docs.

### Auth headers (every request) `[CITED: developer.productive.io/guides/authorization.html]`
- `X-Auth-Token: <token>` — required on every request. `[VERIFIED: official docs]`
- `X-Organization-Id: <org id>` — required on every request. The docs do **not** state whether it is the bare numeric id or the slug. `[CITED]`
- **D-14 open item:** The slug is `34092-solvd-agency`; the numeric prefix `34092` is the org id. Productive's `X-Organization-Id` takes the **bare numeric organization id** (the integer before the slug), not the full slug. This is consistent with how Productive renders org ids elsewhere, but it was **not re-verified live this session** — `[ASSUMED]`. **Plan must verify with a single authenticated GET (e.g. `/people/686717`) returning 200 vs 403 before trusting `34092`.** A 403 means wrong header value.
- Unauthorized → HTTP `403` with error body. `[VERIFIED: CLAUDE.md research]`
- `Content-Type: application/vnd.api+json` is the JSON:API content type; GET requests generally work without a request body, but set the `Content-Type`/`Accept` to `application/vnd.api+json` to be spec-correct. `[ASSUMED]`

### Pagination `[VERIFIED: developer.productive.io/guides/pagination.html]`
- Params: `page[number]` (which page), `page[size]` (resources per page).
- **Default page size: 30. Maximum: 200.** (Resolves the MEDIUM-confidence flag in CLAUDE.md — the guide page is live and these are the real values.)
- `meta` returns: `current_page`, `total_pages` (= ceil(total_count / page_size)), `total_count`, `page_size`.
- **Loop termination:** request `page[size]=200` (covers any realistic 3-designer window in one page), then loop `for page = 1 .. meta.total_pages`. Terminating on `current_page >= total_pages` is correct and bounded. For 3 designers over ≤5 days, expect a single page — but the loop must still read `total_pages` and not assume one page.

### `/bookings` attributes (exact field names) `[VERIFIED: developer.productive.io/bookings.html]`
| Concept (CONTEXT.md) | **Actual API attribute** | Notes |
|----------------------|--------------------------|-------|
| `booking_method` | **`booking_method_id`** (integer) | `1`=Per day (uses `time`+`hours`), `2`=Percentage (uses `percentage`), `3`=Total hours (uses `total_time`). Matches D-09. |
| `time` | `time` (integer, **minutes per day**) | Per-day minutes for method 1. |
| `total_time` | `total_time` (integer, **total minutes**) | For method 3; divide by working days in range. |
| `percentage` | `percentage` (integer) | For method 2; ÷100 × daily capacity. |
| `hours` | `hours` (integer, per day) | Per-day hours mirror of `time` for method 1; prefer `time` (minutes) to stay in exact-minutes per D-15. |
| `started_on` / `ended_on` | `started_on` / `ended_on` (date strings `yyyy-MM-dd`) | The booking's date range. |
| `is_draft` | **`draft`** (boolean) | Tentative ⟺ `draft=true` (D-07). |
| `is_canceled` | **`canceled`** (boolean) | Filter `canceled=false` (D-08). |
| `booking_type` | `booking_type` (string) | `service` = work booking; `event` = absence booking. |
| `approval_status` | `approval_status` (integer) | `1`=Approved, `2`=Pending, `3`=Rejected, `5`=Canceled. Secondary axis; D-07 says do NOT use for work-booking tentative. D-12: count both approved+pending absences. |

**Booking relationships:** `person`, `service` (work bookings link to a service → budget/project), `event` (absence bookings link to an event), `task` (optional — present when the booking is task-linked), plus `project`, `budget`, `organization`, `approver`, `creator`. `[VERIFIED: bookings.html + reference]`

**Filters (query params, JSON:API `filter[...]` form):** `filter[person_id]` (supports `any_of` for the 3 designers), `filter[after]`, `filter[before]`, `filter[booking_type]` (`service`|`event`), `filter[draft]`, `filter[canceled]`, `filter[booking_method_id]`. `[VERIFIED: bookings.html + filters.html]`

### Tasks (exact field names) `[VERIFIED: developer.productive.io/tasks.html]`
- `title`, `description` (nullable string — markdown; the brief lives here, D-04 non-empty guard checks this), `status` (1=Active, 2=Archived).
- `workflow_status_id` (integer), `workflow_status_name` (string), `workflow_id` (integer).
- **`workflow_status` relationship** → links to a `workflow_statuses` resource. This is the key to D-02.

### Workflow statuses `[VERIFIED: developer.productive.io/workflow_statuses.html via search]`
- Attributes: `name`, `position` (integer — column order), `category_id` (1=Not Started, 2=Started, 3=Closed), `color_id`.
- Relationships: `organization`, `workflow` (the `workflow` relationship is `included: false` by default — request it explicitly if needed).
- **This `position` field is what D-02/D-03 compare against.** The Briefed column has a fixed `position` per workflow (e.g. 3 in SOLVD Standard, 2 in SOLVD Design Retainers per the live spike).

## Architecture Patterns

### System Architecture Diagram

```
GitHub Actions / local run
        │
        ▼
 ┌─────────────────────────────────────────────┐
 │  src/productive/  (NEW — ingestion tier)      │
 │                                               │
 │  config (person IDs, org id, NSW, closures)   │
 │        │                                      │
 │        ▼                                      │
 │  client.ts ── fetch + 3 headers + paginate ──▶ Productive JSON:API
 │        │        (never throws → Result<T>)    │   GET /bookings?filter[...]&include=...
 │        ▼                                      │   GET /workflow_statuses (Briefed positions)
 │  schemas.ts ── zod safeParse (raw JSON:API)   │
 │        │        (invalid shape → degraded)    │
 │        ▼                                      │
 │  briefed.ts ── resolve Briefed position per   │
 │        │        workflow; position-compare    │
 │        ▼                                      │
 │  mappers.ts ── normalize per-day minutes      │
 │        │        (D-09); split service/event;  │
 │        │        Productive → Phase-1 types     │
 │        ▼                                      │
 │  produces: { bookings: Booking[],             │
 │             absences: Absence[],              │
 │             briefFlags: BriefFlag[],          │
 │             assessedDesigners, sourceErrors } │
 │  holidays.ts ── date-holidays(NSW) + closures │
 │              → HolidaySet                     │
 └───────────────┬───────────────────────────────┘
                 │  clean typed objects only
                 ▼
 ┌─────────────────────────────────────────────┐
 │  src/domain/  (Phase 1 — UNCHANGED)           │
 │  computeStudioReport(input) → StudioReport    │
 └─────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── domain/                 # Phase 1 — UNCHANGED. Never imports anything below.
├── productive/             # NEW ingestion tier
│   ├── client.ts           # fetch wrapper: headers, pagination, Result<T> (no throw)
│   ├── schemas.ts          # zod schemas for JSON:API booking/task/workflow_status responses
│   ├── briefed.ts          # Briefed-position map + isBriefed(task) per D-02/D-03/D-04
│   ├── mappers.ts          # per-day minutes (D-09) + Productive→Booking/Absence
│   ├── brief.ts            # BriefFlag output shape (BRIEF-01/02/03)
│   ├── gather.ts           # orchestrates: pull → validate → map → assemble StudioReportInput + briefFlags
│   └── types.ts            # ingestion-internal raw types (NOT exported to domain)
├── config.ts               # NEW: designer person IDs, org id, NSW region, studio closures list
└── holidays.ts             # date-holidays(NSW) + closures → HolidaySet (could live in productive/)
```
- **Discretion call (D-14 / Phase-1 note):** add a thin `src/config.ts` now. Phase 1 explicitly said config.ts can be added "if Phase 2 grows real runtime config" — it now has designer IDs, org id, NSW region, and the closures list. Keep `STUDIO_ZONE`/`TARGET_MINUTES` where they are in `domain/types.ts` (Phase 1 decision) — `config.ts` is for the *ingestion* config only. Secrets (`X-Auth-Token`, `X-Organization-Id` value) come from env, never committed (D-15).

### Pattern 1: Non-throwing boundary client (Result type)
**What:** Every network/parse failure becomes a value, never an exception, so a source failure degrades instead of crashing (REL-01 lives in Phase 3, but Phase 2 must not throw — success criterion 1).
**When to use:** All Productive calls.
**Example:**
```typescript
// Pattern — not copied from a single source; standard TS discriminated-union Result.
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

async function getJson(url: string, headers: Record<string, string>): Promise<Result<unknown>> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} for ${url}` };
    return { ok: true, value: await res.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

### Pattern 2: Paginate until total_pages
**What:** Read `meta.total_pages`, loop pages, concatenate `data` + `included`.
**Example:**
```typescript
// page[size]=200 (max) → realistically one page for 3 designers / few days.
// Always read meta.total_pages; never assume a single page.
let page = 1;
const data: unknown[] = [];
const included: unknown[] = [];
do {
  const url = `${base}/bookings?${qs}&page[size]=200&page[number]=${page}`;
  const r = await getJson(url, headers);
  if (!r.ok) return r;                       // degrade, don't throw
  const parsed = JsonApiPage.safeParse(r.value);
  if (!parsed.success) return { ok: false, error: "shape drift in /bookings" };
  data.push(...parsed.data.data);
  included.push(...(parsed.data.included ?? []));
  if (page >= parsed.data.meta.total_pages) break;
  page += 1;
} while (true);
```

### Pattern 3: zod at the boundary (safeParse, not parse)
**What:** Validate JSON:API shape once; on drift, return a degraded result rather than throwing.
**When to use:** Immediately after every successful fetch.
**Example:**
```typescript
// schemas.ts — validate only the fields the phase actually uses (tolerant of extra fields).
import { z } from "zod";

const BookingAttributes = z.object({
  booking_method_id: z.number(),
  time: z.number().nullable(),
  total_time: z.number().nullable(),
  percentage: z.number().nullable(),
  started_on: z.string(),
  ended_on: z.string(),
  draft: z.boolean(),
  canceled: z.boolean(),
  booking_type: z.string(),          // "service" | "event"
  approval_status: z.number().nullable(),
});
const Relationship = z.object({ data: z.object({ id: z.string(), type: z.string() }).nullable() }).optional();
const BookingResource = z.object({
  id: z.string(),
  type: z.literal("bookings"),
  attributes: BookingAttributes,
  relationships: z.object({
    person: Relationship,
    task: Relationship,
    service: Relationship,
    event: Relationship,
  }),
});
// Use .passthrough()/loose parsing where appropriate so a new Productive field never breaks the pull.
```

### Pattern 4: Briefed resolution (D-02 / D-03 / D-04)
**What:** Build a per-workflow `{ workflowId → briefedPosition }` map once from `/workflow_statuses`, then for each task compare its status position against the Briefed position **in its own workflow**.
**Why this works in one set of calls:** the bookings call with `include=task,task.workflow_status` returns each task's current `workflow_status` resource (which carries `position` and a `workflow` relationship) in the `included` array. To know the *Briefed* position per workflow, fetch `/workflow_statuses` once (filter to name "Briefed" or fetch all and index by `workflow` relationship) and build the map. Then:
```typescript
// briefed.ts
// briefedPosByWorkflow: Map<workflowId, position of the "Briefed" status>
function isBriefed(taskStatus: { workflowId: string; position: number; descriptionNonEmpty: boolean }, map: Map<string, number>): boolean {
  const briefedPos = map.get(taskStatus.workflowId);
  if (briefedPos === undefined) return false;        // D-03: no Briefed column → fail safe
  return taskStatus.position >= briefedPos            // D-02: at or past Briefed
      && taskStatus.descriptionNonEmpty;              // D-04: non-empty guard
}
```
- **Resolving the task's workflow id:** the task's `workflow_status` (included) has a `workflow` relationship → that `workflow.id` is the task's workflow. Match it against the `briefedPosByWorkflow` map.
- **Verify the include chain depth live:** `include=task.workflow_status` should sideload the workflow_status resource. The `workflow_statuses → workflow` relationship is `included:false` by default, so the *Briefed positions* come from the separate `/workflow_statuses` call (indexed by workflow), NOT from a deep `task.workflow_status.workflow` include. This avoids relying on 3-level nested includes (which JSON:API supports but Productive may cap).

### Pattern 5: Per-day minutes normalization (D-09)
```typescript
// mappers.ts — returns minutes on a specific target/window day, in exact minutes.
import { DateTime } from "luxon";
import { STUDIO_ZONE, TARGET_MINUTES } from "../domain/types.ts";

function minutesOnDay(b: BookingAttrs, dayKey: string, workingDaysInRange: number): number {
  const inRange = dayKey >= b.started_on && dayKey <= b.ended_on; // yyyy-MM-dd string compare is safe & exact
  if (!inRange) return 0;
  switch (b.booking_method_id) {
    case 1: return b.time ?? 0;                                   // per day: minutes/day
    case 3: return workingDaysInRange > 0 ? Math.round((b.total_time ?? 0) / workingDaysInRange) : 0;
    case 2: return Math.round(((b.percentage ?? 0) / 100) * TARGET_MINUTES); // % of daily capacity (450)
    default: return 0;                                            // unknown method → 0, never throw
  }
}
```
- **Working-days-in-range (method 3):** count weekdays between `started_on` and `ended_on` inclusive, **excluding weekends and holidays** (reuse the same `HolidaySet`/weekday logic as the clock — consider exporting `isWorkingDay` from `domain/clock.ts` for reuse, or replicate the weekday check). D-09's real example (Ella 480 min over Jun 3–4 = 240/day) implies both days are working days. **Decide and document:** does "working days in range" exclude holidays? Recommend yes, for consistency with the clock — flag for execution if a real method-3 booking spans a holiday.
- **Percentage capacity basis (method 2):** D-09 says use `TARGET_MINUTES` (450). Docs don't pin the exact basis; **confirm during execution if a real percentage booking appears** (per D-09). Until then, 450 is the documented assumption.

### Pattern 6: date-holidays → HolidaySet (D-13)
```typescript
// holidays.ts
import Holidays from "date-holidays";
import { DateTime } from "luxon";
import { STUDIO_ZONE } from "./domain/types.ts";

function nswHolidaySet(years: number[], closures: string[]): ReadonlySet<string> {
  const hd = new Holidays("AU", "NSW");
  const keys = new Set<string>(closures);            // committed studio closures (e.g. Christmas shutdown)
  for (const y of years) {
    for (const h of hd.getHolidays(y)) {
      if (h.type !== "public") continue;             // public holidays only
      // h.date is "YYYY-MM-DD HH:mm:ss" (local). Take the date part / parse via luxon for safety.
      const key = DateTime.fromJSDate(h.start, { zone: STUDIO_ZONE }).toISODate();
      if (key) keys.add(key);
    }
  }
  return keys;
}
```
- `new Holidays("AU", "NSW")` — constructor `(country, state, region)`. `[VERIFIED: github.com/commenthol/date-holidays]`
- `getHolidays(year)` → array of `{ date, start (Date), end (Date), name, type, ... }`. Filter `type === "public"`. `[VERIFIED]`
- **`date` string format gotcha:** the `date` field is a local ISO string commonly `"YYYY-MM-DD HH:mm:ss"` (space-separated, with time) — do NOT pass it straight into a `Set<"yyyy-MM-dd">`. Use `h.start` (a JS Date) parsed via luxon in `STUDIO_ZONE` and `.toISODate()`, OR split `h.date` on the space and take `[0]`. `[ASSUMED: format detail — verify in execution with one console.log of a real holiday object]`
- **Years to enumerate:** the window can span a year boundary (a late-December Friday run targeting early January). Enumerate the current year AND next year, or derive years from the target window. Recommend deriving from the window days to be safe.

### Anti-Patterns to Avoid
- **Leaking Productive shapes into `src/domain`:** never import `productive/types.ts` into a domain file. Phase 1 is deliberately framework-agnostic. Mappers convert at the boundary; only `Booking`/`Absence`/`HolidaySet`/`StudioReportInput` cross in.
- **Using `parse` instead of `safeParse`:** `parse` throws — violates "never throw across the boundary."
- **Hardcoding the 6 Briefed status IDs:** D-03 forbids it. Resolve dynamically from `/workflow_statuses` by name "Briefed".
- **Using `approval_status` as the work-booking tentative flag:** D-07 — tentative is `draft=true`. `approval_status` is for absences.
- **Assuming one page:** always read `meta.total_pages`.
- **Counting tentative bookings for brief checks:** D-05 — brief checks run on confirmed (`draft=false`) only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NSW public holiday calendar | A hardcoded date list | `date-holidays("AU","NSW")` (D-13) | Substitute-day rules (holiday on weekend → Monday), year rollover, and annual updates are error-prone by hand. Library handles them. |
| Response shape validation | Manual `if (typeof x.foo === ...)` checks | `zod` schemas + `safeParse` | One source of truth for the boundary; fails loud on drift; gives typed output for free. |
| Date/timezone/range math | Native `Date` | `luxon` (already in) | CLAUDE.md bans native `Date`. "Day in [started_on, ended_on]" and working-day counting need correct calendar-day logic. |
| Productive API client | The unmaintained `productive-client` npm package | ~40 lines of native `fetch` + a paginate loop | CLAUDE.md flags the community client as unmaintained. The surface here is tiny. |

**Key insight:** The trust-critical parts (per-day minutes D-09, briefed-position D-02) are small pure functions — hand-roll *those* and unit-test them hard. The infrastructure parts (holidays, validation, dates) have sharp edges and mature libraries — use the libraries.

## Runtime State Inventory

Not a rename/refactor/migration phase — this section is omitted (greenfield ingestion layer added in front of unchanged Phase 1 code).

## D-06 Internal-vs-Client Distinction (highest-value deliverable)

**The question:** Can internal/non-client bookings (e.g. "Liam time for AI – Q2 2026") be reliably distinguished from client work so they can be excluded from brief flags (they still count toward hours regardless)?

**Findings (verified against official docs):**

1. **CONTEXT.md's candidate `billing_type_id=3` is on the wrong resource.** On a **service**, `billing_type_id` is the *billing method*: `1`=Fixed, `2`=Actuals, `3`=None (non-billable), `4`=Percentage. `[VERIFIED: developer.productive.io/services.html]` So `billing_type_id=3` means "non-billable" — which catches internal work BUT also catches non-billable *client* work (pro-bono, fixed-scope rework, internal-to-the-client tasks). It is **not a clean internal-vs-client signal.**

2. **The clean signal is at the project level: `project_type_id`.** A project is either a **client project** or an **internal/overhead project**. `project_type_id` (and human-readable `project_type`) is the enum. Internal projects have **no client `company` relationship**; client projects are linked to a `company`. `[VERIFIED: developer.productive.io/projects.html]`

3. **CONFLICT to resolve live — the enum direction is reported inconsistently across sources:** one official-docs read says `1`=Client / `2`=Internal; a help-center read says `1`=Internal / `2`=Client. `[CITED: projects.html — both readings observed]` **Do NOT hardcode the integer.** This is exactly why D-06 was deferred to research with a fail-safe mandate.

**Recommendation (fail-safe):**
- **Do NOT exclude any booking from brief flags by default.** Default posture = brief-check everything (matches Phase 1's strict/cautious posture).
- **Exclude from brief flags ONLY when BOTH hold:** the booking's `service → budget → project` chain resolves to a project with **no `company` relationship** (i.e. an internal/overhead project). Use the *absence of a client company* as the primary signal — it is robust regardless of which integer `project_type_id` uses, and it directly encodes "this is not client work."
- **Cross-check** the `company`-absence signal against `project_type_id` during execution: pull the known internal booking ("Liam time for AI – Q2 2026") live, inspect its project's `company` relationship and `project_type_id`, and confirm they agree. Once confirmed live, the plan can use `project_type_id == <internal value>` as a secondary assertion. Until confirmed, **company-absence is the load-bearing signal.**
- **Resolving project from a booking:** booking → `service` relationship → service's `project`/`budget` relationship → project. This is one or two extra includes (`include=service` on the bookings call; the service carries the project/budget id) or a small follow-up `/projects` fetch for the distinct project ids seen. For 3 designers/few days, the set of distinct projects is tiny — a follow-up batched `/projects?filter[id]=any_of(...)&include=company` call is clean and cheap.
- **Bookings with no task on an internal project:** suppress the missing-task flag (it's expected internal time). Bookings with no task on a **client** project: flag per D-10/BRIEF-01.
- **Hours unaffected:** internal bookings always count toward `Booking.minutes` regardless (D-06 explicit). Only the *brief flag* is suppressed.

**Confidence:** HIGH on the mechanism (project_type_id + company relationship exist and are the right tier); MEDIUM on the exact enum value (must verify live). The company-absence approach sidesteps the enum ambiguity entirely, which is why it's the recommended primary signal.

`[ASSUMED]` items the planner must verify live: (a) the `project_type_id` integer for "internal"; (b) that the known internal booking's project genuinely has no `company`; (c) that the `service → project` (or `service → budget → project`) relationship chain resolves as expected.

## Brief-check Output Shape (BRIEF-03)

A NEW typed result this phase introduces (Phase 3 renders it). Surface by job/task, NEVER by PM.

```typescript
// brief.ts
export interface BriefFlag {
  designerId: DesignerId;
  bookingId: string;            // Productive booking id (for Phase 3 deep-link, MSG-06)
  taskId: string | null;        // null = no task linked (BRIEF-01)
  jobLabel: string;             // project/task title for human display — the "job", never a PM
  reason: "no-task" | "not-briefed" | "blank-brief"; // (a)/(b)/(c) of D-04
  isTentative: boolean;         // for context only; tentative bookings are NOT brief-flagged (D-05)
}
```
- Only emit `BriefFlag`s for **confirmed, target-day** bookings (D-05, D-08), and only for **client** bookings (D-06 recommendation).
- `reason` distinguishes the three failure modes so Phase 3 can word them: missing task (BRIEF-01), task present but status before Briefed (BRIEF-02), task at/past Briefed but description empty (D-04).
- Never read or store the responsible PM (BRIEF-03 / project tone constraint).

## Common Pitfalls

### Pitfall 1: Wrong API field names from CONTEXT.md
**What goes wrong:** zod schema uses `booking_method`, `is_draft`, `is_canceled` → every parse fails → empty/degraded pull every night.
**Why it happens:** CONTEXT.md captured concepts, not exact API spellings.
**How to avoid:** Use `booking_method_id`, `draft`, `canceled` (verified above). Test the schema against a real captured response fixture before trusting it.
**Warning signs:** zod safeParse failures on every booking; "shape drift" degraded message every run.

### Pitfall 2: X-Organization-Id value wrong
**What goes wrong:** Sending the full slug `34092-solvd-agency` (or wrong number) → 403 on every call → silent empty pull.
**How to avoid:** First execution step: a single authenticated GET (e.g. `/people/686717`) and assert 200. If 403, try the alternate value. Document the working value once confirmed.
**Warning signs:** 403 on all calls.

### Pitfall 3: Briefed check too strict (status == "Briefed")
**What goes wrong:** A task that moved past Briefed to "Working on it" gets flagged not-briefed → false alarms → team stops trusting the message.
**Why it happens:** Intuitive but wrong — D-02 explicitly warns this is the load-bearing subtlety.
**How to avoid:** position ≥ Briefed position (at-or-past), per-workflow. Verified live (R1 EDM case).
**Warning signs:** active, clearly-briefed jobs showing as not-briefed.

### Pitfall 4: date-holidays date string mis-parsed
**What goes wrong:** `h.date` is `"2026-01-26 00:00:00"` (space + time); pushed raw into the `Set<"yyyy-MM-dd">` → never matches the clock's `toISODate()` keys → holidays silently ignored.
**How to avoid:** Parse `h.start` (JS Date) via luxon in STUDIO_ZONE → `.toISODate()`, or split `h.date` on space. Verify with one logged real holiday object.
**Warning signs:** a known public holiday (e.g. Australia Day) not skipped by the clock.

### Pitfall 5: Method-3 division by zero / holiday in range
**What goes wrong:** `total_time / workingDaysInRange` with `workingDaysInRange = 0` → Infinity → Phase 1 coerces to 0 (safe) but the booking silently contributes nothing.
**How to avoid:** Guard `workingDaysInRange > 0`; decide whether holidays in the range reduce the divisor (recommend yes, consistent with the clock). Document the choice.
**Warning signs:** a multi-day total-hours booking showing 0 minutes on a valid working day.

### Pitfall 6: Throwing across the boundary
**What goes wrong:** A network blip or an unexpected null relationship throws → the whole nightly run crashes → no post (violates success criterion 1; REL-01 in Phase 3 can't fire if Phase 2 already crashed).
**How to avoid:** Result-type client (Pattern 1), safeParse (Pattern 3), defensive nullish handling in mappers. Return `sourceErrors: string[]` so Phase 3 can build the degraded message.
**Warning signs:** unhandled promise rejection; missing nightly post.

## Code Examples

(See Patterns 1–6 above — all include verified-source-backed code. Sources tagged inline.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `time_offs` as a separate resource | Time-off = absence **booking** (`booking_type=event`) on `/bookings` | Productive v2 model | One windowed `/bookings` call returns both work and absence; split by `booking_type` (D-11). `[VERIFIED]` |
| Cards v1 (Chat) | Cards v2 | — | Out of scope here (Phase 3); noted for continuity. |

**Deprecated/outdated:** none relevant to this phase's API surface.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `X-Organization-Id` takes the bare numeric `34092` (not the slug) | Auth headers | All calls 403 → empty pull. **Verify with one GET first.** Low effort to confirm. |
| A2 | `project_type_id` "internal" integer value (direction disputed across sources) | D-06 | Wrong-direction exclusion would suppress brief flags on client work, or flag internal work. **Mitigated** by using company-absence as the primary signal instead of the integer. |
| A3 | The known internal booking's project has no `company` relationship | D-06 | If internal projects DO carry an internal "company", company-absence fails. Verify live on "Liam time for AI – Q2 2026". |
| A4 | `service → project` (or `service → budget → project`) relationship chain resolves the project from a booking | D-06 | If the chain differs, project-type lookup needs a different path. Verify live. |
| A5 | date-holidays `date` field is `"YYYY-MM-DD HH:mm:ss"` (needs reformatting) | Pattern 6 / Pitfall 4 | Holidays silently dropped from the set. Verify with one logged object; using `h.start` via luxon avoids this regardless. |
| A6 | Method-2 percentage basis = TARGET_MINUTES (450) | Pattern 5 | Wrong per-day minutes for % bookings. D-09 already flags "confirm if a real % booking appears." None seen live yet. |
| A7 | `include=task,task.workflow_status,service,event` is accepted in one call (nested 2-level include) | Pattern 4 | If Productive caps include depth, split into follow-up `/tasks?include=workflow_status` call. Verify live; cost is one extra call. |
| A8 | `Content-Type: application/vnd.api+json` on GETs is accepted/ignored | Auth headers | Minor; most JSON:API servers accept omitting it on GET. |

## Open Questions

1. **Which exact `X-Organization-Id` value works?**
   - What we know: org id is the `34092` prefix of slug `34092-solvd-agency`.
   - What's unclear: bare number vs slug (docs silent).
   - Recommendation: first execution task is a 200/403 probe against `/people/686717`.

2. **Does `include` support the 2-level `task.workflow_status` nesting in one call?**
   - What we know: Productive supports JSON:API side-loading and nested includes; the docs example shows `include=company,project`.
   - What's unclear: whether 2-level nesting is capped.
   - Recommendation: try the combined include; fall back to a follow-up `/tasks?filter[id]=any_of(...)&include=workflow_status` call for the distinct task ids. Either way, fetch `/workflow_statuses` separately for the Briefed positions (the workflow relationship on a status is `included:false`).

3. **Does "working days in range" for method-3 exclude holidays?**
   - What we know: D-09 divides total_time by working days; the clock has `isWorkingDay`.
   - Recommendation: exclude weekends AND holidays for consistency with the clock; document; flag if a real method-3 booking spans a holiday.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Productive.io API + token | All pulls | Stated available (CONTEXT.md: integration available for the spike) | v2 | None — phase blocks without it; verify token works (probe). |
| Node 22 + native `fetch` | HTTP client | ✓ (project standard) | 22.x | — |
| `zod` | Boundary validation | ✗ (not yet installed) | install `^3.25` or `^4` | None — required. |
| `date-holidays` | HolidaySet (D-13) | ✗ (not yet installed) | install `^3.30` | Committed hardcoded NSW list (worse; avoid). |
| `luxon` | Date math | ✓ | 3.7.2 | — |

**Missing dependencies with no fallback:** Productive API token (must be present in env/secrets to run; the pure mappers/briefed logic can be unit-tested with fixtures without it).
**Missing dependencies with fallback:** none material — `zod`/`date-holidays` are installs, not blockers.

## Security Domain

`security_enforcement` not set in config.json (no `security` key). Treating as enabled but light — this phase has a narrow surface (read-only outbound API, no inbound, no auth/session/access-control of its own).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No app-side auth; uses a static API token outbound only. |
| V3 Session Management | no | Stateless nightly run. |
| V4 Access Control | no | No multi-user surface. |
| V5 Input Validation | yes | `zod` `safeParse` validates all external (Productive) JSON at the boundary. |
| V6 Cryptography | no | No crypto; tokens are secrets, not crypto material this phase manages. |
| V7/V14 Secret handling | yes | `X-Auth-Token` / `X-Organization-Id` from env/Actions secrets only; never logged, never committed (D-15). |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leakage (token in logs/commits) | Information disclosure | Env/secret-only (D-15); never log the token or full URL with key; gitignored `.env`. |
| Malformed/unexpected API response crashing the run | Denial of service | `safeParse` + Result-type client; never throw; degrade with `sourceErrors`. |
| Trusting LLM/unvalidated data for arithmetic | Tampering / trust erosion | All math in deterministic code (Phase 1); LLM does none (project constraint). Phase 2 adds no LLM. |
| URL/log injection of secrets | Information disclosure | When logging the request URL for debugging, redact `?key=`/token params (relevant Phase 3; note here for the client wrapper). |

## Sources

### Primary (HIGH confidence)
- developer.productive.io/guides/pagination.html — `page[number]`/`page[size]`, default 30, max 200, `meta.{current_page,total_pages,total_count,page_size}` — VERIFIED (resolves the prior MEDIUM flag)
- developer.productive.io/bookings.html — `booking_method_id` (1/2/3), `time`/`total_time`/`percentage`/`hours`, `started_on`/`ended_on`, `draft`, `canceled`, `booking_type`, `approval_status` (1/2/3/5), relationships person/service/event/task — VERIFIED
- developer.productive.io/tasks.html — `description` (nullable), `status`, `workflow_status_id`/`workflow_status_name`/`workflow_id`, `workflow_status` relationship — VERIFIED
- developer.productive.io/workflow_statuses.html (via search) — `name`, `position`, `category_id`, `color_id`; relationships organization + workflow (included:false) — VERIFIED
- developer.productive.io/services.html — service `billable`, `billing_type`/`billing_type_id` (1 Fixed / 2 Actuals / 3 None / 4 Percentage) — VERIFIED (corrects D-06 candidate)
- developer.productive.io/projects.html — `project_type_id`, `project_type`, `company`/`company_id` relationship; internal vs client — VERIFIED (enum direction disputed — see A2)
- developer.productive.io/guides/authorization.html — X-Auth-Token + X-Organization-Id required every request — VERIFIED (header value format not specified — A1)
- github.com/commenthol/date-holidays — `new Holidays("AU","NSW")`, `getHolidays(year)` → `{date,start,end,name,type}`, filter `type==="public"` — VERIFIED
- help.productive.io/.../tentative-bookings — tentative bookings UI/data semantics — VERIFIED (note conflict with locked decisions, see below)

### Secondary (MEDIUM confidence)
- WebSearch (multiple, cross-referenced with productive.io docs) — filter param forms `filter[draft]`/`filter[canceled]`/`filter[booking_type]`, include side-loading `include=task,task.workflow_status,...`, absence event relationship + absence_type "time_off", approval workflow states
- npm registry (`npm view`) — date-holidays 3.30.2 (2026-05-26), zod 4.4.3 / 3.25.76, luxon 3.7.2

### Tertiary (LOW confidence)
- date-holidays `date` string exact format ("YYYY-MM-DD HH:mm:ss") — inferred from library convention; verify live (A5) — mitigated by using `h.start` via luxon

### Note on a conflict with locked decisions (flagged, not re-litigated)
- The Productive **help center** says tentative bookings are "a distinct state (not draft)" and are "excluded from capacity calculations." CONTEXT.md **D-07** (from the live discovery spike) maps tentative ⟺ `draft=true`, and Phase 1 **D-04/D-05** deliberately COUNTS tentative toward hours but never closes the gap. These are **locked decisions confirmed against live SOLVD data** — the help-center wording describes Productive's *own* capacity UI, not this tool's chosen (stricter) treatment. **No change recommended;** documented so the planner is aware the UI's "tentative" terminology and this tool's `draft`-based mapping are intentionally different lenses. If a live booking shows a tentative state that is NOT `draft=true`, that would contradict D-07 and must be surfaced — recommend a quick live check during execution.

## Metadata

**Confidence breakdown:**
- API field names / pagination / auth headers: HIGH — verified against official productive.io docs this session.
- Briefed mechanism (position compare): HIGH — workflow_statuses `position` + task `workflow_status` relationship verified; live SOLVD positions from the prior spike (CONTEXT.md).
- D-06 internal/client signal: MEDIUM-HIGH — mechanism verified; recommended company-absence signal sidesteps the disputed enum; live verification still required.
- date-holidays wiring: HIGH on API, MEDIUM on date-string format (mitigated).
- Standard stack: HIGH — locked by CLAUDE.md, versions verified on npm.

**Research date:** 2026-06-03
**Valid until:** ~2026-07-03 (Productive API stable; re-verify the X-Organization-Id probe and D-06 enum live at execution regardless of date).
