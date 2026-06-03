/**
 * Variant selection — the presentation-layer twin of capacity.ts `classifyDay`.
 *
 * An ordered if/else cascade (ordering is SIGNIFICANT and documented, like
 * classifyDay) returning which top-level card variant to render. Pure: no I/O, no
 * throw on well-formed input. holiday/closure beat degraded; `missingDesigners` is
 * NOT a top-level variant (it renders a 🤖 row inside the normal card, RESEARCH
 * line 365). This plan (03-01) implements only the `"card"` path; the holiday /
 * closure / degraded variants are owned by plan 03-02.
 */

import type { StudioReport } from "../domain/report.ts";
import type { RenderContext } from "./cards.ts";

/** The four top-level card variants (RESEARCH Code Examples lines 357–363). */
export type Variant = "holiday" | "closure" | "degraded" | "card";

/**
 * Select the variant in significant order (D-20 → D-21 → D-18 → default card):
 *  1. holidayTomorrow  -> "holiday"  (D-20) — short warm message, no rows
 *  2. closureTomorrow  -> "closure"  (D-21) — offsite message, no rows
 *  3. sourceErrors     -> "degraded" (D-18) — 🤖 couldn't-reach, still posts
 *  4. otherwise        -> "card"     — clean (no rows) or busy (rows), by severity
 */
export function selectVariant(report: StudioReport, ctx: RenderContext): Variant {
  if (ctx.holidayTomorrow) return "holiday"; // D-20
  if (ctx.closureTomorrow) return "closure"; // D-21
  if (ctx.sourceErrors.length > 0) return "degraded"; // D-18
  return "card";
}

/**
 * Clean vs busy decision for the `"card"` variant (D-17 / MSG-05). Clean ⇒ no
 * designer is underbooked/overbooked AND there are no brief flags ⇒ omit the rows
 * section, render only the positive verdict + status line + button + week bar.
 * Busy ⇒ full per-designer rows. Leave drives a row but NEVER this decision via the
 * verdict (D-13); an "off"/"ok" day with no flags stays clean.
 */
export function isBusy(report: StudioReport, ctx: RenderContext): boolean {
  return (
    report.designers.some((d) => d.status === "underbooked" || d.status === "overbooked") ||
    ctx.briefFlags.length > 0
  );
}
