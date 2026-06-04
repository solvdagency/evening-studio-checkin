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
import { humanizeDuration } from "../calendar/duration.ts";

/** HTML-escape the Cards-v2 HTML-subset specials (`&` first). */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    return `⚪ ${name} — ${muted("on leave / Full day off.")}`;
  }
  return `🟢 ${name} — <font color="${BRAND_COLORS.full}">full day</font>`;
}

/** Line 2 (greyed): `Nothing booked` when 0, else `{X.X}h booked`. */
function bookedLine(d: DesignerResult): string {
  return d.bookedHours === 0
    ? muted("Nothing booked")
    : muted(`${oneDecimal(d.bookedHours)}h booked`);
}

/**
 * Build the minimal 🤖 "couldn't read" row for a designer the data pull did NOT
 * cover (D-19). We never fake an empty/zero figure — the row says only that the
 * person was unreadable this run. Uses the open/degraded red so it reads as a thing
 * to notice, not a settled state. The verdict stays nameless (verdict.ts).
 */
function missingDesignerRow(escapedName: string): { decoratedText: DecoratedText } {
  return {
    decoratedText: {
      text: `🤖 <b>${escapedName}</b> — <font color="${BRAND_COLORS.open}">couldn't read</font>`,
      wrapText: true,
    },
  };
}

/**
 * Build the single decoratedText row for one designer. Lines, in order:
 *   1. status line (emoji + bold name + coloured status)
 *   2. greyed booked detail (omitted only for an on-leave "off" day — D-22 minimal)
 *   3. ⚠️ tentative line if a tentative note exists (D-14/D-15, additive, NO job code)
 *   4. 📄 brief line(s) for each brief flag on this designer (D-16, CODE + hours)
 *   5. 📅 unaccounted-meeting line(s): plain muted `📅 {title} · {duration}, not
 *      in Productive` (D-14 / MEET-04 — overrides MSG-06 deep-link per pilot feedback)
 *
 * A designer in `missingDesigners` (D-19) short-circuits to the minimal 🤖 row —
 * its figures are untrusted this run and are never shown.
 */
export function buildRow(
  d: DesignerResult,
  ctx: {
    designerNames: Record<string, string>;
    briefFlags: BriefFlag[];
    tentativeNotes: Record<string, TentativeNote>;
    leaveNotes?: Record<string, string>;
    missingDesigners?: ReadonlyArray<DesignerResult["designerId"]>;
    worthALook?: Record<string, Array<{ title: string; durationMinutes?: number }>>;
  },
): { decoratedText: DecoratedText } {
  const escapedName = escapeHtml(ctx.designerNames[d.designerId] ?? String(d.designerId));

  // 🤖 couldn't-read row (D-19) — never fake a figure for an unread designer.
  if (ctx.missingDesigners?.includes(d.designerId)) {
    return missingDesignerRow(escapedName);
  }

  const lines: string[] = [statusLine(d, escapedName)];

  // On-leave "off" day stays minimal (D-22): the locked "/ Full day off." line and
  // nothing more — no booked detail, no flags.
  if (d.status === "off") {
    return { decoratedText: { text: lines.join("<br>"), wrapText: true } };
  }

  lines.push(bookedLine(d));

  // Half-day / partial leave (D-22): a normal availability row PLUS a greyed leave
  // note carried in RenderContext (Open Item 2) — the domain stays untouched.
  const leaveNote = ctx.leaveNotes?.[d.designerId];
  if (leaveNote) {
    lines.push(muted(escapeHtml(leaveNote)));
  }

  // ⚠️ tentative (on top) — additive, never folded into booked/open (D-15 / MSG-07).
  // The client/job suffix is optional: when the per-designer tentative detail isn't
  // available (the current pull doesn't surface it), show the hours alone rather than
  // hiding the tentative time entirely (live-corrected 2026-06-04 — a designer with
  // only tentative work was misreading as fully open).
  const tentative = ctx.tentativeNotes[d.designerId];
  if (tentative) {
    const client = tentative.client ? ` · ${muted(escapeHtml(tentative.client))}` : "";
    lines.push(`⚠️ ${oneDecimal(tentative.tentativeHours)}h tentative (on top)${client}`);
  }

  // 📄 brief line(s) for this designer's flags (D-16): label · CODE · {X}h.
  for (const flag of ctx.briefFlags) {
    if (flag.designerId !== d.designerId) continue;
    const label = BRIEF_LABEL[flag.reason];
    const code = escapeHtml(flag.jobLabel);
    lines.push(`📄 ${label} · ${muted(`${code} · ${oneDecimal(d.bookedHours)}h`)}`);
  }

  // 📅 unaccounted-meeting line(s) (D-14 / MEET-04): a counting meeting whose
  // client isn't booked that day. PLAIN muted text, no deep link —
  // `📅 {title} · {duration}, not in Productive` (overrides MSG-06 / the "worth a
  // look" wording per Liam's pilot feedback). Soft nudge, never an asserted clash
  // (D-04). The title is escaped (threat T-04-11); the duration is humanizeDuration
  // output. When durationMinutes is missing the duration segment is omitted — never
  // "undefined"/"NaN".
  for (const m of ctx.worthALook?.[d.designerId] ?? []) {
    const title = muted(escapeHtml(m.title));
    const tail = muted("not in Productive");
    if (typeof m.durationMinutes === "number" && Number.isFinite(m.durationMinutes)) {
      lines.push(`📅 ${title} · ${muted(humanizeDuration(m.durationMinutes))}, ${tail}`);
    } else {
      lines.push(`📅 ${title}, ${tail}`);
    }
  }

  return { decoratedText: { text: lines.join("<br>"), wrapText: true } };
}
