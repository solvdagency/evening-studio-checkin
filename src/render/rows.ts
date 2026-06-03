/**
 * Per-designer `decoratedText` row builder (D-09 — the load-bearing rule).
 *
 * Mirrors capacity.ts `computeDesignerDay`: maps ONE DesignerResult (+ its brief
 * flags + tentative note) to ONE decoratedText widget. ALL text lives in the single
 * `text` field, lines separated by `<br>` (D-09) — NEVER topLabel/bottomLabel
 * (RESEARCH Pitfall 2). Hierarchy is expressed by colour (`<font color>`) and weight
 * (`<b>`), never by size.
 *
 * TRUST RULE: reads only the display-only `*Hours` fields (openHours / bookedHours /
 * availableHours) and the pre-rounded ctx tentative hours — it NEVER reads `*Min`
 * and never recomputes a figure (CLAUDE.md). Pure; never throws.
 *
 * SECURITY (T-03-01 / V5): every dynamic string (designer name, client name, job
 * code) is HTML-escaped before insertion so a stray `&`/`<`/`>` cannot break a row.
 */

import type { DesignerResult } from "../domain/capacity.ts";
import type { BriefFlag } from "../productive/brief.ts";
import type { DecoratedText, TentativeNote } from "./cards.ts";
import { BRAND_COLORS } from "../config.ts";

/** HTML-escape the Cards-v2 HTML-subset specials (`&` first). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Display hours with a forced single decimal — "7.5", "3.0" (matches the mockup). */
function oneDecimal(hours: number): string {
  return hours.toFixed(1);
}

/** A greyed run of text in the muted colour (#5f6368). */
function muted(text: string): string {
  return `<font color="${BRAND_COLORS.muted}">${text}</font>`;
}

/** Locked BriefFlag.reason → display label (D-16). */
const BRIEF_LABEL: Record<BriefFlag["reason"], string> = {
  "no-task": "No brief",
  "blank-brief": "Brief empty",
  "not-briefed": "Not briefed",
};

/**
 * Line 1: `{emoji} <b>{name}</b> — <font color="{stateHex}">{statusText}</font>`.
 * Status carries state via emoji + colour + words (never colour alone, D-10 / a11y):
 *  - underbooked → 🔴 red   "{X.X}h open"
 *  - overbooked  → 🟠 amber "{X.X}h over"
 *  - off         → ⚪ (muted) "on leave"   (minimal, D-22)
 *  - ok          → 🟢 green "full day"
 */
function statusLine(d: DesignerResult, escapedName: string): string {
  const name = `<b>${escapedName}</b>`;
  if (d.status === "underbooked") {
    return `🔴 ${name} — <font color="${BRAND_COLORS.open}">${oneDecimal(d.openHours)}h open</font>`;
  }
  if (d.status === "overbooked") {
    return `🟠 ${name} — <font color="${BRAND_COLORS.over}">${oneDecimal(Math.abs(d.openHours))}h over</font>`;
  }
  if (d.status === "off") {
    return `⚪ ${name} — ${muted("on leave")}`;
  }
  return `🟢 ${name} — <font color="${BRAND_COLORS.full}">full day</font>`;
}

/** Line 2 (greyed): `Nothing booked` when 0, else `{X.X}h booked`. */
function bookedLine(d: DesignerResult): string {
  return d.bookedHours === 0 ? muted("Nothing booked") : muted(`${oneDecimal(d.bookedHours)}h booked`);
}

/**
 * Build the single decoratedText row for one designer. Lines, in order:
 *   1. status line (emoji + bold name + coloured status)
 *   2. greyed booked detail (omitted only for an on-leave "off" day — D-22 minimal)
 *   3. ⚠️ tentative line if a tentative note exists (D-14/D-15, additive, NO job code)
 *   4. 📄 brief line(s) for each brief flag on this designer (D-16, CODE + hours)
 */
export function buildRow(
  d: DesignerResult,
  ctx: {
    designerNames: Record<string, string>;
    briefFlags: BriefFlag[];
    tentativeNotes: Record<string, TentativeNote>;
  },
): { decoratedText: DecoratedText } {
  const escapedName = escapeHtml(ctx.designerNames[d.designerId] ?? String(d.designerId));
  const lines: string[] = [statusLine(d, escapedName)];

  // On-leave "off" day stays minimal (D-22): status line only, no booked detail.
  if (d.status !== "off") {
    lines.push(bookedLine(d));
  }

  // ⚠️ tentative (on top) — additive, never folded into booked/open (D-15 / MSG-07).
  const tentative = ctx.tentativeNotes[d.designerId];
  if (tentative) {
    lines.push(
      `⚠️ ${oneDecimal(tentative.tentativeHours)}h tentative (on top) · ${muted(escapeHtml(tentative.client))}`,
    );
  }

  // 📄 brief line(s) for this designer's flags (D-16): label · CODE · {X}h.
  for (const flag of ctx.briefFlags) {
    if (flag.designerId !== d.designerId) continue;
    const label = BRIEF_LABEL[flag.reason];
    const code = escapeHtml(flag.jobLabel);
    lines.push(`📄 ${label} · ${muted(`${code} · ${oneDecimal(d.bookedHours)}h`)}`);
  }

  return { decoratedText: { text: lines.join("<br>"), wrapText: true } };
}
