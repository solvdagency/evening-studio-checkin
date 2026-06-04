/**
 * Productive booking normalization → the Phase-1 domain contracts (D-09 / D-11 / D-07 / D-12).
 *
 * Trust boundary: this is the one-way gate where raw Productive shapes become
 * clean `Booking` / `Absence`. Raw Productive types NEVER cross into src/domain —
 * only the domain contracts leave this file (RESEARCH boundary rule; threat
 * T-02-05). The per-day minutes math (D-09) is trust-critical: the figures must
 * be exact or the team stops reading the message (CLAUDE.md). It mirrors Phase 1's
 * defensive posture — non-finite numbers coerce to 0, an unknown booking method
 * returns 0, and the method-3 divisor is guarded > 0 so a NaN/Infinity can never
 * reach a surfaced figure (threat T-02-06; same instinct as capacity.safeMinutes).
 *
 * Work-vs-absence (D-11) is read from the RELATIONSHIPS, not an attribute: the
 * live /bookings response has NO `booking_type` attribute (plan 02-01 live probe).
 * A populated `service` relationship marks a work booking → Booking; a populated
 * `event` relationship marks an absence → Absence. `isTentative ⟺ draft===true`
 * for work bookings (D-07) — `approved`/`rejected` are NOT the tentative signal.
 * All non-canceled absences reduce availability regardless of approval (D-12).
 */

import { DateTime } from "luxon";
import type { Absence, Booking, DesignerId, HolidaySet } from "../domain/types.ts";
import { TARGET_MINUTES } from "../domain/types.ts";
import { isWorkingDay } from "../domain/clock.ts";
import { STUDIO_ZONE } from "../domain/types.ts";

/**
 * The shape this mapper reads from a zod-validated `/bookings` resource. Mirrors
 * the corrected live schema (src/productive/schemas.ts): there is NO
 * `booking_type` / `approval_status` attribute — work-vs-absence comes from the
 * `service` vs `event` relationship. A relationship is either a linkage
 * `{ data: {id,type} | null }` or a not-included marker `{ meta: {...} }`.
 */
export interface RawBookingForMapping {
  id: string;
  type: string;
  attributes: {
    booking_method_id: number;
    /** Per-day minutes (method 1); null otherwise. */
    time: number | null;
    /** Total minutes over the range (method 3); null otherwise. */
    total_time: number | null;
    /** Percentage of daily capacity (method 2); null otherwise. */
    percentage: number | null;
    /** Booking date range, "yyyy-MM-dd". */
    started_on: string;
    ended_on: string;
    /** Tentative ⟺ draft===true (D-07). */
    draft: boolean;
    /** Canceled bookings are excluded (D-08); defensively re-checked here. */
    canceled: boolean;
  };
  relationships: {
    person?: { data?: { id: string; type: string } | null; meta?: unknown } | undefined;
    service?: { data?: { id: string; type: string } | null; meta?: unknown } | undefined;
    event?: { data?: { id: string; type: string } | null; meta?: unknown } | undefined;
  };
}

/**
 * Coerce a possibly non-finite number to a safe finite value (NaN/Infinity → 0).
 * Mirrors `safeMinutes` in src/domain/capacity.ts so a garbage Productive figure
 * can never surface as a real minute count (threat T-02-06 / D-19).
 */
function safe(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Is `dayKey` ("yyyy-MM-dd") within the inclusive booking range? Date-only string
 * comparison is exact and zone-irrelevant (the keys are already studio-zone
 * calendar dates), so no DateTime math is needed for the containment check.
 */
function dayInRange(dayKey: string, started_on: string, ended_on: string): boolean {
  return started_on <= dayKey && dayKey <= ended_on;
}

/**
 * Count inclusive working days between `started_on` and `ended_on` (D-09 method-3
 * divisor), reusing the Phase-1 clock's `isWorkingDay` so weekend/holiday logic is
 * NOT re-derived. Open Q3 decision: holidays in the range DO reduce the divisor —
 * a day the studio is closed is not a day the total spreads across. Returns 0 for
 * an inverted range (ended before started) — the caller's > 0 guard then yields 0
 * minutes, never a negative or Infinity.
 */
export function workingDaysInRange(
  started_on: string,
  ended_on: string,
  holidays: HolidaySet,
): number {
  const start = DateTime.fromISO(started_on, { zone: STUDIO_ZONE }).startOf("day");
  const end = DateTime.fromISO(ended_on, { zone: STUDIO_ZONE }).startOf("day");
  if (!start.isValid || !end.isValid || end < start) return 0;

  let count = 0;
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    if (isWorkingDay(d, holidays)) count += 1;
  }
  return count;
}

