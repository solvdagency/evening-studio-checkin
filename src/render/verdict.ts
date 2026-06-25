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

/** Number words for the working-designer count (roster is 3; extra slots are harmless). */
const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five"] as const;

/** First name only — the status line names people informally ("Anisha", not "Anisha Gittins"). */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Join names as "A", "A and B", or "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The clean-night status line (D-17 / UI-SPEC table) — now scenario-adaptive so it
 * counts who is ACTUALLY working, not the fixed roster of three.
 *
 * Only the CLEAN card calls this (no underbooked/overbooked/brief/missing — see
 * isBusy), so every designer here is either "ok" (working, fully booked) or "off"
 * (booked full-day leave OR a routine non-working day — both classify "off"). The
 * old hardcoded "Three designers fully booked." over-counted whenever anyone was
 * off (sick, or e.g. Anisha's regular Wed/Fri off-day). We count the working
 * designers and NAME the off ones instead — "Two designers fully booked — Anisha's
 * off." When nobody is off the output is byte-identical to the old constant
 * ("Three designers fully booked. Nothing to action."), so the clean fixture is
 * unchanged. Pure; never throws; names come from config via ctx.designerNames.
 */
export function buildCleanStatusLine(report: StudioReport, ctx: RenderContext): string {
  const working = report.designers.filter((d) => d.status !== "off");
  const off = report.designers.filter((d) => d.status === "off");

  // Everyone off on a working day (rare — usually already a holiday/closure/weekend):
  // there is no count to state, so a plain note rather than "No designers fully booked."
  if (working.length === 0) {
    return "No one's in tomorrow. Nothing to action.";
  }

  const countWord = COUNT_WORDS[working.length] ?? String(working.length);
  const noun = working.length === 1 ? "designer" : "designers";
  let line = `${countWord} ${noun} fully booked`;

  if (off.length > 0) {
    const names = off.map((d) => firstName(ctx.designerNames[d.designerId] ?? ""));
    line += off.length === 1 ? ` — ${names[0]}'s off` : ` — ${joinNames(names)} off`;
  }

  return `${line}. Nothing to action.`;
}
