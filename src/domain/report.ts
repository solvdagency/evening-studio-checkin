/**
 * StudioReport assembly — the top-level output contract (CAP-05, plan 01-03).
 *
 * Composes the pure pieces from the prior plans into the single object the rest
 * of the system consumes:
 *   - the working-day clock (01-01): nextWorkingDay + restOfWeekWindow
 *   - per-designer capacity (01-02): availableMinutes / bookedMinutes / classifyDay
 *     via computeDesignerDay → DesignerResult
 *
 * It produces three things the nightly nudge depends on:
 *   1. Per-designer target-day results (the "what's open tomorrow" figures).
 *   2. A rest-of-week rollup — open vs total hours across the remaining working
 *      days, NET OF TIME-OFF (D-09), summed in exact minutes (RESEARCH Pattern 6).
 *   3. A roster-gap list — any rostered designer that never appeared in the input
 *      at all, so a partial data pull can never masquerade as a complete report
 *      (D-18 / threat T-01-06).
 *
 * Trust guarantees (this is Phase 1's trust boundary):
 *   - DETERMINISTIC: `now` is injected; the module never reads the system clock
 *     (no luxon-now call, no native date construction), does no I/O, and uses no
 *     randomness. Identical inputs yield deep-equal output (T-01-08).
 *   - NON-THROWING: partial / empty / garbage input degrades gracefully. Non-finite
 *     minutes are coerced to 0 by the capacity helpers; an empty roster or empty
 *     arrays still produce a well-formed StudioReport (D-19 / threat T-01-07).
 *
 * All hour figures are display-only 0.25h-rounded values; the `*Min` fields are
 * the exact source of truth (D-15 / D-16) — the team's trust depends on the
 * minutes being exact, so the LLM/renderer never recomputes them.
 */

import type { DateTime } from "luxon";
import type { Absence, Booking, DesignerId, HolidaySet } from "./types.ts";
import { TARGET_MINUTES } from "./types.ts";
import { availableMinutes, bookedMinutes, computeDesignerDay } from "./capacity.ts";
import type { DesignerResult } from "./capacity.ts";
import { nextWorkingDay, restOfWeekWindow } from "./clock.ts";
import { minutesToHours, roundToQuarterHour } from "./round.ts";

/**
 * A target-day booking optionally tagged with the window day it falls on.
 *
 * Phase 1 keeps the shared `Booking`/`Absence` types date-free (they describe a
 * single attributed day). For the rest-of-week rollup we need a date dimension,
 * so the report layer accepts an OPTIONAL `date` ("yyyy-MM-dd", studio zone).
 * A booking/absence with NO `date` is attributed to the TARGET day — this keeps
 * the simplest "just today's numbers" caller trivial while letting a richer
 * caller spread bookings across the whole window. (Defined here, not on the
 * shared types, to keep the domain contract unchanged for other consumers.)
 */
export interface DatedBooking extends Booking {
  /** Studio-zone "yyyy-MM-dd" of the window day; omit to mean the target day. */
  date?: string;
}

/** A target-day absence optionally tagged with the window day it falls on. */
export interface DatedAbsence extends Absence {
  /** Studio-zone "yyyy-MM-dd" of the window day; omit to mean the target day. */
  date?: string;
}

/**
 * Everything computeStudioReport needs. All inputs are injected — nothing is
 * sourced from the system clock or the environment, which is what makes the
 * report deterministic and unit-testable.
 */
