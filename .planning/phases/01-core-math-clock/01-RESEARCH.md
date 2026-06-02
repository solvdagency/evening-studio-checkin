# Phase 1: Core Math & Clock - Research

**Researched:** 2026-06-02
**Domain:** Pure deterministic TypeScript — capacity arithmetic + working-day/timezone math (luxon), unit-tested with `node:test`
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Time-off → available hours**
- **D-01:** A designer fully off the target day (available = 0) is shown as **"off" / on leave** and is **NOT** counted as underbooked. Still **mentioned** in the report ("X is off"), just not flagged as a gap.
- **D-02:** Partial absences reduce available hours **proportionally**: `available = 7.5 − absence hours that day`, floored at 0. (Productive records absences as event-type bookings with hours-per-day; use those hours directly.)

**Underbooked determination**
- **D-03:** **Any gap** below available hours flags a designer as underbooked — no tolerance threshold. (Booked 7.0 of 7.5 = underbooked by 0.5h.)
- **D-04:** Underbooked open-hours figure uses **confirmed bookings only**: `open = available − confirmed booked`. Tentative (draft) hours do **not** close the gap.
- **D-05:** Tentative bookings tracked and surfaced **distinctly as "shaky"** (CAP-04). A day filled only by tentative bookings is **underbooked AND shaky** — tentative time might evaporate, so it doesn't count against the gap.

**Overbooked handling**
- **D-06:** A designer booked **over** available hours is **computed and surfaced as a gentle, low-key distinct signal** (e.g. "booked over capacity") — not alarmist, but visible. Booked-hours math stays accurate (**no clamping**).

**Rest-of-week rollup (CAP-05)**
- **D-07:** Window = **target day through that target day's Friday**. The run is ~4:30pm so "today" is treated as already done; the window looks forward from the day the message is about. (Tue-evening run covers Wed–Fri.)
- **D-08:** **Friday rollover:** on a Friday-evening run (target = Monday), window becomes **all of next week (Mon–Fri)**. Consistent rule: always *target-day through that day's Friday*.
- **D-09:** Studio total is **net of time-off**: total = sum of each designer's available hours across the window (absences subtracted), so "open vs total" stays honest during leave.
- **D-10:** A public holiday inside the window **contributes 0 studio hours and is not counted as a working day** (consistent with the clock skipping it).

**Working-day clock (SCHED-03, SCHED-04)**
- **D-11:** Target day derives from the **studio timezone**, not the scheduler/runner clock; must be DST-safe.
- **D-12:** Friday → Monday rollover (skip weekends).
- **D-13:** **Holidays are an injected input** — Phase 1 takes a set of public-holiday dates as a parameter (dependency injection), never fetches them. A holiday on the would-be target day pushes the target to the next working day.
- **D-14:** Holiday calendar region is **NSW (Australia)**. Default feed is `date-holidays`, cross-checked against Productive company-wide absences — but **this sourcing is Phase 2 wiring**, not Phase 1. Phase 1 only consumes the injected date set.

