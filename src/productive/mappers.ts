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
