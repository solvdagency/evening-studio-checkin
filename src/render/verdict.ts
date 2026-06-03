/**
 * The nameless, scenario-adaptive verdict line (D-12 / D-13).
 *
 * Mirrors capacity.ts `classifyDay`: an ordered cascade mapping the studio
 * situation (counts of underbooked / overbooked designers + brief-flag count) to a
 * LOCKED verdict string from the UI-SPEC verdict table. Pure; never throws.
 *
 * HARD RULE (D-12): the verdict NEVER names a person — names appear only in rows.
 * Leave NEVER drives the verdict (D-13 final bullet): an "off" day with the rest
 * fine resolves to "All sorted for tomorrow." (off is neither underbooked nor
 * overbooked, so it never enters the counts below).
 */

import type { StudioReport } from "../domain/report.ts";
import type { RenderContext } from "./cards.ts";

/**
 * Return the locked nameless verdict for the studio's situation. Order is
 * significant and matches the UI-SPEC verdict table (lines 150–161):
 *  - could-read-only-one (one designer missing) → "I could only read one designer…"
 *  - mixed (both under AND over present)         → "A couple of things to sort…"
 *  - any overbooked (and none under)             → one over / all over
 *  - any underbooked                             → one / two / all open
 *  - briefs only (no under/over, flags present)  → "Everyone's booked — but N…"
 *  - otherwise (clean)                           → "All sorted for tomorrow."
 */
export function buildVerdict(report: StudioReport, ctx: RenderContext): string {
  const total = report.designers.length;
  const underbooked = report.designers.filter((d) => d.status === "underbooked").length;
  const overbooked = report.designers.filter((d) => d.status === "overbooked").length;
  const briefCount = ctx.briefFlags.length;

  // D-19 — one or two designers were unreadable tonight (nameless; keyed off the
  // count of missing designers, per UI-SPEC line 161 / plan 03-02 Task 1). The
  // verdict counts the MISSING designers: 1 → "one designer", 2 → "two designers".
  if (report.missingDesigners.length > 0) {
    const word = report.missingDesigners.length === 1 ? "one designer" : "two designers";
    return `I could only read ${word} tonight.`;
  }

  // Mixed — both an open gap and an overbook to sort.
  if (underbooked > 0 && overbooked > 0) {
    return "A couple of things to sort tomorrow.";
  }

  // Overbooked only.
  if (overbooked > 0) {
    return overbooked >= total
      ? "The whole studio's overbooked tomorrow."
      : "One designer's a bit over tomorrow.";
  }

  // Underbooked / open time.
  if (underbooked > 0) {
    if (underbooked >= total) return "The whole studio's light tomorrow.";
    if (underbooked === 2) return "Two designers have open time tomorrow.";
    return "One designer has a bit of open time tomorrow.";
  }

  // Everyone booked, but briefs still need finishing.
  if (briefCount > 0) {
    const noun = briefCount === 1 ? "brief needs" : "briefs need";
    return `Everyone's booked — but ${briefCount} ${noun} finishing.`;
  }

  // Clean night (D-17).
  return "All sorted for tomorrow.";
}

/** The locked clean-night status line (verbatim, D-17 / UI-SPEC table). */
export const CLEAN_STATUS_LINE = "Three designers fully booked. Nothing to action.";
