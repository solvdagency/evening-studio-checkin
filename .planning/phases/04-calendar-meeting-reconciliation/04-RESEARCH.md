# Phase 4: Calendar & Meeting Reconciliation - Research

**Researched:** 2026-06-04
**Domain:** Unattended multi-user Google Calendar read (`googleapis` service-account + DWD) → deterministic per-day, per-client meeting↔booking reconciliation → new 📅 card sub-line
**Confidence:** HIGH on the Calendar API surface and integration shape; MEDIUM on two live-data behaviours (solo-event attendee representation; whether the existing pull already carries `company_id`) that the labelling spike must pin.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A meeting is **"worth a look"** when it is a *counting* meeting (D-05/D-06) **AND** the designer has **no confirmed Productive booking for that meeting's client on the same target day**. Otherwise **covered** and never shown.
- **D-02:** **"Covered" is same-day only.** Booked on the client the day before/after does NOT cover the meeting. (Live-validated against Liam's 26 May FDC case; strict same-day chosen over ±1-day/whole-week.)
- **D-03:** Matching key is the **client/company**, not the specific job. Meeting → client by fuzzy-matching its **title** against the names/codes of the companies the designer is booked on that day. Bookings carry `company_id`/`project_id`; the day's booked-client set is resolvable; matched against the title via the client-alias map (D-09).
- **D-04:** **Bias against false positives is the prime directive.** When matching is uncertain, **stay quiet** (treat as covered). Surfaced items always use the soft "worth a look" voice — never "conflict" (MEET-04).
- **D-05:** **Overhead ceremonies never count and are never reconciled:** Daily Stand-up, (Team) Weekly WIP, Creative team review, Creative WIP. Excluded via the ignore-list (D-07).
- **D-06:** **Everything else that consumes work-day time counts and should be in Productive** — client meetings (FDC), 1:1s, training, Problem/SOLVD Fortnightly. **Problem/SOLVD is NOT overhead** but still needs to be in Productive.
- **D-06b:** **Not-work events excluded mechanically:** solo blocks (only the designer invited), anything starting outside work hours (D-08), and lunch.
- **D-07:** Overhead ignore-list = **committed list of specific title phrases**, case-insensitive substring match (e.g. "Daily Stand-up", "Weekly WIP", "Creative WIP", "Creative team"). **Specific phrases, not loose keywords** (so "FDC WIP" is NOT swallowed). Lives in committed config.
- **D-08:** Read the **target day's** events per designer in **Australia/Sydney**, recurring **expanded** (`singleEvents`). Exclude in code: **declined** (designer's own response status), **all-day**, **out-of-office** (MEET-05); **solo** (only the designer as attendee); events starting **outside 08:30–17:30** studio time. Response status is otherwise NOT a usefulness signal — real meetings sit at `needsAction`; only explicit *declined* is used.
- **D-09:** Before launch, run a **live-data labelling spike**: ~3–4 weeks of all three calendars + bookings; Liam labels each distinct meeting (overhead / counts / not-work + confirms client names). Output committed: (1) ignore-list phrases, (2) counts-vs-not-work rules, (3) **client-alias map** (title token → Productive company; "FDC" → "FDC Construction"/"FDCC"), (4) **golden test fixtures** (incl. the two validated cases). Treat all three the same; surface per-designer quirks (D-13).
- **D-12:** **Live from day one** — no shadow mode, no pilot gate. Safe because of the soft voice (D-04) + classifier/ignore-list in committed config (tuned in seconds).
- **D-13:** One shared rule set for all three. Overhead ignore-list is studio-wide. Matching is naturally per-designer (own calendar vs own booked clients) over a shared alias map.
- **D-14:** A **📅 sub-line nested under the relevant designer's row** (same pattern as Phase 3 ⚠️/📄 sub-lines), NOT a separate section. Format: **`📅 {Meeting title} · {start time} · worth a look`**. The meeting title **deep-links to the Calendar event** (MSG-06). 📅 is new and distinct from 📄/⚠️.

### Claude's Discretion
- The exact `googleapis` JWT + DWD wiring (subject impersonation per designer), the new `src/calendar/` source layer, and how a calendar-read failure threads into the existing degrade-don't-throw path (a new `sourceErrors` entry → the existing 🤖 degraded treatment; calendar is additive, never throws).
- The fuzzy title→client match algorithm details (tokenisation, alias map shape) — to be pinned by the spike (D-09).

### Deferred Ideas (OUT OF SCOPE)
- **LLM adjudication of fuzzy meetings** — Phase 5 (LLM-02). This phase is deterministic rules only; the rules + fixtures become the LLM's reference/fallback.
- **Idempotency + run logging** for the calendar source — Phase 6 (REL-03).
- **A formal shadow/pilot mode toggle** — consciously declined (D-12).
- **Per-meeting time-of-day vs booked-time-block matching** — impossible today (Productive bookings are day-granular, no clock times); same-day client matching (D-02/D-03) is the deliberate substitute.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEET-01 | Read the target day's events from the three designers' Google calendars | §Standard Stack (`googleapis ^173`), §Code Examples (JWT+subject per designer, `events.list`), §Architecture Pattern 1 (new `src/calendar/gather` mirroring `productive/gather.ts`) |
| MEET-02 | Known recurring overhead meetings excluded from reconciliation | §Architecture Pattern 3 (ignore-list: committed phrases, case-insensitive substring), D-07. Real seed phrases in §Code Examples |
| MEET-03 | Ad-hoc/client meetings reconciled against that designer's bookings; clearly-covered not flagged | §Architecture Pattern 4 (same-day booked-client set ← Productive), §Open Question 1 (does the existing pull carry `company_id`?), §Don't Hand-Roll (fuzzy match via alias map) |
| MEET-04 | Unaccounted meetings surfaced as "worth a look", bias against false positives | §Architecture Pattern 5 (`worthALook` RenderContext field → 📅 sub-line in `rows.ts`), D-04 stay-quiet-on-uncertainty |
| MEET-05 | Declined, all-day, out-of-office excluded | §Architecture Pattern 2 (mechanical filters from confirmed Event fields: `attendees[self].responseStatus==='declined'`, `start.date` present, `eventType==='outOfOffice'`), §Common Pitfalls 1–3 |
</phase_requirements>