**Hour precision**
- **D-15:** Compute internally in **exact minutes** (Productive's native unit); expose **decimal hours**.
- **D-16:** Displayed open/booked figures **round to nearest 0.25h** (quarter-hour). Exact value retained internally for all arithmetic — only the surfaced figure is rounded.

**Empty / partial input degradation (success criterion 4)**
- **D-17:** A designer available but with **zero bookings** is **underbooked with the full available hours open** (e.g. 7.5h open) — an empty day is the core gap this tool exists to catch.
- **D-18:** The core knows the **expected 3-designer roster** and treats a designer **missing entirely from input** as a **detectable gap** (e.g. "computed for 2 of 3"), so the degraded-message path (REL-01, Phase 3) can name who couldn't be assessed.
- **D-19:** Partial/empty inputs **degrade gracefully — never throw**.

### Claude's Discretion
- Internal data-structure/type shape, function signatures, module layout — planner/researcher decide.
- Test framework wiring (project standard `node:test`) and how the Friday-to-Monday, holiday-eve, and DST-boundary cases are structured — planner decides, but all three MUST be covered.
- Exact rounding implementation (round-half-up vs round-half-even) at 0.25h granularity — pick a sensible, documented default.

### Deferred Ideas (OUT OF SCOPE)
- Holiday-source wiring (library vs Productive-derived vs config) — Phase 2.
- Brief existence/briefed checks — Phase 2 (BRIEF-01…03).
- Message format / rounding presentation / deep-links — Phase 3 (MSG-*). Phase 1 fixes the *values* and *signals*, not how they render.
- Degraded-message wording when a designer's data is missing — Phase 3 (REL-01) consumes the "detectable gap" signal Phase 1 produces.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHED-03 | "Next working day" targets the following weekday; Friday → Monday | Working-day clock built on luxon `weekday` + `plus({days})` weekend skip (see Pattern 2) |
| SCHED-04 | All working-day/window logic computed from studio timezone (not scheduler clock), DST-safe | Inject a `now: DateTime` (zone-anchored) into the clock; never call `DateTime.now()` inside pure functions; luxon day-math is DST-safe by design (see Pitfall 1, Pattern 1) |
| CAP-01 | Per-designer available hours for target day (7.5h minus absence) | Minutes-based `available = 450 − absenceMinutes`, floored at 0 (Pattern 3) |
| CAP-02 | Per-designer booked hours from confirmed bookings | Sum booking minutes filtered by confirmed vs draft (Pattern 4) |
| CAP-03 | Underbooked flag naming designer + open hours | `open = available − confirmedBooked`; any positive gap flags (Pattern 5) |
| CAP-04 | Tentative (draft) bookings counted but shown distinctly as shaky | Track `tentativeMinutes` separately; never subtract from gap (Pattern 5, D-05) |
| CAP-05 | Studio "rest of this week" rollup — open vs total across remaining working days | Iterate working days target→Friday, sum per-designer available net of absence (Pattern 6) |
</phase_requirements>

## Summary

Phase 1 is a small, self-contained domain module with two cooperating concerns: a **clock** (which working day the report is about, and which working days remain this week) and a **capacity calculator** (per-designer available/booked/open hours and the studio rollup). The entire phase is pure functions over typed inputs — the single most important architectural decision is that **the clock must accept the "current moment" as an injected parameter** (`now: DateTime`, or an ISO string + zone), never call `DateTime.now()` internally. This is what makes SCHED-04 ("computed from studio timezone, not the scheduler's clock") and the three mandatory date-case tests (Friday→Monday, holiday-eve, DST-boundary) trivially deterministic and hand-verifiable — no mock timers, no environment manipulation, just pass in a fixed `DateTime`.

The capacity math is genuinely simple arithmetic; the trust comes from doing it in **exact integer minutes** (Productive's native `time` unit) and only converting to decimal hours / rounding to 0.25h at the boundary where a figure is surfaced (D-15/D-16). Luxon owns 100% of date/timezone reasoning — native JS `Date` is rejected by CLAUDE.md and is a real footgun for the DST and date-only cases. Luxon's higher-order day math (`plus({ days: 1 })`, `startOf('day')`, `weekday`) is DST-safe by design: it operates on calendar days, not fixed 24h spans, which is exactly what a "next working day" calculation needs.

The holiday set is injected as data (D-13). The cleanest representation for date-only comparison is a **`Set<string>` of `yyyy-MM-dd` ISO date strings** keyed in the studio zone — this makes the holiday-eve test a one-line `holidays.has(candidate.toISODate())` and sidesteps every DateTime-equality and zone-mismatch trap. Everything degrades gracefully: missing designers are a *detected* gap against a known 3-person roster (D-18), empty bookings = fully-open underbooked day (D-17), and no input shape throws (D-19).

**Primary recommendation:** Build two pure modules — `clock.ts` (inject `now: DateTime`, holidays as `Set<yyyy-MM-dd>`) and `capacity.ts` (integer-minute math, 0.25h rounding only at output). Test with `node:test` run via `node --import tsx --test`, passing fixed luxon `DateTime`s for the three mandatory date cases. No `DateTime.now()`, no `Date`, no I/O anywhere in the module.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Target-working-day derivation | Pure domain (clock) | — | Deterministic given `now` + holiday set; no I/O. Studio zone supplied as data. |
| Weekend/holiday skip | Pure domain (clock) | — | Pure calendar logic over injected holiday `Set`. |
| Rest-of-week window enumeration | Pure domain (clock) | — | Derived from target day + holiday set; no external lookup. |
| Per-designer available/booked/open | Pure domain (capacity) | — | Integer-minute arithmetic over typed booking/absence inputs. |
| Underbooked / shaky / overbooked signals | Pure domain (capacity) | — | Pure classification of computed numbers. |
| Studio rollup | Pure domain (capacity) | clock (supplies window) | Composes clock window + per-day per-designer availability. |
| Holiday *sourcing* | — (Phase 2) | — | Explicitly injected here; `date-holidays`/Productive wiring is Phase 2. |
| Rounding for *display* | Pure domain (capacity, output edge) | renderer (Phase 3) | Phase 1 fixes the 0.25h value; Phase 3 decides how it's shown. |

**Note:** Every capability in this phase lives in a single tier — pure domain logic. There is no network, storage, or UI tier in Phase 1 by design (the trust boundary). This map exists mainly to confirm that nothing has leaked across the boundary (no fetching, no `DateTime.now()`, no I/O).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `luxon` | `^3.7.2` | All date / timezone / working-day / DST math | Locked by CLAUDE.md (native `Date` rejected). Immutable `DateTime`, first-class IANA zones, DST-safe higher-order arithmetic. [VERIFIED: npm registry — 3.7.2, published 2025-09-05] |
| `@types/luxon` | `^3.7.1` | Type definitions for luxon (ships none bundled) | Required pairing per CLAUDE.md Version Compatibility table. [VERIFIED: npm registry — 3.7.1] |
| `typescript` | `~5.9.3` | Language | CLAUDE.md locks `5.x`. **Note:** npm `latest` is now `6.0.3` — see State of the Art. Pin to `~5.9.3` to honour the locked `5.x` constraint. [VERIFIED: npm registry — 5.9.3 latest in 5.x; 6.0.3 is current latest] |
| `tsx` | `^4.22.4` | Run + type-strip TS directly (`tsx`, `tsx --test` host) | Locked by CLAUDE.md; zero build step. [VERIFIED: npm registry — 4.22.4] |
| `node:test` + `node:assert` | built-in (Node 22.22.1) | Unit test runner + assertions | Locked by CLAUDE.md ("no Jest/Vitest"). Stable in Node 20+. [VERIFIED: node --version → v22.22.1; CITED: nodejs.org/docs/latest-v22.x/api/test.html] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prettier | latest | Formatting | Dev-only, per CLAUDE.md. Not a runtime dependency. |

**Phase 1 explicitly does NOT use:** `zod` (Phase 2 boundary validation — Phase 1 consumes already-typed inputs), `date-holidays` (Phase 2 holiday sourcing — Phase 1 receives an injected set), `googleapis`, native `fetch`. No HTTP, no I/O.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `luxon` | `Temporal` (TC39) / `date-fns-tz` | CLAUDE.md locks luxon. Temporal is not yet broadly stable in Node 22 without flags; `date-fns-tz` is less ergonomic for IANA-zone day math. No reason to deviate. |
| Inject `now: DateTime` | Mock the system clock with `mock.timers` / `DateTime.now` | Injection is strictly simpler, fully deterministic, and self-documenting in tests. Mocking the global clock is the anti-pattern here (see Pitfall 4). |
| `Set<yyyy-MM-dd string>` for holidays | `Set<DateTime>` / array of `DateTime` | DateTime equality is by instant, not calendar day — zone/time mismatches cause silent misses. String date keys make comparison and the holiday-eve test trivial (see Pattern 1). |

**Installation:**
```bash
npm init -y
npm install luxon
npm install -D @types/luxon typescript@~5.9 tsx prettier
```
(No runtime test-framework install — `node:test` is built in.)

**Version verification (run 2026-06-02):**
```
luxon          → 3.7.2  (created 2017-05-24, repo github.com/moment/luxon)
@types/luxon   → 3.7.1
typescript     → 6.0.3 latest; 5.9.3 is latest 5.x  ← pin 5.x per CLAUDE.md
tsx            → 4.22.4 (repo github.com/privatenumber/tsx)
node           → v22.22.1
```

## Package Legitimacy Audit

Phase 1 installs only the four locked-stack packages from CLAUDE.md, all long-established with official source repos and no postinstall scripts.

| Package | Registry | Age | Source Repo | postinstall | slopcheck | Disposition |
|---------|----------|-----|-------------|-------------|-----------|-------------|
| `luxon` | npm | ~9 yrs (created 2017-05-24) | github.com/moment/luxon (official Moment org) | none | not run* | Approved |
| `@types/luxon` | npm | DefinitelyTyped | github.com/DefinitelyTyped/DefinitelyTyped | none | not run* | Approved |
| `typescript` | npm | 13+ yrs | github.com/microsoft/TypeScript | none | not run* | Approved (pin 5.x) |
| `tsx` | npm | est. 2022 | github.com/privatenumber/tsx | none | not run* | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

\* slopcheck 0.6.1 installed successfully, but its only check verb (`slopcheck install`) *performs the install* as a side effect and exposes no read-only/dry-run/JSON mode, so it was not run against the project to avoid mutating state. Legitimacy was instead established via direct npm-registry provenance: all four packages are years old, published from well-known official org repos (Moment, DefinitelyTyped, Microsoft, privatenumber/tsx), carry no `postinstall` scripts, and are the exact packages already locked in CLAUDE.md. Confidence: HIGH that these are legitimate; the inability to run slopcheck's gate does not change the disposition given the provenance, but per protocol the planner may still add a one-line `checkpoint:human-verify` before install if desired. These are not [ASSUMED]-from-websearch names — they are the project's own locked stack.

## Architecture Patterns

### System Architecture Diagram

```
                 INJECTED TYPED INPUTS (no fetching here)
   ┌──────────────────────────────────────────────────────────────┐
   │  now: DateTime (zone-anchored to studio zone)                  │
   │  studioZone: "Australia/Sydney"                                │
   │  holidays: Set<"yyyy-MM-dd">   (NSW dates, injected)           │
   │  roster: DesignerId[]          (expected 3 designers)          │
   │  bookings: Booking[]  (person, dayMinutes, isDraft, ...)       │
   │  absences: Absence[]  (person, dayMinutes, booking_type=event) │
   └──────────────────────────────────────────────────────────────┘
              │                                   │
              ▼                                   │
        ┌───────────┐                             │
        │  clock.ts │  pure                        │
        │           │                              │
        │ nextWorkingDay(now, zone, holidays)      │
        │   → skip Sat/Sun → skip holiday          │
        │   → targetDay: DateTime (startOf day)    │
        │                                          │
        │ restOfWeekWindow(targetDay, holidays)    │
        │   → [targetDay .. that week's Friday]    │
        │   → minus holidays  → WorkingDay[]       │
        └───────────┘                              │
              │ targetDay, window                  │
              ▼                                     ▼
        ┌────────────────────────────────────────────────┐
        │                 capacity.ts  pure                │
        │  for targetDay:                                  │
        │    available = 450 − absenceMin (floor 0)        │  [minutes]
        │    confirmedBooked = Σ booking.min where !draft  │
        │    tentative       = Σ booking.min where draft   │
        │    open = available − confirmedBooked            │
        │    classify: off | underbooked | overbooked | ok │
        │    + shaky if tentative > 0                       │
        │                                                  │
        │  for window (rollup):                            │
        │    studioTotal = Σ available over days×designers │
        │    studioOpen  = Σ open(confirmed) over window   │
        │                                                  │
        │  roster check: present vs expected → missing[]   │
        └────────────────────────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  TYPED OUTPUT (consumed by Phase 3 renderer, Phase 2 feeds in) │
   │  StudioReport {                                                │
   │    targetDay, window,                                          │
   │    designers: DesignerResult[]  (available/booked/open/flags,  │
   │                                   minutes exact + hours 0.25),  │
   │    rollup: { openHours, totalHours },                          │
   │    missingDesigners: DesignerId[]   ← detectable gap (D-18)    │
   │  }                                                             │
   └──────────────────────────────────────────────────────────────┘
```

Trace the primary case: a Tuesday-4:30pm `now` enters the clock → `nextWorkingDay` returns Wednesday (or skips to the next non-holiday weekday) → `restOfWeekWindow` returns Wed–Fri minus holidays → capacity computes each designer's numbers for Wednesday and the studio rollup over the window → a `StudioReport` exits. No arrow leaves the box to a network or disk.

### Recommended Project Structure
```
src/
├── domain/
│   ├── types.ts        # Booking, Absence, DesignerId, WorkingDay, StudioReport, etc.
│   ├── clock.ts        # nextWorkingDay, restOfWeekWindow, isWorkingDay — pure, luxon
│   ├── capacity.ts     # available/booked/open, classify, rollup, roster check — pure
│   └── round.ts        # minutesToHours, roundToQuarterHour (documented mode)
└── domain/__tests__/
    ├── clock.test.ts       # incl. Friday→Monday, holiday-eve, DST-boundary
    ├── capacity.test.ts    # underbooked/shaky/overbooked/off, empty, partial
    └── round.test.ts
```
(`config.ts` with the 3 designer IDs, 7.5h target, studio zone is referenced by CLAUDE.md but is *consumed* by Phase 1 as plain values — keep Phase 1 functions parameterised, not reaching into a global config, so they stay pure and testable. The planner may have a thin `config.ts` and pass its values in.)

### Pattern 1: Inject the clock; represent holidays as `Set<yyyy-MM-dd>`
**What:** Pure functions take the current moment and the holiday set as parameters.
**When to use:** Everywhere in `clock.ts`. This is the keystone of SCHED-04 and all three date tests.
```typescript
// Source: luxon zones docs (moment.github.io/luxon, docs/zones.md) [CITED]
import { DateTime } from "luxon";

const STUDIO_ZONE = "Australia/Sydney";

// `now` is injected. In production the caller does:
//   nextWorkingDay(DateTime.now().setZone(STUDIO_ZONE), STUDIO_ZONE, holidays)
// In tests the caller passes a fixed DateTime — fully deterministic.
export function nextWorkingDay(
  now: DateTime,
  holidays: ReadonlySet<string>, // "yyyy-MM-dd" keys, studio-zone calendar dates
): DateTime {
  // Anchor to the studio-zone calendar day, drop the time-of-day.
  let day = now.startOf("day"); // DST-safe: midnight in `now`'s zone
  do {
    day = day.plus({ days: 1 }); // calendar-day add — DST-safe (see Pitfall 1)
  } while (!isWorkingDay(day, holidays));
  return day;
}

export function isWorkingDay(day: DateTime, holidays: ReadonlySet<string>): boolean {
  // luxon weekday: 1=Mon … 7=Sun
  if (day.weekday === 6 || day.weekday === 7) return false; // Sat/Sun
  const key = day.toISODate(); // "yyyy-MM-dd" in the DateTime's own zone
  return key !== null && !holidays.has(key);
}
```
**Why `toISODate()` keys work:** `toISODate()` renders the calendar date *in the DateTime's own zone* (`day` is already studio-zone), so comparing against studio-zone holiday strings is exact and DST-irrelevant. No instant-equality traps.

### Pattern 2: Friday → Monday emerges for free
**What:** No special-case branch needed — the weekend-skip loop naturally rolls Friday's `+1` (Saturday) past Sunday to Monday.
```typescript
// Friday 2026-06-05 (weekday 5) → +1 = Sat (skip) → Sun (skip) → Mon 2026-06-08. ✓
// If Monday is a holiday, the loop continues to Tuesday. ✓
```
**When to use:** SCHED-03/D-12. Keep it as the single loop above — do not write a separate Friday branch.

### Pattern 3: Available hours in exact minutes (D-02, D-15)
```typescript
const TARGET_MINUTES = 450; // 7.5h × 60, the per-day target

// absenceMinutesForDay: sum of event-type (absence) booking minutes on the target day.
export function availableMinutes(absenceMinutesForDay: number): number {
  return Math.max(0, TARGET_MINUTES - absenceMinutesForDay); // floored at 0 (D-02)
}
// available === 0  → designer is "off" (D-01), NOT underbooked.
```

### Pattern 4: Booked = confirmed vs tentative, never mixed (D-04, D-05)
```typescript
// A Productive booking carries minutes-per-day and a draft flag (and approval_status).
// "Confirmed" = NOT draft (Phase 2 confirms the exact predicate against live data;
//  Phase 1 takes an already-typed `isTentative: boolean` so it stays framework-agnostic).
export function bookedMinutes(bookings: ReadonlyArray<{ minutes: number; isTentative: boolean }>) {
  let confirmed = 0, tentative = 0;
  for (const b of bookings) {
    if (b.isTentative) tentative += b.minutes;
    else confirmed += b.minutes;
  }
  return { confirmed, tentative };
}
```

### Pattern 5: Classification (D-01, D-03, D-05, D-06, D-17)
```typescript
export type DayStatus = "off" | "underbooked" | "overbooked" | "ok";

export function classifyDay(availableMin: number, confirmedMin: number) {
  const openMin = availableMin - confirmedMin; // open uses CONFIRMED only (D-04)
  let status: DayStatus;
  if (availableMin === 0) status = "off";              // D-01 — mentioned, not flagged
  else if (confirmedMin > availableMin) status = "overbooked"; // D-06 — gentle signal, no clamp
  else if (openMin > 0) status = "underbooked";        // D-03 ANY gap; D-17 zero-bookings = full open
  else status = "ok";                                   // confirmed === available
  return { status, openMin };
}
// `shaky` is orthogonal: shaky = tentativeMin > 0. A day can be underbooked AND shaky (D-05).
```

### Pattern 6: Rest-of-week rollup net of time-off (CAP-05, D-07..D-10)
```typescript
export function restOfWeekWindow(targetDay: DateTime, holidays: ReadonlySet<string>): DateTime[] {
  // Friday of targetDay's week. luxon: weekday 5 = Friday.
  const friday = targetDay.plus({ days: 5 - targetDay.weekday }); // D-07/D-08 consistent rule
  const days: DateTime[] = [];
  for (let d = targetDay; d <= friday; d = d.plus({ days: 1 })) {
    if (isWorkingDay(d, holidays)) days.push(d); // holidays contribute 0, not a working day (D-10)
  }
  return days;
}
// studioTotal = Σ over (working day × designer) of availableMinutes(absenceThatDay)  → net of time-off (D-09)
// studioOpen  = Σ over the same of max(0, available − confirmed)
```
**Friday rollover note (D-08):** When `targetDay` is itself a Monday produced by a Friday run, `5 - weekday(Mon=1) = 4`, so the window is Mon→Fri (all of next week). The same one-liner handles both cases — no branch.

### Anti-Patterns to Avoid
- **Calling `DateTime.now()` inside a pure function:** breaks determinism and SCHED-04. Inject `now`.
- **Using native `Date` anywhere:** rejected by CLAUDE.md; DST/date-only footguns. luxon only.
- **Comparing holidays by `DateTime` equality:** equality is by instant, not calendar day. Use `yyyy-MM-dd` string keys.
- **Rounding to 0.25h before arithmetic:** accumulates error and breaks the "numbers must be exact" trust constraint. Round only the final surfaced figure (D-16).
- **Letting tentative bookings reduce the gap:** violates D-04/D-05. Tentative is tracked separately and never closes `open`.
- **Clamping overbooked to available:** loses the early-warning signal (D-06). Keep real booked minutes.
- **Throwing on missing/partial input:** violates D-19. Missing designer = recorded gap (D-18), not an exception.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "What is today in Australia/Sydney?" | Manual UTC-offset arithmetic on `Date` | `injectedNow.setZone(zone)` at the boundary; pass `DateTime` in | DST offset changes twice a year (Sydney: AEDT/AEST); hand-rolled offsets silently break around the transition. |
| Add one calendar day across DST | `new Date(ms + 86400000)` | `dateTime.plus({ days: 1 })` | A DST day is 23 or 25 hours; adding 86_400_000 ms lands on the wrong calendar day. luxon adds *calendar* days. (Pitfall 1) |
| Start-of-day in a zone | Truncate to midnight via string surgery | `dateTime.startOf("day")` | Honours the zone's DST; on a spring-forward day midnight may not exist — luxon handles it. |
| Date-only equality | Compare `Date` objects / timestamps | `a.toISODate() === b.toISODate()` or `a.hasSame(b, "day")` | Avoids time-of-day and zone contaminating a calendar-day comparison. |
| Day-of-week | `getDay()` (0=Sun) mental remapping | luxon `.weekday` (1=Mon…7=Sun, ISO) | ISO weekday is unambiguous; no off-by-one Sunday confusion. |
| Quarter-hour rounding | ad-hoc `Math.round(h*4)/4` scattered inline | one documented `roundToQuarterHour(decimalHours)` helper | Single source of truth for the rounding mode; testable in isolation. |

**Key insight:** Every date/timezone subtlety in this phase is a place luxon already solved correctly and a hand-rolled `Date` version gets subtly wrong exactly twice a year (DST) — which is precisely when a "trust the numbers" tool must not lie. The math itself is easy; the *clock* is where the bugs live, so delegate all of it to luxon.

## Runtime State Inventory

Not applicable — Phase 1 is greenfield, pure-logic, no rename/refactor/migration, no stored state, no live services, no OS registrations, no secrets, no build artifacts beyond the package install. **None — verified by:** this is the project's first source phase (git log shows only docs commits; no `src/` or `package.json` exists yet) and the phase touches no external system by design.

## Common Pitfalls

### Pitfall 1: Adding 24 hours is not adding a day across a DST boundary
**What goes wrong:** On the Sydney DST transition (early April AEDT→AEST gains an hour; early October AEST→AEDT loses one), adding a fixed 86,400,000 ms can land on the same calendar date or skip one.
**Why it happens:** A DST day is 23 or 25 hours; only millisecond math is affected.
**How to avoid:** Always `plus({ days: 1 })` / `startOf("day")` on a zone-aware luxon `DateTime`. luxon's higher-order units ("the same time the next day, regardless of intervening DSTs") are DST-safe. [CITED: moment.github.io/luxon docs/zones.md]
**Warning signs:** A "next working day" test passes in winter but fails the first week of April or October. **This is exactly the mandatory DST-boundary test** — construct `now` as `DateTime.fromISO("2026-04-04T16:30", { zone: "Australia/Sydney" })` (the day before Sydney's 2026 DST end is around 5 April — confirm the exact 2026 NSW DST date when writing the test) and assert the target rolls to the correct next working calendar day, not the wrong one. [ASSUMED — exact 2026 Sydney DST changeover date must be verified when authoring the test; see Assumptions Log A1]

### Pitfall 2: `toISODate()` returns the date in the DateTime's zone — keep zones consistent
**What goes wrong:** If a booking/absence date arrives as a UTC `DateTime` but the holiday set is keyed in studio-zone dates, `toISODate()` can disagree by a day near midnight.
**Why it happens:** Same instant, different calendar date in different zones.
**How to avoid:** Anchor everything to the studio zone *once* at the boundary (`setZone(STUDIO_ZONE)`), then all `toISODate()` keys agree. Treat all Phase-1 date inputs as already studio-zone calendar dates (Phase 2 normalises on the way in).
**Warning signs:** Off-by-one holiday matches or a designer's absence landing on the wrong day only for late-evening timestamps.

### Pitfall 3: Floating-point hours vs exact minutes
**What goes wrong:** `7.5 - 1.1` is not exactly `6.4` in floating point; accumulating decimal hours drifts.
**Why it happens:** IEEE-754 can't represent some decimals exactly.
**How to avoid:** Keep all arithmetic in **integer minutes** (D-15); convert to hours (`min / 60`) and round to 0.25h only at the surfaced-figure edge (D-16). Integer minutes are exact.
**Warning signs:** A rollup total that's `39.99999999` instead of `40`, or a 0.25h figure that flips between `7.25` and `7.5` depending on input order.

### Pitfall 4: Mocking the global clock instead of injecting it
**What goes wrong:** Tests reach for `mock.timers` / monkey-patching `DateTime.now`, become brittle, and leak state between tests.
**Why it happens:** Habit from codebases where the clock isn't injectable.
**How to avoid:** Inject `now: DateTime`. Then the three mandatory date cases are just three fixed inputs — no mocking, hand-verifiable. (This is the discretion-area recommendation for test structure.)
**Warning signs:** `beforeEach`/`afterEach` resetting global time; tests that pass alone but fail in a suite.

### Pitfall 5: "Confirmed" predicate assumed instead of typed
**What goes wrong:** Phase 1 hard-codes a Productive field check (e.g. `draft === false`) that turns out wrong against live data.
**Why it happens:** The exact confirmed/tentative mapping is a Phase-2 live-data discovery (BRIEF-style), not yet certain.
**How to avoid:** Phase 1 consumes an already-typed `isTentative: boolean` (and, if needed, `available`/roster) — keep the domain framework-agnostic. Phase 2 owns translating `draft`/`approval_status` into that boolean. [ASSUMED — see A2]
**Warning signs:** `import` of Productive response types inside `capacity.ts`; the word `draft` appearing in the pure domain.

## Code Examples

### Construct a fixed studio-zone "now" for a test (the keystone test idiom)
```typescript
// Source: luxon fromISO with { zone } option [CITED: moment.github.io/luxon docs/zones.md]
import { DateTime } from "luxon";

// A Friday 4:30pm in Sydney — deterministic, no system clock involved.
const fridayEvening = DateTime.fromISO("2026-06-05T16:30:00", { zone: "Australia/Sydney" });
const holidays = new Set<string>(); // none this week
const target = nextWorkingDay(fridayEvening, holidays);
// expect target.toISODate() === "2026-06-08" (Monday)  → SCHED-03/D-12 proven
```

### Holiday-eve case (D-13)
```typescript
// Target would be Wednesday, but Wednesday is a NSW holiday → rolls to Thursday.
const tueEvening = DateTime.fromISO("2026-06-09T16:30:00", { zone: "Australia/Sydney" });
const holidays = new Set(["2026-06-10"]); // injected holiday on the would-be target
const target = nextWorkingDay(tueEvening, holidays);
// expect target.toISODate() === "2026-06-11" (Thursday)
```
(Dates above are illustrative — the planner picks concrete fixtures; the *shape* is what matters.)

### Quarter-hour rounding (documented mode — D-16)
```typescript
// Recommended default: round half UP (toward +∞) at 0.25h granularity.
// Rationale: simplest to explain to a non-engineer ("6.375h shows as 6.5"),
// matches human "round up to the next quarter" intuition, and the rounded value
// is display-only — never fed back into arithmetic (exact minutes are retained).
export function roundToQuarterHour(decimalHours: number): number {
  return Math.round(decimalHours * 4 + 1e-9) / 4; // +epsilon nudges exact .5 cases up deterministically
}
// 6.40h → 6.50 ; 6.10h → 6.00 ; 7.125h → 7.25 (the 0.125 half-quarter rounds up)
```
**Documented decision:** round-half-up at 0.25h, display-only. The discretion note (D-16/CONTEXT) explicitly leaves the mode to the planner — this is the recommended default; round-half-even is an acceptable alternative if the planner prefers it, but it must be documented and unit-tested either way.

### `node:test` structure for a pure function
```typescript
// Source: nodejs.org/docs/latest-v22.x/api/test.html [CITED]
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { nextWorkingDay } from "../clock.ts";

describe("nextWorkingDay", () => {
  it("rolls Friday to Monday (SCHED-03)", () => {
    const fri = DateTime.fromISO("2026-06-05T16:30", { zone: "Australia/Sydney" });
    assert.equal(nextWorkingDay(fri, new Set()).toISODate(), "2026-06-08");
  });

  it("skips an injected holiday on the would-be target (holiday-eve)", () => {
    const tue = DateTime.fromISO("2026-06-09T16:30", { zone: "Australia/Sydney" });
    assert.equal(nextWorkingDay(tue, new Set(["2026-06-10"])).toISODate(), "2026-06-11");
  });

  it("is correct across the Sydney DST boundary (SCHED-04)", () => {
    // construct `now` straddling the changeover; assert the calendar day is right
  });
});
```
**Run command:** `node --import tsx --test "src/**/*.test.ts"` (Node 22 + tsx loader). [CITED: nodejs.org test-runner docs; tsx README]
Add to `package.json`:
```json
{ "type": "module",
  "scripts": {
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "test:quick": "node --import tsx --test \"src/**/*.test.ts\""
  } }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest/Vitest for unit tests | Node built-in `node:test` + `node:assert` | Stable Node 20+, default in 22 | No test-framework dependency; CLAUDE.md mandates this. |
| Moment.js | luxon (same authors, immutable, zone-first) | Moment in maintenance mode since ~2020 | luxon is the correct modern choice; already locked. |
| `ts-node` | `tsx` | tsx now the common zero-config TS runner | Faster, esbuild-based; locked by CLAUDE.md. |
| TypeScript 5.x | TypeScript **6.0** now `latest` on npm | TS 6.0 released recently (npm `latest` = 6.0.3 as of 2026-06-02) | **CLAUDE.md locks `5.x`.** Pin `typescript@~5.9.3` for this phase; a move to 6.x is a stack decision outside Phase 1's scope. [VERIFIED: npm registry] |

**Deprecated/outdated:**
- Native `Date` for any of this work — explicitly rejected (CLAUDE.md "What NOT to Use").
- Cards v1 / axios / got — not relevant to Phase 1, but listed as rejected in CLAUDE.md.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sydney's 2026 DST end (AEDT→AEST) is on/around **5 April 2026**; the DST-boundary test must use the *actual* 2026 NSW changeover dates | Pitfall 1, Code Examples | Test asserts the wrong calendar boundary and fails to exercise DST, OR passes vacuously. **Low impact** — luxon does the math correctly regardless; this only affects choosing a fixture that actually straddles the transition. The planner must look up the exact 2026 AU DST dates (first Sunday in April / first Sunday in October per current AU rule) when authoring the test. |
| A2 | "Confirmed vs tentative" maps to Productive's `draft` flag (tentative = `draft === true`); Phase 1 abstracts this as a typed `isTentative` boolean | Pitfall 5, Pattern 4 | If the real mapping differs, only the Phase-2 *translation* changes — Phase 1 stays correct because it consumes the abstracted boolean. The exact predicate is a Phase-2 live-data discovery (CONTEXT defers it). |
| A3 | Absences arrive as per-day minute totals already attributed to the target day (Productive `booking_type=event`, `time`/`hours` per day) | Pattern 3 | If multi-day absences need expansion to per-day minutes, that normalisation belongs in Phase 2's input mapping; Phase 1's `absenceMinutesForDay` contract still holds. |
| A4 | "7.5h target" = 450 minutes/day, identical for all 3 designers | Pattern 3 | If a designer has a different daily target, `TARGET_MINUTES` must become a per-designer input. CONTEXT/PROJECT state a uniform 7.5h, so uniform is correct for v1. |

## Open Questions

1. **Exact 2026 Australian DST changeover dates for the DST-boundary test fixture**
   - What we know: AU DST (NSW) currently ends first Sunday of April, starts first Sunday of October; luxon handles the transition correctly regardless of which date is chosen.
   - What's unclear: the precise 2026 dates to pick a fixture that genuinely straddles the boundary.
   - Recommendation: planner verifies the 2026 dates (first Sun Apr 2026 / first Sun Oct 2026) when authoring `clock.test.ts`; this is a fixture-selection detail, not a logic risk.

2. **Whether the studio "week" is strictly Mon–Fri for the rollover anchor**
   - What we know: D-07/D-08 define the window as target-day → that day's Friday; weekends are non-working.
   - What's unclear: nothing material — the spec is explicit. Flagged only to confirm Friday (ISO weekday 5) is the correct anchor (it is).
   - Recommendation: implement Friday-anchor as in Pattern 6; covered by a Tue-run and a Fri-run test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime + `node:test` | ✓ | v22.22.1 | — |
| npm | Install luxon/tsx/TS | ✓ | (bundled with Node 22) | — |
| `node:test` / `node:assert` | Unit tests | ✓ | built-in | — |
| luxon (post-install) | Date math | ✗ (not yet installed) | will be `^3.7.2` | none needed — `npm install luxon` |
| tsx (post-install) | Run/type-strip TS, test host | ✗ (not yet installed) | will be `^4.22.4` | Node 22 `--experimental-strip-types` is a fallback host, but tsx is locked |

**Missing dependencies with no fallback:** none — Node 22 and npm are present; the rest is a standard `npm install` of locked packages.
**Missing dependencies with fallback:** TS execution host (tsx) — Node 22's native `--experimental-strip-types`/`--experimental-transform-types` could run tests if tsx were unavailable, but tsx is the locked choice.

## Project Constraints (from CLAUDE.md)

- **Stack is locked:** Node 22 + TypeScript (pin 5.x), `tsx` to run, `luxon` ^3 for ALL date/timezone math, Node built-in `node:test` for unit tests. No Jest/Vitest.
- **Native JS `Date` is forbidden** ("What NOT to Use") — use luxon for every working-day/timezone/DST computation.
- **The LLM must never do hour/capacity arithmetic** — all math is deterministic code. Phase 1 *is* that deterministic core; no LLM touches it.
- **Trust constraint:** numbers must be exact — drives the integer-minutes-internal / round-only-at-display approach (D-15/D-16).
- **GSD workflow enforcement:** file changes go through a GSD command; Phase 1 implementation runs under `/gsd-execute-phase`.
- **Productive native unit is minutes** (`time` field) — compute in minutes (CLAUDE.md Item 2 confirms booking attributes `time` (minutes/day), `hours`, `draft`, `approval_status`, `booking_type`, with time-off as `booking_type=event`).
- **`zod` is for the Phase-2 boundary**, not Phase 1 — Phase 1 consumes already-typed inputs.

## Validation Architecture

Skipped — `.planning/config.json` sets `workflow.nyquist_validation: false`. (Unit testing is nonetheless central to this phase via the locked `node:test` runner and the four success criteria; the test structure is covered above under Code Examples and Pattern/Pitfall sections.)

## Security Domain

Phase 1 is pure in-memory arithmetic over typed inputs: no network, no I/O, no secrets, no user-supplied untrusted strings, no persistence, no auth. The ASVS categories below are effectively N/A for this phase; the project's real security surface (secrets, API auth, webhook URL) lives in Phases 2–6.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in pure domain (Phase 2+: Productive `X-Auth-Token`). |
| V3 Session Management | no | Stateless pure functions. |
| V4 Access Control | no | No resources accessed. |
| V5 Input Validation | partial (defensive) | Phase 1 does not *validate* (that's Phase 2 `zod`), but MUST **degrade, never throw** on malformed/partial input (D-19) — treat unexpected shapes as a recorded gap, not a crash. Robustness, not a security boundary. |
| V6 Cryptography | no | No crypto in this phase. |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted numeric input causing NaN/Infinity propagation | Tampering (robustness) | Treat non-finite minute values as 0 / recorded gap; never let NaN reach a surfaced figure (D-19). |
| Silent partial result (missing designer) | Denial of trust | Detect against the known 3-designer roster and report the gap explicitly (D-18) — never a silently-partial report. |

## Sources

### Primary (HIGH confidence)
- `nodejs.org/docs/latest-v22.x/api/test.html` — `node:test` describe/it/run, `--import tsx --test` invocation, assertions via `node:assert`.
- `moment.github.io/luxon` + `github.com/moment/luxon/blob/master/docs/zones.md` — `setZone`, `fromISO({ zone })`, `startOf`, `plus({ days })` DST-safety, `weekday` (1=Mon…7=Sun), `keepLocalTime`, zone-aware `toISODate`.
- npm registry (`npm view`) — verified versions/ages: luxon 3.7.2 (2017-created, moment org), @types/luxon 3.7.1, typescript 5.9.3 (5.x) / 6.0.3 (latest), tsx 4.22.4 (privatenumber org); no postinstall scripts on any.
- Local environment — `node --version` → v22.22.1; git log (docs-only commits, greenfield source).
- CLAUDE.md — locked stack, Item 2 Productive data shapes, "What NOT to Use" rejecting native `Date`.

### Secondary (MEDIUM confidence)
- WebSearch (luxon zone idioms, node:test + tsx usage) — cross-verified against the official luxon and Node docs above.

### Tertiary (LOW confidence)
- None relied upon for any asserted fact. The only LOW item is the *specific 2026 Sydney DST date* (A1), flagged for the planner to confirm when writing the fixture.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified on npm; stack is locked by CLAUDE.md.
- Architecture (inject-clock, integer-minutes, holiday Set<string>): HIGH — derived directly from locked decisions + verified luxon behaviour.
- luxon DST/working-day idioms: HIGH — confirmed against official luxon zones docs (calendar-day math is DST-safe).
- Pitfalls: HIGH — standard, well-documented luxon/Date traps directly relevant to the three mandatory tests.
- Exact 2026 DST fixture date: LOW (A1) — planner to verify; not a logic risk.

**Research date:** 2026-06-02
**Valid until:** ~2026-09-02 (stable, mature libraries; re-check if moving off TS 5.x or if luxon majors).