export interface StudioReportInput {
  /** Injected studio-zone "now"; the report derives the target day from it. */
  now: DateTime;
  /** Injected holiday set ("yyyy-MM-dd" studio-zone keys). */
  holidays: HolidaySet;
  /** The expected roster (the 3 monitored designers); the gap check runs against it. */
  roster: ReadonlyArray<DesignerId>;
  /** Bookings, optionally per window day (undated = target day). */
  bookings: ReadonlyArray<DatedBooking>;
  /** Absences, optionally per window day (undated = target day). */
  absences: ReadonlyArray<DatedAbsence>;
  /**
   * Per-designer per-day ROSTERED minutes — the available-minutes basis (CAP-06 /
   * D-02 / D-03). Given a designer and a studio-zone "yyyy-MM-dd" date key, returns
   * that designer's rostered minutes for that window day: their real working hours
   * for the matching weekday (e.g. Anisha is rostered 0 on Wed/Fri). A value of 0
   * means NOT rostered → 0 available for that day → "off" (mentioned, never flagged).
   *
   * Injected the same way as `holidays` / `roster` / `assessedDesigners` so the
   * module stays pure and deterministic — Phase 2 (Productive ingestion) parses and
   * validates `person.availabilities` at the boundary and supplies this lookup.
   *
   * OMIT to fall back to a flat standard day for every designer-date (TARGET_MINUTES).
   * A missing/unknown entry from a provided lookup resolves to 0 (degrade-safe — the
   * report never INVENTS capacity for a designer it has no rostered data for, D-06).
   */
  rosteredMinutes?: (designerId: DesignerId, dateKey: string) => number;
  /**
   * Which rostered designers the data pull actually covered (D-18). OMIT to mean
   * "the whole roster was assessed" — so an empty/quiet pull for the full roster
   * is treated as present-but-empty (everyone underbooked with full open), NOT a
   * gap (D-19; matches the empty-input contract). When Phase 2 fails to pull a
   * specific designer it passes only the ones it DID reach here, and any roster
   * member absent from this list is reported in `missingDesigners`. The
   * distinction is deliberate: "present-with-no-bookings" (in this list, zero
   * bookings) is fundamentally different from "absent-from-the-pull" (not in this
   * list at all) — only the latter is a silent-partial-result risk (T-01-06).
   */
  assessedDesigners?: ReadonlyArray<DesignerId>;
}

/**
 * The rest-of-week rollup: open vs total capacity across the remaining working
 * days, net of time-off. `*Min` are exact; `*Hours` are display-only (D-16).
 */
export interface StudioRollup {
  /** Exact available minutes summed over (window day × rostered designer), net of absence (D-09). */
  totalMin: number;
  /** Exact open minutes summed the same way: Σ max(0, available − confirmed) per day-slot. */
  openMin: number;
  /** Display-only total hours (0.25h rounded). */
  totalHours: number;
  /** Display-only open hours (0.25h rounded). */
  openHours: number;
}

/**
 * The top-level output contract. Phase 2 feeds the inputs that produce it;
 * Phase 3 renders it. Kept stable and exported.
 */
export interface StudioReport {
  /** The target working day, "yyyy-MM-dd" (studio zone). */
  targetDay: string;
  /** The rest-of-week working days as "yyyy-MM-dd" strings, target day first. */
  window: string[];
  /** One result per rostered designer, in roster order, for the TARGET day. */
  designers: DesignerResult[];
  /** Open-vs-total rollup across the whole window, net of time-off. */
  rollup: StudioRollup;
  /** Rostered designers that never appeared in the input at all (D-18 gap). */
  missingDesigners: DesignerId[];
}

/** Studio-zone ISO date key for a window day. */
function dayKey(day: DateTime): string {
  // restOfWeekWindow yields studio-zone-anchored days; toISODate is non-null for them.
  return day.toISODate() ?? "";
}

/**
 * Sum the confirmed booked minutes for one designer on one specific day.
 * Reuses bookedMinutes (which already splits confirmed/tentative and coerces
 * non-finite values) — confirmed-only, so tentative never closes the gap (D-04).
 */
function confirmedMinutesFor(
  bookings: ReadonlyArray<DatedBooking>,
  designerId: DesignerId,
  dateKey: string,
): number {
  const forSlot = bookings.filter((b) => b.designerId === designerId && b.date === dateKey);
  return bookedMinutes(forSlot).confirmed;
}

/**
 * Total absence minutes for one designer on one specific day (defensive sum;
 * non-finite handling is delegated to availableMinutes downstream).
 */