## Summary

Phase 4 adds one new ingestion source (Google Calendar) and one new deterministic reconciler, threading both into the existing `gather → report → render` pipeline without touching the Phase 1–2 trust boundary. The Calendar read is the only genuinely new machinery: it uses the official `googleapis` Node client with a `google.auth.JWT` constructed once from the service-account JSON and re-instantiated with a different `subject:` per designer email (domain-wide delegation), calling `calendar.events.list` with `singleEvents: true` to get recurring instances expanded, `orderBy: 'startTime'`, and a one-studio-day `timeMin`/`timeMax` window in `Australia/Sydney`. The service account, DWD scope (`calendar.readonly`), and all three impersonation emails are already live-validated (STATE.md) — this phase only wires the dependency, never re-does the consent dance.

The reconciliation itself is pure rules over already-fetched data: drop overhead (committed phrase ignore-list, D-07), drop mechanically-excluded events (declined / all-day / OOO / solo / after-hours, D-08), then for each remaining "counting" meeting check whether the designer has a confirmed Productive booking for that meeting's client *on that same day* (D-01/D-02). The matching key is the client company (D-03), resolved via a committed client-alias map (title token → Productive company) that the labelling spike (D-09) builds and pins. Unmatched counting meetings become a soft 📅 "worth a look" sub-line under the designer's existing row (D-14), and a calendar-read failure becomes a new `sourceErrors` entry feeding the existing 🤖 degraded card (REL-01) — calendar is additive and never throws.

**Primary recommendation:** Add `googleapis ^173` (NOT `^144` — CLAUDE.md is stale). Build `src/calendar/` as a non-throwing twin of `src/productive/gather.ts` (`Result`-returning client, zod boundary on the Event shape, `sourceErrors` on failure). Resolve the booked-client set from Productive — but FIRST confirm via the labelling spike whether the existing `/bookings` include chain already sideloads the company (it requests `task.project.company`) so you can reuse it, or whether you need to capture `company_id` that `mappers.ts` currently discards (see Open Question 1, the single biggest planning unknown). Treat the solo-event filter and the fuzzy-match algorithm as spike-pinned, not finalised here.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Calendar credential minting / token refresh | Auth (googleapis `JWT`) | — | DWD JWT mints + refreshes its own access token internally; never hand-rolled |
| Reading 3 designers' events | New `src/calendar/` ingestion source | composition root `src/index.ts` (env/clock boundary) | Mirrors `src/productive/` — a side-effecting source layer, NOT the deterministic domain |
| Recurring-event expansion | Google Calendar API (`singleEvents: true`) | — | The API expands instances server-side; never hand-roll RRULE expansion |
| Mechanical event filtering (declined/all-day/OOO/solo/after-hours) | New `src/calendar/` (pure rules over fetched Events) | — | Pure, deterministic, unit-testable; reads Event fields, no clock/network |
| Overhead ignore-list | `src/config.ts` (committed phrases) + pure matcher | — | Non-secret, version-controlled, trivially extensible (D-07/D-12) |
| Booked-client resolution per day | Productive data already in the pipeline (`gather`/report) | possibly an additional Productive read (Open Q1) | The booked-client set is Productive truth; calendar must NOT recompute it |
| Meeting↔booking reconciliation | New deterministic reconciler (pure rules) | — | Reads the report's figures + the filtered events; no LLM, no clock (CLAUDE.md trust rule) |
| Client-alias fuzzy match | Pure matcher over committed alias map | spike (D-09) pins the map + algorithm | Deterministic, config-driven; the spike is the data-gathering, not the runtime |
| 📅 "worth a look" surfacing | `src/render/rows.ts` (new sub-line) + `RenderContext` field | — | Presentation-only; render tier may read source outputs, never raw API types |
| Degrade-on-failure | `src/index.ts` + `sourceErrors` → existing 🤖 path | `src/render/renderMessage.ts` (already data-driven) | Calendar is an additive source; a failure degrades, never throws (REL-01) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `googleapis` | `^173.0.0` `[VERIFIED: npm registry]` (latest 173.0.0, published 2026-05-28) | Official Google Node client (Calendar v3) | Google's officially supported client; bundles `google-auth-library` so `google.auth.JWT` is available with no extra dependency; handles DWD token minting + refresh internally `[CITED: github.com/googleapis/google-api-nodejs-client]` |

**⚠️ Version correction:** CLAUDE.md "Recommended Stack" pins `googleapis ^144`. That is stale — the current latest is **173.0.0** (verified on npm 2026-06-04). The JWT + `subject` DWD surface is unchanged between those versions, so `^144` would also work, but install the current `^173`. Flag this divergence to the planner.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `luxon` | `^3.7.2` (already installed) | Build the `Australia/Sydney` day window → RFC3339 with offset; apply the 08:30–17:30 studio-time filter | Always — reuse the existing dep; never use native `Date` (project rule) |
| `zod` | `^4.4.3` (already installed) | Validate the Calendar Event shape at the boundary (mirror `src/productive/schemas.ts`) | Parse the fields this phase reads (`start`, `attendees`, `eventType`, `summary`, `htmlLink`, `status`) with `.safeParse`; a drift degrades, never throws |
| `google-auth-library` | bundled inside `googleapis` `[VERIFIED: npm view]` (standalone latest 10.6.2) | The `JWT` class | Do NOT add it as a direct dependency — import `google.auth.JWT` from `googleapis`. (Add it directly only if you want the auth client without the full API surface; not worth it here.) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `googleapis` full client | `@googleapis/calendar` (single-API package) | Smaller install, same API. `googleapis` is what CLAUDE.md blessed and what the validation probe context assumes; the install-size win is irrelevant for a nightly CI job. Stick with `googleapis` unless the planner specifically wants a lean install. |
| `google.auth.JWT` with `subject` | `GoogleAuth` + `.getClient()` + `clientOptions.subject` | Both work for DWD. `new JWT({email,key,scopes,subject})` is the most explicit and is exactly what's needed for the three sequential per-subject clients — clearer than threading subject through `GoogleAuth`. `[CITED: github.com/googleapis/google-auth-library-nodejs]` |
| Service account + DWD | OAuth refresh token per designer | Rejected in CLAUDE.md "Item 3" — human consent + silent revocation risk. DWD is already live-validated; do not revisit. |