/**
 * Normalize a booking to EXACT minutes on the target day (D-09, RESEARCH Pattern 5):
 *  - method 1 (per day):    `time ?? 0` (already per-day minutes)
 *  - method 3 (total hours): `total_time / workingDaysInRange`, guarded > 0
 *  - method 2 (percentage):  `round((percentage/100) * TARGET_MINUTES)`
 *  - unknown method:        0 (never throws)
 * A target day outside `[started_on, ended_on]` contributes 0. All numeric inputs
 * pass through `safe(...)` so null/NaN/Infinity coerce to 0.
 */
export function minutesOnDay(
  attrs: RawBookingForMapping["attributes"],
  dayKey: string,
  workingDays: number,
): number {
  if (!dayInRange(dayKey, attrs.started_on, attrs.ended_on)) return 0;

  switch (attrs.booking_method_id) {
    case 1: // per day — `time` is already minutes/day
      return safe(attrs.time);
    case 3: // total hours — spread across working days in range (guard > 0; Pitfall 5)
      return workingDays > 0 ? Math.round(safe(attrs.total_time) / workingDays) : 0;
    case 2: // percentage of the 450-min daily target
      return Math.round((safe(attrs.percentage) / 100) * TARGET_MINUTES);
    default: // unknown method — 0, never throw
      return 0;
  }
}

/** Extract a populated relationship linkage id, or null if not linked/included. */
function linkedId(
  rel: { data?: { id: string; type: string } | null; meta?: unknown } | undefined,
): string | null {
  return rel?.data?.id ?? null;
}

/**
 * The shape this mapper reads from a zod-validated `/people` availability entry
 * (plan 06-02). One availabilities period: an inclusive [started_on, ended_on]
 * date range (ended_on null = open-ended/current, D-01) and a `working_hours`
 * numeric array of hours-per-weekday. `working_hours` is accepted at any length
 * here; only 7 or 14 are honoured by the mapper (D-08) — any other length is a
 * defensive all-zero. Stays INSIDE src/productive (boundary rule).
 */
export interface RawAvailabilityForMapping {
  /** Period start, "yyyy-MM-dd" studio-zone calendar date. */
  started_on: string;
  /** Period end, "yyyy-MM-dd"; null = open-ended/current (D-01). */
  ended_on: string | null;
  /** Hours-per-weekday, Mon=0..Sun=6; 7-element, or 14-element alternating (D-08). */
  working_hours: number[];
  /** Productive holiday calendar id — NOT used (the app keeps its own NSW set). */
  holiday_calendar_id?: number | null;
}

/**
 * Is `dayKey` covered by an availability period? Mirrors `dayInRange` but treats a
 * null `ended_on` as open-ended (D-01): a current period with no end date covers
 * every date on/after its start.
 */
function availabilityCovers(
  dayKey: string,
  started_on: string,
  ended_on: string | null,
): boolean {
  if (started_on > dayKey) return false;
  return ended_on === null || dayKey <= ended_on;
}

/**
 * Map a designer's `availabilities` to EXACT per-weekday rostered minutes for the
 * week containing `dayKey` (CAP-06 / D-01 / D-02 / D-08). Returns a 7-element
 * array indexed Mon=0..Sun=6; each entry is `round(safe(hours) × 60)`.
 *
 * Steps (degrade-safe — never throws, never invents capacity):
 *  1. Select the period whose [started_on, ended_on] covers `dayKey` (ended_on
 *     null = open-ended, D-01). If none covers, return all-zero (no rostered data).
 *  2. Read its `working_hours`: length 7 → use directly; length 14 → compare
 *     week 1 (slice 0–7) vs week 2 (slice 7–14): equal → week 1, differing →
 *     console.warn + week 1 (true week-parity deferred, D-08); any other length →
 *     all-zero (defensive, T-06-04).
 *  3. Map each weekday to `Math.round(safe(hours) × 60)` so a non-finite figure
 *     can never surface as NaN/Infinity (T-06-03).
 *
 * Only clean primitive minutes leave this file (boundary rule).
 */