function absenceMinutesFor(
  absences: ReadonlyArray<DatedAbsence>,
  designerId: DesignerId,
  dateKey: string,
): number {
  let total = 0;
  for (const a of absences) {
    if (a.designerId === designerId && a.date === dateKey) {
      total += Number.isFinite(a.minutes) ? a.minutes : 0;
    }
  }
  return total;
}

/**
 * Assemble the StudioReport from injected inputs. Pure, deterministic, never
 * throws (D-19). See the module header for the full trust contract.
 */
export function computeStudioReport(input: StudioReportInput): StudioReport {
  const { now, holidays, roster, bookings, absences, assessedDesigners } = input;

  // Rostered-minutes lookup (CAP-06 / D-02). When omitted, every designer-date falls
  // back to the standard 7.5h day (preserves the pre-CAP-06 flat-day behaviour for
  // simple callers). A provided lookup is the per-designer source of truth.
  const rosteredMinutesFor = (designerId: DesignerId, dateKey: string): number =>
    input.rosteredMinutes === undefined ? TARGET_MINUTES : input.rosteredMinutes(designerId, dateKey);

  const targetDay = nextWorkingDay(now, holidays);
  const targetKey = dayKey(targetDay);
  const windowDays = restOfWeekWindow(targetDay, holidays);
  const window = windowDays.map(dayKey);

  // Treat an undated booking/absence as belonging to the target day. This lets a
  // "just today's numbers" caller omit dates entirely while the rollup still
  // attributes those entries to the correct window slot.
  const normalize = <T extends { date?: string }>(items: ReadonlyArray<T>): T[] =>
    items.map((item) => (item.date === undefined ? { ...item, date: targetKey } : item));
  const datedBookings = normalize(bookings);
  const datedAbsences = normalize(absences);

  // Per-designer TARGET-DAY results (the "what's open tomorrow" figures).
  const designers: DesignerResult[] = roster.map((designerId) => {
    const targetBookings = datedBookings.filter(
      (b) => b.designerId === designerId && b.date === targetKey,
    );
    const targetAbsence = absenceMinutesFor(datedAbsences, designerId, targetKey);
    const rostered = rosteredMinutesFor(designerId, targetKey);
    return computeDesignerDay(designerId, targetBookings, rostered, targetAbsence);
  });

  // Rest-of-week rollup, summed over (window day × rostered designer), net of
  // time-off (D-09). Open is floored at 0 PER DAY-SLOT so a single overbooked
  // day can never make the studio look like it has negative open capacity — the
  // per-designer overbooked signal lives in the designers[] results (D-06).
  let totalMin = 0;
  let openMin = 0;
  for (const dayString of window) {
    for (const designerId of roster) {
      const rostered = rosteredMinutesFor(designerId, dayString);
      const available = availableMinutes(
        rostered,
        absenceMinutesFor(datedAbsences, designerId, dayString),
      );
      const confirmed = confirmedMinutesFor(datedBookings, designerId, dayString);
      totalMin += available;
      openMin += Math.max(0, available - confirmed);
    }
  }

  const rollup: StudioRollup = {
    totalMin,
    openMin,
    totalHours: roundToQuarterHour(minutesToHours(totalMin)),
    openHours: roundToQuarterHour(minutesToHours(openMin)),
  };

  // Roster gap (D-18 / T-01-06): a rostered designer the data pull did NOT cover
  // is named so a partial pull can never masquerade as complete. When
  // `assessedDesigners` is omitted, the whole roster is assumed assessed — so an
  // empty/quiet pull is "present-but-empty" (underbooked with full open), NOT a
  // gap (D-19). When provided, any roster member absent from it is missing. A
  // designer present-but-empty (assessed, zero bookings) is NOT missing — the
  // distinction is the whole point of the gap check.
  const assessed: ReadonlySet<DesignerId> =
    assessedDesigners === undefined ? new Set(roster) : new Set(assessedDesigners);
  const missingDesigners = roster.filter((designerId) => !assessed.has(designerId));

  return { targetDay: targetKey, window, designers, rollup, missingDesigners };
}