**Installation:**
```bash
npm install googleapis@^173
```

**Version verification (run at plan time):**
```bash
npm view googleapis version   # confirm still 173.x; was 173.0.0 on 2026-06-04
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `googleapis` | npm | first published 2012-09-18 (~14 yrs) | 8.58M/week | github.com/googleapis/google-api-nodejs-client | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Notes: `googleapis` has **no postinstall script** (`npm view googleapis scripts.postinstall` → empty). slopcheck ran a real `npm install googleapis` (it added 45 transitive packages, 0 vulnerabilities, verdict `[OK]`). The package.json / package-lock.json changes that the slopcheck install produced were **reverted** so research left the tree clean; the actual dependency add is an execution-phase task. The installed `node_modules/googleapis` is left in place (untracked, harmless — `npm ci`/`npm install` in execution reconciles it).

## Architecture Patterns

### System Architecture Diagram

```
GitHub Actions cron (UTC) ──> node --import tsx src/index.ts
                                      │
                                      │  (the ONE clock/env/network boundary; one studio-zone `now`)
                                      ▼
        ┌─────────────────────── runNightly(now) ───────────────────────┐
        │                                                                │
        │   gather({now})                    gatherCalendar({now})       │   ← NEW additive source
        │   (productive/gather.ts)            (calendar/gather.ts)        │     mirrors productive/gather
        │     │  bookings, absences,            │  GOOGLE_SA_KEY (env)    │
        │     │  briefFlags, holidays,          │  JWT(subject=designer)  │ ──► per-designer events.list
        │     │  sourceErrors                    │  zod Event boundary     │     (singleEvents, day window)
        │     ▼                                  ▼                         │
        │   computeStudioReport(input)        CalendarResult              │
        │   (domain/report.ts — UNTOUCHED)      { eventsByDesigner[],     │
        │     │  StudioReport (figures)          sourceErrors }           │
        │     │                                  │                         │
        │     └──────────────┬───────────────────┘                        │
        │                    ▼                                            │
        │     reconcileMeetings(report, events, aliasMap, ignoreList)     │   ← NEW deterministic reconciler
        │       1. drop overhead (ignore-list phrase match)              │     pure rules, no clock/LLM
        │       2. drop mechanical (declined/all-day/OOO/solo/afterhrs)  │
        │       3. for each remaining COUNTING meeting:                  │
        │            booked-client set for designer×targetDay  ◄─────────┼── from Productive (Open Q1)
        │            title fuzzy-match vs alias map → covered?           │
        │       4. unmatched → worthALook[designerId] += {title,time,link}│
        │                    │                                           │
        │                    ▼                                           │
        │     buildRenderContext(...) + ctx.worthALook  (NEW field)      │
        │                    ▼                                           │
        │     renderTemplate(report, ctx) ──► rows.ts adds 📅 sub-line   │
        │                    ▼                                           │
        │     postToChat(payload, GCHAT_WEBHOOK_URL)                     │
        └────────────────────────────────────────────────────────────────┘
                             │
   calendar read failed?  ──┴──► sourceErrors gets "Calendar" ──► existing 🤖 degraded card (REL-01)
   POST failed?               ──► exit 1 (REL-02, unchanged)
```

### Recommended Project Structure
```
src/
├── calendar/
│   ├── auth.ts          # buildCalendarClient(saKey, subject) → google.calendar client; reads GOOGLE_SA_KEY
│   ├── client.ts        # listDayEvents(client, dayWindow) → Result<RawEvent[]> (non-throwing, mirrors productive/client.ts)
│   ├── schemas.ts       # zod EventResource (start, attendees, eventType, summary, htmlLink, status)
│   ├── gather.ts        # gatherCalendar({now}) → CalendarResult { eventsByDesigner, sourceErrors }
│   ├── filter.ts        # pure mechanical filters: isDeclined / isAllDay / isOutOfOffice / isSolo / isAfterHours / isOverhead
│   ├── reconcile.ts     # pure reconcileMeetings(report, eventsByDesigner, aliasMap, ignoreList) → worthALook map
│   ├── spike.ts         # standalone tsx script (D-09): pull ~3-4 weeks all 3 calendars + bookings, emit labelling sheet
│   └── __tests__/ + __fixtures__/   # golden fixtures from the spike (zod-validated, mirror productive fixtures)
├── config.ts            # + MEETING_IGNORE_LIST (phrases), CLIENT_ALIAS_MAP, DESIGNER_CALENDAR_EMAILS, WORK_DAY_START/END
└── render/rows.ts       # + the 📅 worth-a-look sub-line (after 📄, before/after as designed)
```

### Pattern 1: Per-subject JWT client (DWD impersonation, MEET-01)
**What:** Construct one `google.auth.JWT` per designer email from the single SA JSON, then a calendar client per subject.
**When to use:** Always — the SA impersonates each of the three in turn (CLAUDE.md "Item 3").
```typescript
// Source: github.com/googleapis/google-auth-library-nodejs (JWT constructor)
//         github.com/googleapis/google-api-nodejs-client (google.calendar)
import { google } from "googleapis";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"; // [CITED: STATE.md DWD scope]

