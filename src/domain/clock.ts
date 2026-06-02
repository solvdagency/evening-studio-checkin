/**
 * The working-day clock — pure, deterministic, DST-safe (SCHED-03 / SCHED-04).
 *
 * Given an injected studio-zone `now` and an injected holiday set, derive the
 * correct target working day (skipping weekends and holidays) and enumerate the
 * rest-of-week window. The clock NEVER reads the system clock: `now` is always
 * passed in, which is what makes the Friday→Monday, holiday-eve, and DST-boundary
 * behaviours fully deterministic and hand-verifiable.
 *
 * All date/timezone reasoning is delegated to luxon. Native `Date` is never used
 * (CLAUDE.md "What NOT to Use"); luxon's calendar-day arithmetic (`plus({days})`,
 * `startOf("day")`) is DST-safe by design — a DST day is 23 or 25 hours, but
 * higher-order day math lands on the correct calendar day regardless.
 */

import { DateTime } from "luxon";
import type { HolidaySet, WorkingDay } from "./types.ts";

/**
 * Is `day` a working day? False for Saturday/Sunday (luxon ISO weekday 6/7) and
 * for any weekday whose "yyyy-MM-dd" key is in the injected holiday set.
 *
 * `toISODate()` renders the calendar date in the DateTime's own zone, so as long
 * as `day` is studio-zone-anchored, comparison against studio-zone holiday keys
 * is exact and DST-irrelevant (RESEARCH Pattern 1 / Pitfall 2).
 */
export function isWorkingDay(day: DateTime, holidays: HolidaySet): boolean {
  if (day.weekday === 6 || day.weekday === 7) return false; // Sat / Sun
  const key = day.toISODate();
  return key !== null && !holidays.has(key);
}

/**
 * The next working day strictly after `now`'s calendar day, skipping weekends
 * and injected holidays. A single skip loop: Friday→Monday emerges for free
 * (Fri +1 = Sat → skip → Sun → skip → Mon), and a holiday on the would-be
 * target simply continues the loop (RESEARCH Pattern 2 — no Friday special-case).
 */
export function nextWorkingDay(now: DateTime, holidays: HolidaySet): WorkingDay {
  let day = now.startOf("day"); // anchor to the studio-zone calendar day
  do {
    day = day.plus({ days: 1 }); // calendar-day add — DST-safe
  } while (!isWorkingDay(day, holidays));
  return day;
}

/**
 * The working days from `targetDay` through that day's Friday, inclusive,
 * with weekends and holidays removed (CAP-05, D-07 / D-08 / D-10).
 *
 * The Friday anchor (`5 - weekday`) makes one rule cover both cases with no
 * branch: a Tuesday target yields Tue–Fri; a Monday target (produced by a
 * Friday-evening run) yields the whole next week Mon–Fri.
 */
export function restOfWeekWindow(targetDay: DateTime, holidays: HolidaySet): WorkingDay[] {
  const friday = targetDay.plus({ days: 5 - targetDay.weekday });
  const days: WorkingDay[] = [];
  for (let d = targetDay; d <= friday; d = d.plus({ days: 1 })) {
    if (isWorkingDay(d, holidays)) days.push(d);
  }
  return days;
}
