/**
 * NSW public holidays + committed studio closures → the Phase-1 `HolidaySet` (D-13).
 *
 * Trust posture / boundary: this module SOURCES the holiday set that the pure
 * Phase-1 clock (src/domain/clock.ts) consumes. The clock compares calendar days
 * via `toISODate()` against this set, so every key here MUST be a bare
 * "yyyy-MM-dd" studio-zone date string — exactly what `toISODate()` emits. This
 * is the entire reason Phase 1 chose `ReadonlySet<string>` over `Set<DateTime>`
 * (src/domain/types.ts) and is the single sharp edge of the `date-holidays`
 * library (RESEARCH Pitfall 4): `h.date` arrives as "YYYY-MM-DD HH:mm:ss" (space
 * + time) which would NEVER match the clock's keys. We derive the key from
 * `h.start` via luxon in STUDIO_ZONE instead, so DST and zone offsets land on the
 * correct studio calendar day.
 *
 * Only `type === "public"` holidays are kept (D-13); `date-holidays` also emits
 * "bank"/"observance" entries that are not studio closures. Committed
 * STUDIO_CLOSURES (config.ts) are merged into the same set.
 */

import Holidays from "date-holidays";
import { DateTime } from "luxon";
import type { HolidaySet } from "./domain/types.ts";
import { STUDIO_ZONE } from "./domain/types.ts";
import { HOLIDAY_REGION } from "./config.ts";

/**
 * Derive the years a holiday set must cover for a given target day. Returns the
 * target's calendar year plus the next year, so a late-December Friday run that
 * targets early January (RESEARCH line 360) still has next-year holidays loaded.
 * Cheap and harmless to over-include a year, so this always returns two years.
 */
export function yearsForWindow(targetDay: DateTime): number[] {
  const year = targetDay.year;
  return [year, year + 1];
}

/**
 * Convert one `date-holidays` entry's start instant to a studio-zone "yyyy-MM-dd"
 * key. `h.start` may be a JS `Date` or an ISO string depending on the library
 * build; handle both. Returns `null` if the instant can't be parsed (defensive —
 * a bad entry is skipped, never thrown).
 */
function startToKey(start: Date | string): string | null {
  const dt =
    start instanceof Date
      ? DateTime.fromJSDate(start, { zone: STUDIO_ZONE })
      : DateTime.fromISO(start, { zone: STUDIO_ZONE });
  return dt.isValid ? dt.toISODate() : null;
}

/**
 * Build the injected `HolidaySet` (D-13): NSW public holidays across the given
 * years plus the committed studio closures. Keys are studio-zone "yyyy-MM-dd"
 * strings derived from each holiday's `start` instant (NOT the raw `h.date`
 * string — Pitfall 4). Non-"public" holiday types are excluded.
 *
 * @param years    Calendar years to enumerate (e.g. [2026, 2027]).
 * @param closures Committed "yyyy-MM-dd" studio closure keys to merge in.
 */
export function buildHolidaySet(
  years: readonly number[],
  closures: readonly string[],
): HolidaySet {
  const keys = new Set<string>();
  const hd = new Holidays(HOLIDAY_REGION.country, HOLIDAY_REGION.state);

  for (const year of years) {
    const holidays = hd.getHolidays(year);
    for (const h of holidays) {
      if (h.type !== "public") continue; // D-13: studio observes public holidays only
      const key = startToKey(h.start as Date | string); // from h.start, NOT raw h.date (Pitfall 4)
      if (key !== null) keys.add(key);
    }
  }

  // Merge committed studio-specific closures (already "yyyy-MM-dd"; D-13).
  for (const closure of closures) keys.add(closure);

  return keys;
}