function buildCalendarClient(saKey: { client_email: string; private_key: string }, subject: string) {
  const auth = new google.auth.JWT({
    email: saKey.client_email,
    key: saKey.private_key,
    scopes: [CALENDAR_SCOPE],
    subject, // domain-wide delegation: impersonate this designer's calendar
  });
  return google.calendar({ version: "v3", auth });
}
// SA JSON comes from process.env.GOOGLE_SA_KEY (JSON.parse) — a NEW GitHub secret.
// Reads happen ONLY in the composition root / src/calendar (the env boundary).
```

### Pattern 2: One studio-day query with recurring expansion (MEET-01, D-08)
**What:** `events.list` for the target day, recurring expanded to instances.
```typescript
// Source: developers.google.com/workspace/calendar/api/v3/reference/events/list [CITED]
import { DateTime } from "luxon";

// Build the day window in Australia/Sydney as RFC3339 WITH offset (timeMin/timeMax require it).
const day = DateTime.fromISO(targetDayKey, { zone: "Australia/Sydney" });
const timeMin = day.startOf("day").toISO();          // e.g. 2026-06-05T00:00:00+10:00
const timeMax = day.endOf("day").toISO();            // 2026-06-05T23:59:59.999+10:00

const res = await client.events.list({
  calendarId: "primary",
  timeMin,
  timeMax,
  singleEvents: true,        // expand recurring series into instances (drops the master) [CITED]
  orderBy: "startTime",      // only valid WITH singleEvents:true [CITED]
  timeZone: "Australia/Sydney",
  maxResults: 250,           // default; far more than a day holds for one designer
});
const events = res.data.items ?? [];
```
**Note:** The API window is the broad calendar day; the 08:30–17:30 studio-time filter (D-08, e.g. the 17:30 Falcon Dinner) is applied **in code** against each instance's `start.dateTime` in studio zone — keep the API window wide so DST/edge cases never clip a 16:00 meeting.

### Pattern 3: Overhead ignore-list (MEET-02, D-07)
**What:** Committed array of specific title phrases; case-insensitive substring match.
```typescript
// src/config.ts — committed, non-secret, extensible (D-07/D-12)
export const MEETING_IGNORE_LIST: readonly string[] = [
  "Daily Stand-up",   // "Team Daily Stand-up" observed
  "Weekly WIP",       // "Team Weekly WIP"
  "Creative WIP",     // "Creative WIP - plan the week"
  "Creative team",    // "Creative team - review (bring a piece of work!)"
];
// matcher (src/calendar/filter.ts):
const isOverhead = (title: string) =>
  MEETING_IGNORE_LIST.some((p) => title.toLowerCase().includes(p.toLowerCase()));
