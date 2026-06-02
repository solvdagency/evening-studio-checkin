/**
 * Per-designer capacity + day classification — the trust-critical arithmetic.
 *
 * Given a designer's typed bookings and total absence minutes for the target day,
 * compute available / confirmed-booked / tentative / open figures in EXACT integer
 * minutes, then classify the day as off / underbooked / overbooked / ok with an
 * orthogonal `shaky` flag. Surfaced hour figures are rounded to 0.25h via
 * `./round.ts`; all internal arithmetic stays in minutes (D-15 / D-16).
 *
 * This module is framework-agnostic: it consumes the abstracted `isTentative`
 * boolean only and never imports any upstream-API response type (RESEARCH Pitfall 5).
 * It NEVER throws on odd input — non-finite minute values are coerced to 0 so a
 * NaN/Infinity can never reach a surfaced figure (D-19 / threat T-01-03).
 */

import type { Booking, DesignerId } from "./types.ts";
import { TARGET_MINUTES } from "./types.ts";
import { minutesToHours, roundToQuarterHour } from "./round.ts";

/**
 * Classification of a designer's target day.
 *  - "off"         : available is 0 (fully on leave) — mentioned, not flagged (D-01).
 *  - "underbooked" : a confirmed gap exists below available (D-03 / D-17).
 *  - "overbooked"  : confirmed booked exceeds available — a gentle signal (D-06).
 *  - "ok"          : confirmed booked exactly fills available.
 *
 * Exported and stable: plan 01-03 assembles the StudioReport from these results.
 */
export type DayStatus = "off" | "underbooked" | "overbooked" | "ok";

/**
 * The full per-designer result for the target day.
 *
 * The `*Min` fields are EXACT minutes (the source of truth for all arithmetic);
 * the `*Hours` fields are the 0.25h-rounded, DISPLAY-ONLY figures. `shaky` is
 * orthogonal to `status` — an "ok" or "overbooked" day can also be shaky if it
 * carries any tentative time (D-05).
 *
 * Exported and stable: plan 01-03 imports this shape to build the StudioReport.
 */
export interface DesignerResult {
  designerId: DesignerId;
  /** Exact available minutes for the day = TARGET_MINUTES - absence, floored at 0. */
  availableMin: number;
  /** Exact confirmed (non-tentative) booked minutes. */
  confirmedMin: number;
  /** Exact tentative booked minutes — tracked, never closes the gap. */
  tentativeMin: number;
  /** Exact open minutes = available - confirmed (unclamped; negative when overbooked). */
  openMin: number;
  status: DayStatus;
  /** True when any tentative time exists (D-05). Orthogonal to status. */
  shaky: boolean;
  /** Display-only available hours, rounded to 0.25h. */
  availableHours: number;
  /** Display-only confirmed booked hours, rounded to 0.25h. */
  bookedHours: number;
  /** Display-only open hours, rounded to 0.25h. */
  openHours: number;
}

/**
 * Coerce a possibly non-finite minute value to a safe finite number.
 * NaN / Infinity / -Infinity become 0 so they can never reach a surfaced figure
 * (D-19 / threat T-01-03). Finite values pass through unchanged.
 */
function safeMinutes(minutes: number): number {
  return Number.isFinite(minutes) ? minutes : 0;
}

/**
 * Available minutes for the target day = TARGET_MINUTES - absence, floored at 0
 * (CAP-01 / D-02). A non-finite absence is treated defensively as 0 absence
 * (full day available) rather than throwing (D-19).
 */
export function availableMinutes(absenceMinutesForDay: number): number {
  return Math.max(0, TARGET_MINUTES - safeMinutes(absenceMinutesForDay));
}

/**
 * Sum booking minutes, split into confirmed vs tentative (CAP-02 / D-04 / D-05).
 * Confirmed and tentative are NEVER mixed — the open-gap math uses confirmed only.
 * Non-finite booking minutes are coerced to 0 (D-19).
 */
export function bookedMinutes(bookings: ReadonlyArray<Booking>): {
  confirmed: number;
  tentative: number;
} {
  let confirmed = 0;
  let tentative = 0;
  for (const b of bookings) {
    const minutes = safeMinutes(b.minutes);
    if (b.isTentative) tentative += minutes;
    else confirmed += minutes;
  }
  return { confirmed, tentative };
}

/**
 * Classify the day and compute open minutes from CONFIRMED bookings only (D-04).
 *
 * Ordering is significant (RESEARCH Pattern 5):
 *  1. available === 0          -> "off"         (D-01; open is 0, no available hours)
 *  2. confirmed > available    -> "overbooked"  (D-06; openMin stays negative, unclamped)
 *  3. open > 0                 -> "underbooked" (D-03 any gap; D-17 zero-bookings)
 *  4. otherwise                -> "ok"          (confirmed exactly fills available)
 */
export function classifyDay(
  availableMin: number,
  confirmedMin: number,
): { status: DayStatus; openMin: number } {
  const openMin = availableMin - confirmedMin; // confirmed only (D-04)
  let status: DayStatus;
  if (availableMin === 0)
    status = "off"; // D-01 — mentioned, not flagged
  else if (confirmedMin > availableMin)
    status = "overbooked"; // D-06 — no clamping
  else if (openMin > 0)
    status = "underbooked"; // D-03 any gap; D-17 zero-bookings
  else status = "ok"; // confirmed === available
  return { status, openMin };
}

/**
 * Compose available / booked / classification into the full per-designer result.
 *
 * `*Min` fields are exact; `*Hours` are the display-only 0.25h-rounded figures
 * derived as `roundToQuarterHour(minutesToHours(min))` — rounding happens ONLY
 * here at the surfaced edge, never before arithmetic (D-16 / RESEARCH Pitfall 3).
 * `shaky` is `tentativeMin > 0`, orthogonal to `status` (D-05).
 */
export function computeDesignerDay(
  designerId: DesignerId,
  bookings: ReadonlyArray<Booking>,
  absenceMinutesForDay: number,
): DesignerResult {
  const availableMin = availableMinutes(absenceMinutesForDay);
  const { confirmed: confirmedMin, tentative: tentativeMin } = bookedMinutes(bookings);
  const { status, openMin } = classifyDay(availableMin, confirmedMin);

  return {
    designerId,
    availableMin,
    confirmedMin,
    tentativeMin,
    openMin,
    status,
    shaky: tentativeMin > 0,
    availableHours: roundToQuarterHour(minutesToHours(availableMin)),
    bookedHours: roundToQuarterHour(minutesToHours(confirmedMin)),
    openHours: roundToQuarterHour(minutesToHours(openMin)),
  };
}
