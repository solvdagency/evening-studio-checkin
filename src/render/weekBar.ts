/**
 * The week-bar footer formatter (D-23) — a display-only fuel gauge.
 *
 * Mirrors round.ts's posture: a small pure formatter whose output is display-only
 * and never re-enters arithmetic. It is the ONE documented exception to the
 * no-recompute rule: the dot COUNT is derived from the exact `rollup.*Min` values
 * (`filled = round(bookedMin / totalMin * 10)`, `bookedMin = totalMin - openMin`),
 * because a 10-dot proportional gauge needs the exact ratio. This is display-only
 * (it produces glyphs, never a figure shown as hours). The CAPTION, by contrast,
 * uses the already-rounded `rollup.*Hours` — no new rounding is introduced.
 *
 * Output (RESEARCH Pattern 3): line 1 = dot run (filled `●` default ink, empty `●`
 * wrapped in the open-dots grey); line 2 = greyed caption "{X}h booked · {Y}h open".
 */

import type { StudioRollup } from "../domain/report.ts";
import type { TextParagraph } from "./cards.ts";
import { BRAND_COLORS } from "../config.ts";

/** Fixed gauge width (D-23, planner decision: fixed 10 dots, proportional fill). */
const DOT_COUNT = 10;
const DOT = "●";

/** Caption hours: whole numbers render with no decimals (mockup "12h"), else 1dp. */
function captionHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/**
 * Build the two week-bar paragraphs from the rollup. `filled` is clamped to
 * [0, DOT_COUNT] for safety (an overbooked week can't exceed the gauge). When there
 * are zero empty dots the open-dots `<font>` wrapper is omitted entirely.
 */
export function buildWeekBar(rollup: StudioRollup): TextParagraph[] {
  const bookedMin = rollup.totalMin - rollup.openMin;
  const ratio = rollup.totalMin > 0 ? bookedMin / rollup.totalMin : 0;
  const filled = Math.min(DOT_COUNT, Math.max(0, Math.round(ratio * DOT_COUNT)));
  const empty = DOT_COUNT - filled;

  const filledRun = DOT.repeat(filled);
  const emptyRun = empty > 0 ? `<font color="${BRAND_COLORS.openDots}">${DOT.repeat(empty)}</font>` : "";

  const bookedHours = captionHours(rollup.totalHours - rollup.openHours);
  const openHours = captionHours(rollup.openHours);

  return [
    { text: `${filledRun}${emptyRun}` },
    { text: `<font color="${BRAND_COLORS.muted}">${bookedHours}h booked · ${openHours}h open</font>` },
  ];
}