// Specific PHRASES not loose keywords: "FDC WIP" (a future client meeting) must NOT match.
```

### Pattern 4: Same-day, same-client reconciliation (MEET-03, D-01/D-02/D-03)
**What:** A counting meeting is *covered* iff the designer has a confirmed booking for that meeting's client on the SAME target day.
```typescript
// Pure (src/calendar/reconcile.ts). Reads: filtered counting meetings + the designer's
// booked-client set for the target day (from Productive) + the committed alias map.
for (const meeting of countingMeetings) {
  const meetingClient = matchTitleToClient(meeting.summary, CLIENT_ALIAS_MAP); // may be null
  const covered =
    meetingClient !== null && bookedClientIdsForDesignerToday.has(meetingClient.companyId);
  // D-04 prime directive: uncertainty (no confident client match) → STAY QUIET (treat covered).
  if (meetingClient === null) continue;   // can't confidently attribute → not flagged
  if (covered) continue;                  // covered same-day → not flagged
  worthALook[designerId].push({ title: meeting.summary, start: meeting.startLabel, link: meeting.htmlLink });
}
```
**Validated cases (golden fixtures, D-09):**
- COVERED — "Quick FDC catch up", Tue 3 Jun, Liam booked 6h FDC same day → not flagged.
- WORTH A LOOK — "FDC IPO Launch Check-In", Tue 26 May, Liam had NO FDC booking on the 26th (only 25 May / 2 Jun / 3 Jun) → flagged (same-day strictness, D-02).

### Pattern 5: 📅 sub-line in the existing designer row (MEET-04, MSG-06/07, D-14)
**What:** Add a `worthALook` field to `RenderContext`; emit a 📅 sub-line in `rows.ts`, alongside the existing ⚠️/📄 lines.
```typescript
// src/render/cards.ts — add to RenderContext:
//   worthALook?: Record<string, Array<{ title: string; start: string; link: string }>>;
// src/render/rows.ts — inside buildRow, after the 📄 brief lines:
for (const m of ctx.worthALook?.[d.designerId] ?? []) {
  const titleLink = `<a href="${escapeHtml(m.link)}">${escapeHtml(m.title)}</a>`; // MSG-06 deep-link
  lines.push(`📅 ${titleLink} · ${muted(escapeHtml(m.start))} · ${muted("worth a look")}`);
}
// Soft voice only (D-04/MEET-04): never "conflict". 📅 distinct from 📄/⚠️ (D-14).
```

### Anti-Patterns to Avoid
- **Hand-rolling RRULE expansion:** the API does it with `singleEvents: true`. Never expand recurrence yourself.
- **Letting the reconciler recompute hours:** it reads `StudioReport` figures + the booked-client *set*; it never re-derives minutes (CLAUDE.md trust boundary; `src/domain` stays untouched).
- **Throwing on a calendar failure:** the source is additive — a failure is a `sourceErrors` string, never an exception (REL-01).
- **Importing raw Google Event types into `src/render` or `src/domain`:** only clean output types cross the boundary (mirrors the Productive boundary rule).
- **Using response status as a usefulness signal:** only explicit `declined` is used; `needsAction`/`tentative`/`accepted` are all "in play" (D-08 — Liam never RSVPs).
- **Flagging on an uncertain client match:** D-04 prime directive — no confident match → stay quiet.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service-account auth + token refresh | Manual JWT signing / token POSTs (the validation probe used a raw JWT — do NOT ship that) | `new google.auth.JWT({email,key,scopes,subject})` from `googleapis` | The client mints, caches, and refreshes the DWD access token internally; raw JWT signing is a footgun and is exactly what the dep replaces (STATE.md TODO) |
| Recurring-event expansion | RRULE parser / instance materialiser | `events.list({singleEvents:true})` | Server-side expansion handles RRULE, EXDATE, overrides, timezone DST correctly |
| Date/timezone math for the day window | native `Date`, manual offset strings | `luxon` `.toISO()` (already a dep) | RFC3339-with-offset, DST, and 08:30–17:30 studio-time math are luxon's job (project rule) |
| Response-shape trust | Reading `res.data.items[i].x` raw | `zod` `.safeParse` boundary (mirror `productive/schemas.ts`) | A drift degrades to `sourceErrors`, never crashes the night |
| Non-throwing network result | `try/catch` scattered through the source | A `Result<T>` type + a thin client (mirror `productive/client.ts`) | The whole codebase already uses this pattern; reuse it exactly |

**Key insight:** Phase 4's only new external surface is one `events.list` call per designer. Everything else is *reuse* of the patterns Phases 1–3 already established (Result client, zod boundary, `sourceErrors` degrade, pure-rules-over-injected-inputs, sub-line rows). The risk is not the API — it's the data shape ambiguities the spike must pin (solo events, alias map) and the Productive company-resolution path (Open Q1).

## Runtime State Inventory

> Greenfield-for-this-source phase (no rename/refactor). Included only to confirm the one stateful concern.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — calendar is read-only; no datastore writes this phase. Idempotency/run-logging is explicitly Phase 6 (deferred). | none |
| Live service config | **Google Workspace DWD** is live service config NOT in git: SA `studio-checkin-calendar@evening-studio-checkin.iam.gserviceaccount.com` (Client ID 114624945849863129481) is authorised in the Admin console for scope `calendar.readonly`. Already done + validated. | none (already authorised; do not re-do) |
| OS-registered state | None. | none |
| Secrets/env vars | **NEW secret `GOOGLE_SA_KEY`** (the SA JSON) must be set as a GitHub Actions repository secret. The JSON currently lives in gitignored `secrets/evening-studio-checkin-72c1031a6884.json` for local dev (mirror via `.env`/file path). The private key must NEVER be logged or committed. | Execution task: add `GOOGLE_SA_KEY` GitHub secret; wire `process.env.GOOGLE_SA_KEY` (JSON.parse) in `src/calendar/auth.ts` |
| Build artifacts | slopcheck's probe `npm install`ed `googleapis` into `node_modules/` (untracked) and I reverted the package.json/lockfile edits. The real dependency add (`googleapis ^173` in package.json + lockfile) is an execution task. | Execution task: `npm install googleapis@^173`, commit both files |

## Common Pitfalls

### Pitfall 1: Solo-event detection is not authoritatively specified
**What goes wrong:** D-08 excludes "solo" events (only the designer invited — e.g. a webinar). The naive test is "≤1 attendee" or "attendees has only `self:true`". But when an event has NO other guests, the Google API may omit the `attendees` array entirely (return `undefined`), not return a one-element array — and a personal block a designer creates for themselves typically has no `attendees` at all. There is also `attendeesOmitted` (set when `maxAttendees` truncates) which is a different thing.
**Why it happens:** Google's docs describe `attendees`, `organizer`, `attendeesOmitted`, and `self` but do not authoritatively state the no-guest representation; community reports show inconsistent behaviour. `[ASSUMED]` that a no-guest event has absent-or-self-only `attendees`.
**How to avoid:** Treat **`attendees` absent OR (length ≤ 1 and the only entry is `self:true`)** as solo. **Pin the exact representation in the labelling spike (D-09)** against real solo events (the observed "Full Stack AI Workflow" webinar, Lunch). Build the golden fixture from the real shape, not from this assumption.
**Warning signs:** A real client meeting getting dropped as "solo" (false negative) — far worse here than a false positive is normally, but for solo specifically a wrong drop means a missed flag, which D-04's bias tolerates.

### Pitfall 2: After-hours filter must use studio-zone start, not UTC
**What goes wrong:** The 17:30 Falcon Dinner must be excluded; a 16:00 meeting must be kept. Comparing `start.dateTime` raw (or in UTC) against 08:30/17:30 misfires across the +10/+11 DST boundary.
**How to avoid:** Parse `start.dateTime` with luxon and `.setZone("Australia/Sydney")`, then compare the local hour/minute to the committed `WORK_DAY_START`/`WORK_DAY_END`. Keep the `events.list` window wide (full calendar day) and do the studio-time clip in code.
**Warning signs:** Meetings near 17:00–18:00 flickering in/out across an October/April DST change.

### Pitfall 3: `eventType` reliability for OOO / focusTime / workingLocation
**What goes wrong:** D-08/MEET-05 excludes out-of-office. `eventType: "outOfOffice"` is the signal; `focusTime` and `workingLocation` are *also* not real meetings and should be excluded the same way. `[CITED: events.list eventTypes]` confirms the enum (`birthday`, `default`, `focusTime`, `fromGmail`, `outOfOffice`, `workingLocation`). It is `[ASSUMED]` (not confirmed) that `eventType` is reliably populated on every expanded instance.
**How to avoid:** Exclude any event whose `eventType` is one of `outOfOffice` / `focusTime` / `workingLocation` (and treat all-day `birthday` as excluded via the all-day rule). Confirm presence-on-instances in the spike. Do NOT request `eventTypes=` as a *filter* on the read — read all and filter in code, so the spike sees everything and the rules stay in committed config (D-12).
**Warning signs:** An OOO block counted as a meeting and flagged "worth a look".

### Pitfall 4: Declined detection needs the `self` attendee, not the event status
**What goes wrong:** Using the event-level `status` (`confirmed`/`tentative`/`cancelled`) to detect a decline. That is the event's lifecycle state, not the owner's RSVP.
**How to avoid:** Find `attendees.find(a => a.self === true)` and exclude when its `responseStatus === "declined"` `[CITED: Event resource]`. If there's no self attendee (solo/no-guest), there's no decline to read — solo handling (Pitfall 1) covers it. Only `declined` is meaningful; `needsAction`/`tentative`/`accepted` all stay in play (D-08).
**Warning signs:** Declined meetings still flagged; or accepted meetings dropped because `needsAction` was misread as "not attending".

### Pitfall 5: Re-using the Productive booked-client set must not re-query or re-compute hours
**What goes wrong:** The reconciler needs each designer's *set of booked client companies for the target day*. If it fires its own Productive query it duplicates the pull and risks drift; if it recomputes anything it breaches the trust boundary.
**How to avoid:** See Open Question 1. Prefer threading the company id alongside the existing target-day bookings (the include chain already requests `task.project.company`). The reconciler consumes a ready-made `Set<companyId>` per designer — it never recomputes minutes.
**Warning signs:** A second `/bookings` call appearing in `gatherCalendar`; or the reconciler importing `capacity.ts`.

## Code Examples

### Building the day window and reading events (MEET-01)
See Pattern 2 above — `events.list({ calendarId:"primary", timeMin, timeMax, singleEvents:true, orderBy:"startTime", timeZone:"Australia/Sydney" })`. `calendarId:"primary"` reads the impersonated designer's own calendar (the probe confirmed primary-calendar reads for all three).

### zod boundary for the Event shape (mirror productive/schemas.ts)
```typescript
// Source: developers.google.com/.../reference/events (fields this phase reads) [CITED]
import { z } from "zod";
const EventDateTime = z.object({
  date: z.string().optional(),        // present ⟺ all-day
  dateTime: z.string().optional(),    // present ⟺ timed (RFC3339)
  timeZone: z.string().optional(),
}).loose();
export const CalendarEventResource = z.object({
  id: z.string(),
  status: z.string().optional(),                 // confirmed/tentative/cancelled (NOT the RSVP)
  summary: z.string().optional(),                // the title (may be absent on a "(No title)" event)
  htmlLink: z.string().optional(),               // MSG-06 deep-link
  eventType: z.string().optional(),              // default/outOfOffice/focusTime/workingLocation/...
  start: EventDateTime.optional(),
  attendeesOmitted: z.boolean().optional(),
  attendees: z.array(z.object({
    self: z.boolean().optional(),
    responseStatus: z.string().optional(),       // needsAction/declined/tentative/accepted
  }).loose()).optional(),
}).loose();
```

### The labelling spike as a buildable artifact (D-09)
```typescript
// src/calendar/spike.ts — a STANDALONE tsx script (run: node --import tsx src/calendar/spike.ts),
// NOT part of the nightly path. It is the de-risking twin of the Phase-2 "briefed" probe.
// 1. For each designer email: buildCalendarClient(saKey, email) → events.list over a ~3-4 week
//    window (timeMin = today-21d, timeMax = today, singleEvents:true).
// 2. Pull the same window's Productive bookings (reuse productive/client.ts fetchAllPages) to get
//    each day's booked client companies.
// 3. Emit a flat, human-labelable sheet (Markdown table or chat-pasteable text):
//      | date | designer | meeting title | eventType | attendees(self,count) | start | booked clients that day |
//    so Liam can mark each DISTINCT title overhead / counts / not-work and confirm the client name.
// 4. Liam's labels become committed: MEETING_IGNORE_LIST, CLIENT_ALIAS_MAP, and the
//    counts/not-work rule confirmations in config.ts — plus golden JSON fixtures in
//    src/calendar/__fixtures__/ (zod-validated EventResource samples incl. the two D-09 cases).
// Output format note: prefer a Markdown table written to a gitignored scratch file (e.g.
// .planning/phases/04-.../spike-output.md) Liam edits, rather than chat — the labelled result is
// then transcribed into config + fixtures. The script never posts to Chat.
```

### Client-alias map shape + default match (D-03/D-09 — spike PINS this)
```typescript
// src/config.ts — the spike builds/refines this; below is the sensible DEFAULT shape only.
export interface ClientAlias { companyId: string; companyName: string; code?: string; aliases: string[]; }
export const CLIENT_ALIAS_MAP: readonly ClientAlias[] = [
  { companyId: "1333899", companyName: "FDC Construction", code: "FDCC",
    aliases: ["FDC", "FDC Construction", "FDCC", "IPO Launch"] },  // from §Specifics; spike confirms
];
// Default matcher (substring/token, case-insensitive) — the spike refines aliases, NOT the algorithm:
function matchTitleToClient(title: string, map: readonly ClientAlias[]): ClientAlias | null {
  const t = title.toLowerCase();
  // longest-alias-first so "FDC Construction" wins over "FDC"; first confident hit wins.
  const candidates = map
    .flatMap((c) => c.aliases.map((a) => ({ c, a: a.toLowerCase() })))
    .sort((x, y) => y.a.length - x.a.length);
  for (const { c, a } of candidates) if (t.includes(a)) return c;
  return null; // no confident match → caller stays quiet (D-04)
}
```
`[ASSUMED]` — substring/token match is the *shape* the spike refines, not a finalised algorithm (D-09 explicitly pins it). Risk if the default is too loose: false positives/negatives; mitigated by spike labelling + soft voice + committed config (D-12).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `googleapis ^144` (CLAUDE.md) | `googleapis ^173.0.0` | latest 2026-05-28 | Install `^173`; JWT+subject DWD surface unchanged, so no code difference |
| Cards v1 | Cards v2 (already used in Phase 3) | — | No change for this phase; the 📅 line reuses the existing `decoratedText` widget |

**Deprecated/outdated:**
- The raw-JWT probe used during validation (STATE.md): a hand-built JWT was fine for a one-off probe but must be replaced by `google.auth.JWT` for the shipped read.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A no-guest/solo event has `attendees` absent OR only a `self:true` entry | Pitfall 1, zod schema | A solo block (webinar/lunch) leaks through as a meeting OR a real meeting gets dropped — **spike must pin this against real data (D-09)** |
| A2 | `eventType` is reliably populated on expanded recurring instances | Pitfall 3 | An OOO/focusTime block counted as a meeting — spike confirms presence-on-instances |
| A3 | The default substring/token match is the right *shape* for title→client | Code Examples, D-03 | Mismatches → false flags/misses; D-09 explicitly defers the algorithm to the spike, mitigated by soft voice + config |
| A4 | The existing `/bookings` include chain (`task.project.company`) is sufficient to derive the day's booked-client company ids without an extra query | Open Question 1 | If the company id isn't reachably sideloaded for the target-day bookings, an additional Productive read or a mapper change is needed — **the single biggest planning unknown** |
| A5 | `calendarId:"primary"` is the correct calendar to read per designer | Code Examples | Confirmed by the live probe (STATE.md: "read primary calendars") — low risk |

**Note:** A1–A3 are exactly what the labelling spike (D-09) exists to resolve — they are expected gaps, not research failures. A4 is a codebase question the planner can answer by inspecting the live `/bookings` response shape (or the spike can confirm).

## Open Questions

1. **Does the existing Productive pull already carry each booking's `company_id`, or must the calendar phase capture it?** (The biggest planning decision.)
   - What we know: `gather.ts` requests `include=...,task.project,task.project.company`, so the **company IS sideloaded** in `bookingsResult.value.included`. BUT `mappers.ts` reduces a booking to `{ designerId, minutes, isTentative }` and the domain `Booking` type carries no company. `indexProjects` reads `project.company` only as a boolean (client-vs-internal), discarding the company id. So the company data arrives in the pull but is **thrown away** before the report.
   - What's unclear: the cleanest way to surface a per-designer, per-target-day `Set<companyId>` to the reconciler without breaching the domain trust boundary or recomputing hours.
   - Recommendation: build a small **`bookedClientsByDesignerDay`** map inside an extended `gather` (or a thin sibling) that reads the SAME `bookingsResult.included` company linkage already fetched — no second `/bookings` call. Thread it to the reconciler via the composition root. Confirm the exact `task.project.company` linkage path against a live response (the spike's Productive pull can dump it). Do NOT add company to the domain `Booking` type (keeps `src/domain` untouched).

2. **What is the exact start-time field on an all-day vs the studio-time filter?** All-day events have `start.date` (excluded outright by D-08); timed events have `start.dateTime`. The 08:30–17:30 filter only applies to timed events. Confirmed by docs `[CITED]`; no real ambiguity, listed for completeness.

3. **Does `events.list` need `showDeleted`/`status` handling?** With `singleEvents:true` and no `showDeleted`, cancelled instances are excluded by default. Recommendation: rely on the default (omit `showDeleted`); optionally also skip `status === "cancelled"` defensively in code.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Whole project | ✓ | v22.22.1 | — |
| `googleapis` | Calendar read (MEET-01) | ✗ (not yet in package.json; probe-installed into node_modules) | latest 173.0.0 | none — must `npm install googleapis@^173` (execution task) |
| `luxon` | Day window + studio-time filter | ✓ | ^3.7.2 | — |
| `zod` | Event boundary | ✓ | ^4.4.3 | — |
| Google Workspace DWD (SA + scope) | Live calendar read | ✓ | calendar.readonly authorised | none — already live-validated (STATE.md) |
| `GOOGLE_SA_KEY` env/secret | Auth at runtime | ✗ in CI (✓ local file in gitignored secrets/) | — | none — must add GitHub secret (execution task) |
| Network egress to `googleapis.com` | OAuth token + events.list | ✓ (GitHub Actions has egress) | — | a read failure degrades to 🤖 (REL-01) |

**Missing dependencies with no fallback:** `googleapis` (must install); `GOOGLE_SA_KEY` GitHub secret (must add before CI run).
**Missing dependencies with fallback:** a runtime calendar-read failure → existing 🤖 degraded card (additive source, REL-01).

## Validation Architecture

> `workflow.nyquist_validation` not found in `.planning/config.json` keys inspected → treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (`node:test`) + `node:assert` — no Jest/Vitest (project convention; existing `*.test.ts` files) |
| Config file | none — tests are discovered by path; run via tsx |
| Quick run command | `node --import tsx --test src/calendar/__tests__/*.test.ts` |
| Full suite command | `node --import tsx --test "src/**/*.test.ts"` (matches existing `__tests__/` + co-located `*.test.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEET-01 | events fetched + zod-parsed per designer; failure → sourceErrors | unit (stubbed client, no network) | `node --import tsx --test src/calendar/__tests__/gather.test.ts` | ❌ Wave 0 |
| MEET-02 | overhead phrases excluded; "FDC WIP" NOT excluded | unit | `node --import tsx --test src/calendar/__tests__/filter.test.ts` | ❌ Wave 0 |
| MEET-03 | covered same-day → not flagged; the two golden cases | unit (golden fixtures) | `node --import tsx --test src/calendar/__tests__/reconcile.test.ts` | ❌ Wave 0 |
| MEET-04 | unmatched counting meeting → soft 📅 sub-line; uncertain match → quiet | unit (render) | `node --import tsx --test src/render/__tests__/renderMessage.test.ts` | ⚠️ exists (extend) |
| MEET-05 | declined(self)/all-day/OOO/solo/after-hours excluded | unit | `node --import tsx --test src/calendar/__tests__/filter.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --import tsx --test src/calendar/__tests__/*.test.ts`
- **Per wave merge:** `node --import tsx --test "src/**/*.test.ts"`
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/calendar/__tests__/filter.test.ts` — MEET-02, MEET-05 (each mechanical filter + the "FDC WIP" not-swallowed case)
- [ ] `src/calendar/__tests__/reconcile.test.ts` — MEET-03/04 (the two D-09 golden cases: covered 3 Jun, worth-a-look 26 May)
- [ ] `src/calendar/__tests__/gather.test.ts` — MEET-01 + degrade-to-sourceErrors (stubbed client)
- [ ] `src/calendar/__fixtures__/*.json` — zod-valid Event samples from the spike (declined, all-day, OOO, solo, after-hours, overhead, the two FDC cases)
- [ ] Extend `src/render/__tests__/renderMessage.test.ts` + add a fixture with a populated `worthALook` to assert the 📅 sub-line + deep-link

## Security Domain

> `security_enforcement` not explicitly `false` → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | SA private key via `process.env.GOOGLE_SA_KEY` only; DWD scope is read-only `calendar.readonly` (least privilege) |
| V3 Session Management | no | No sessions; stateless nightly run |
| V4 Access Control | yes | DWD impersonation limited to the three configured designer emails + the single read-only scope |
| V5 Input Validation | yes | zod `.safeParse` on every Event before use; every dynamic string HTML-escaped before card insertion (`escapeHtml`, existing) |
| V6 Cryptography | yes | JWT signing handled entirely by `google.auth.JWT` — never hand-roll; the private key is never logged |
| V7 Error/Logging | yes | Calendar errors become a `sourceErrors` STRING (status/message only) — never log the SA key, access token, or full event payloads |

### Known Threat Patterns for googleapis + Node CI
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SA private key leaked in logs/repo | Information Disclosure | Key only via `GOOGLE_SA_KEY` secret; gitignored `secrets/`; never `console.*` the parsed key or token (mirror the webhook-URL rule in `src/index.ts`) |
| Over-broad calendar scope | Elevation of Privilege | Read-only `calendar.readonly`, three subjects only (already authorised) |
| Malicious/odd event title breaking the card | Tampering | HTML-escape `summary`/`htmlLink` before insertion (existing `escapeHtml`, threat T-03-01 / V5) |
| Calendar API outage causing a silent skip | Denial of Service | Additive source → `sourceErrors` → 🤖 degraded card that still posts (REL-01); never throws |
| Untrusted JSON shape drift | Tampering | zod boundary `.safeParse`; drift degrades, never crashes (mirrors Productive) |

## Project Constraints (from CLAUDE.md)
- **Tech stack:** Node.js 22 + TypeScript; `tsx`; native `fetch`; `luxon`; `zod`; `googleapis` for Calendar (install `^173`, NOT the stale `^144`).
- **Determinism / trust boundary:** ALL hour/capacity arithmetic in deterministic code, NEVER the LLM. The reconciler reads `StudioReport` figures + the booked-client set; it never recomputes minutes. `src/domain` must not import ingestion layers.
- **Calendar auth:** service account + DWD (`calendar.readonly`), `google.auth.JWT` with `subject` per designer — the correct unattended path (CLAUDE.md "Item 3"); never OAuth refresh tokens.
- **Secrets:** GitHub Actions encrypted secrets; non-secret config (ignore-list, alias map, designer calendar emails) in committed `config.ts`. Never commit/log the SA key or webhook URL.
- **Reliability two-path rule (src/index.ts):** data-source failure → degraded card + exit 0; POST failure → exit 1. Calendar plugs in as a data source (degrade path).
- **GSD workflow:** all edits go through a GSD command; this is a research artifact only.

## Sources

### Primary (HIGH confidence)
- developers.google.com/workspace/calendar/api/v3/reference/events/list — `singleEvents`, `orderBy` (startTime|updated, startTime requires singleEvents), `timeMin`/`timeMax` (RFC3339 + offset), `timeZone`, `eventTypes` enum, `maxResults` (default 250) — HIGH
- developers.google.com/workspace/calendar/api/v3/reference/events — Event fields: `attendees[].responseStatus` (needsAction/declined/tentative/accepted), `attendees[].self`, `eventType` enum, `start.date` vs `start.dateTime`, `status`, `htmlLink`; declined-detection via the `self:true` attendee — HIGH
- github.com/googleapis/google-auth-library-nodejs — `new JWT({email,key,scopes,subject})` DWD constructor + `subject` impersonation example — HIGH
- github.com/googleapis/google-api-nodejs-client — official client; `google.calendar({version:'v3',auth})`; bundles google-auth-library — HIGH
- npm registry (`npm view`) — `googleapis` latest 173.0.0 (pub 2026-05-28), first published 2012, 8.58M weekly downloads, no postinstall — HIGH
- slopcheck 0.6.1 — `googleapis` verdict `[OK]` — HIGH
- Codebase (read in session): `src/index.ts`, `src/productive/gather.ts`, `src/productive/client.ts`, `src/productive/mappers.ts`, `src/productive/schemas.ts`, `src/domain/report.ts`, `src/domain/types.ts`, `src/render/cards.ts`, `src/render/rows.ts`, `src/render/renderMessage.ts`, `src/config.ts` — HIGH
- `.planning/STATE.md` §Phase 4 — live-validated SA, DWD scope, three impersonation emails, execution TODO — HIGH

### Secondary (MEDIUM confidence)
- §Specifics in 04-CONTEXT.md — the two golden cases + FDC Construction client-alias finding (live-validated 2026-06-04) — MEDIUM (real but single-source/recollection-corrected)

### Tertiary (LOW confidence)
- Community/issue-tracker reports on whether `attendees` is omitted for no-guest events (support.google.com, issuetracker.google.com) — LOW; the solo-event representation is NOT authoritatively documented → spike must pin (A1)
- `eventType`-populated-on-every-instance — LOW/ASSUMED (A2) → spike confirms

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `googleapis ^173` verified on npm + slopcheck OK; JWT+subject confirmed against official auth-library docs
- Calendar API surface: HIGH — `events.list` params + Event fields confirmed against current official reference docs
- Integration shape: HIGH — derived from reading the actual codebase; the additive-source/degrade pattern is already established
- Reconciliation rules: HIGH (the rules are locked in CONTEXT) — but two data-shape inputs (solo-event representation, alias map) are MEDIUM/ASSUMED and deferred to the D-09 spike by design
- Booked-client resolution path (Open Q1): MEDIUM — company IS sideloaded today but discarded; the exact re-surfacing approach is a planner decision

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (stable; `googleapis` is fast-moving on version number but the JWT/events.list surface is long-stable — re-verify the version at plan time)