export function availabilityToWeekdayMinutes(
  availabilities: readonly RawAvailabilityForMapping[],
  dayKey: string,
): number[] {
  const allZero = (): number[] => [0, 0, 0, 0, 0, 0, 0];

  // (1) Pick the covering period. Among ALL periods covering `dayKey`, the CURRENT
  //     one wins: the latest `started_on` (a newer schedule supersedes an older one
  //     even if the old period was never end-dated). This is order-independent — a
  //     plain `.find` first-match would flip with the API's array ordering when two
  //     periods overlap (e.g. a PM adds a new schedule without closing the old),
  //     intermittently resurfacing a stale full-time day on a designer's day off.
  //     Tie-break (same start) on `ended_on === null` = the open-ended active one.
  const covering = availabilities.filter((a) =>
    availabilityCovers(dayKey, a.started_on, a.ended_on),
  );
  if (covering.length === 0) return allZero();
  const period = covering.reduce((best, a) => {
    if (a.started_on !== best.started_on) return a.started_on > best.started_on ? a : best;
    if (best.ended_on === null) return best;
    if (a.ended_on === null) return a;
    return a.ended_on > best.ended_on ? a : best;
  });

  // (2) Resolve the week to use from working_hours length (D-08).
  const wh = period.working_hours;
  let week: number[];
  if (wh.length === 7) {
    week = wh;
  } else if (wh.length === 14) {
    const w1 = wh.slice(0, 7);
    const w2 = wh.slice(7, 14);
    const identical = w1.every((h, i) => h === w2[i]);
    if (!identical) {
      console.warn(
        "availabilityToWeekdayMinutes: 14-element alternating-week schedule with " +
          "differing weeks; using week 1 (true parity deferred, D-08).",
      );
    }
    week = w1;
  } else {
    // Unexpected length → no rostered data (defensive, never a fabricated day).
    return allZero();
  }

  // (3) hours × 60 → exact integer minutes, every entry coerced (T-06-03).
  return week.map((h) => Math.round(safe(h) * 60));
}

/**
 * Index a pre-computed per-weekday minutes array (Mon=0..Sun=6) by the weekday of
 * `dayKey` (D-02). Derives the 0-based weekday from a luxon DateTime in
 * STUDIO_ZONE (`.weekday` is 1=Mon..7=Sun → subtract 1). An out-of-range index or
 * an invalid date returns 0; the stored minute is passed through `safe(...)` so a
 * garbage figure can never surface (T-06-03). Never throws.
 */
export function rosteredMinutesForWeekday(weekdayMinutes: number[], dayKey: string): number {
  const dt = DateTime.fromISO(dayKey, { zone: STUDIO_ZONE });
  if (!dt.isValid) return 0;
  const idx = dt.weekday - 1; // luxon 1..7 (Mon..Sun) → 0..6
  if (idx < 0 || idx >= weekdayMinutes.length) return 0;
  return safe(weekdayMinutes[idx]);
}

/**
 * Split validated raw bookings into the Phase-1 `Booking[]` (work) and
 * `Absence[]` (time off) for the target day (D-11). Work bookings carry
 * `isTentative = draft===true` (D-07); absences carry only minutes and all
 * non-canceled absences count (D-12). Canceled bookings are defensively skipped
 * even though the gather query already filters them. A booking with neither a
 * `service` nor an `event` linkage is dropped (never thrown).
 *
 * Output is ONLY clean domain types — no raw Productive shape leaves this function.
 */
export function mapToBookingsAndAbsences(
  rawBookings: readonly RawBookingForMapping[],
  targetDayKey: string,
  holidays: HolidaySet,
): { bookings: Booking[]; absences: Absence[] } {
  const bookings: Booking[] = [];
  const absences: Absence[] = [];

  for (const raw of rawBookings) {
    const a = raw.attributes;
    if (a.canceled === true) continue; // D-08 — defensive; never silently include

    const workingDays = workingDaysInRange(a.started_on, a.ended_on, holidays);
    const minutes = minutesOnDay(a, targetDayKey, workingDays);
    const designerId = (linkedId(raw.relationships.person) ?? "") as DesignerId;

    if (linkedId(raw.relationships.service) !== null) {
      // Work booking → Booking (D-11). Tentative ⟺ draft===true (D-07).
      bookings.push({ designerId, minutes, isTentative: a.draft === true });
    } else if (linkedId(raw.relationships.event) !== null) {
      // Absence booking → Absence (D-11/D-12). No approval gate, no tentative flag.
      absences.push({ designerId, minutes });
    }
    // else: neither work nor absence linkage — drop (never throw).
  }

  return { bookings, absences };
}
