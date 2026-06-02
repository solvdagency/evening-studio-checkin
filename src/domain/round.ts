/**
 * Quarter-hour rounding helper — the single source of truth for hour rounding.
 *
 * ROUNDING MODE: round-half-up at 0.25h granularity. DISPLAY-ONLY.
 *
 * The rounded value is NEVER fed back into arithmetic (D-15 / D-16): all capacity
 * math stays in exact integer minutes, and only the surfaced figure is rounded.
 * Rationale for round-half-up (over round-half-even): it is the simplest mode to
 * explain to a non-engineer reading the check-in ("6.375h shows as 6.5"), it
 * matches the human "round up to the next quarter" intuition, and because it is
 * display-only it can never accumulate or corrupt internal precision.
 *
 * Keep this as the ONLY place quarter-hour rounding happens — no inline
 * `Math.round(h * 4) / 4` anywhere else (RESEARCH "Don't Hand-Roll").
 */

/**
 * Convert exact minutes to unrounded decimal hours.
 *
 * This is a plain division with NO rounding — it yields the exact decimal hours
 * (e.g. 384 minutes -> 6.4). Rounding to a display granularity is a separate,
 * explicit step via {@link roundToQuarterHour}.
 */
export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

/**
 * Round decimal hours to the nearest 0.25h, half-up (toward +infinity).
 *
 * The `+ 1e-9` epsilon nudges exact half-quarter cases (e.g. 7.125) up
 * deterministically, sidestepping IEEE-754 representation surprises at the
 * rounding boundary. DISPLAY-ONLY — the result must never re-enter arithmetic.
 */
export function roundToQuarterHour(decimalHours: number): number {
  return Math.round(decimalHours * 4 + 1e-9) / 4;
}
