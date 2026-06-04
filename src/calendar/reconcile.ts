/**
 * Same-day same-client meeting reconciler (Phase 4, plan 04-03 — MEET-03, the
 * input to MEET-04's card line). The deterministic heart of Phase 4.
 *
 * Given each designer's COUNTING meetings (the mechanical filters in filter.ts
 * have already dropped declined / all-day / OOO / solo / after-hours / overhead),
 * plus that designer's set of booked-client company ids for the SAME target day
 * (plan 01's `bookedClientsByDesignerDay`), plus the committed alias map, produce
 * a per-designer "worth a look" list: counting meetings whose client is NOT
 * booked that day. Biased HARD against false positives (D-04).
 *
 * Trust boundary (CLAUDE.md / threat T-04-08): this module imports NOTHING from
 * src/domain and never touches capacity arithmetic. It recomputes NO hours, reads
 * NO system clock, makes NO network call — it reads only the pre-resolved
 * `Set<companyId>` + the committed alias map + the already-filtered events. Mirrors
 * the pure, pre-resolved-inputs style of src/productive/brief.ts `assessBriefs`.
 *
 * Bias-to-silence (D-04 — the prime directive), enforced at every uncertain step:
 *  - title in the overhead ignore-list → never reconciled (filter.ts, BEFORE alias
 *    resolution, so "travel time, stevedores" never resolves to the Stevedores
 *    client).
 *  - title matches NO alias → null → stay quiet (treat as covered).
 *  - title confidently matches TWO different companies → null → stay quiet.
 *  - matched & the company is booked that same day → covered (D-01/D-02).
 */

import type { DesignerId } from "../domain/types.ts";
import type { ClientAlias } from "../config.ts";
import type { FilteredEvent } from "./gather.ts";
import { isCountingMeeting } from "./filter.ts";

/**
 * One surfaced "worth a look" meeting for a designer. Rendered by plan 04 as the
 * 📅 sub-line (D-14): `📅 {title} · {start} · worth a look`, the title deep-linking
 * to the calendar event (MSG-06). Carries no hours and no client assertion — a
 * soft nudge only.
 */
export interface WorthALookItem {
  /** The meeting title (the event summary). */
  title: string;
  /** The studio-zone start label from gatherCalendar (e.g. "9:45am"). */
  start: string;
  /** The calendar deep-link (htmlLink) for MSG-06. */
  link: string;
}

/**
 * Resolve a meeting title to AT MOST ONE client (D-03), or null when uncertain.
 *
 * Algorithm: case-insensitive substring of any alias in the title; longest alias
 * first so a specific alias ("FDC Construction") is preferred over a short one
 * ("FDC") and "Stream Hill" never loses to a stray substring. The FIRST company
 * that matches wins — UNLESS a DIFFERENT company also matches the title, in which
 * case the match is ambiguous and we return null (bias to silence, D-04). A title
 * that matches no alias returns null.
 *
 * The alias map is kept narrow by config (no bare "Solvd"/"Thirdi"; "Streem" and
 * "Stream Hill" are distinct), so a single confident company is the normal path;
 * the double-match guard is the safety net for genuinely ambiguous titles.
 */
export function matchTitleToClient(
  title: string,
  aliasMap: readonly ClientAlias[],
): ClientAlias | null {
  const lower = title.toLowerCase();

  // Flatten to (alias, client) pairs and try longest aliases first so the most
  // specific phrase wins and short aliases can't pre-empt a longer one.
  const pairs: Array<{ alias: string; client: ClientAlias }> = [];
  for (const client of aliasMap) {
    for (const alias of client.aliases) {
      pairs.push({ alias, client });
    }
  }
  pairs.sort((a, b) => b.alias.length - a.alias.length);

  let matched: ClientAlias | null = null;
  for (const { alias, client } of pairs) {
    if (!lower.includes(alias.toLowerCase())) continue;
    if (matched === null) {
      matched = client; // first confident hit
    } else if (matched.companyId !== client.companyId) {
      return null; // a SECOND, different company also matches → ambiguous (D-04)
    }
    // same company matching via another alias → keep the first; not ambiguous.
  }
  return matched;
}

/**
 * Reconcile each designer's counting meetings against their same-day booked-client
 * set → a per-designer `WorthALookItem[]`. Pure; never throws; reads no hours, no
 * clock, no network.
 *
 * For each designer key in `eventsByDesigner`:
 *   for each event that `isCountingMeeting` (overhead/declined/etc. dropped first):
 *     match the title to a client → null (uncertain/ambiguous) → skip (D-04);
 *     matched & the designer's target-day booked set has the company → skip
 *       (covered same-day, D-01/D-02);
 *     else push { title, start, link }.
 * Every input designer gets an entry (possibly empty). A designer absent from
 * `bookedClientsByDesignerDay` is treated as having no bookings (so a matched
 * meeting flags) — the gather step initialises every assessed designer to an
 * empty Set, so this only fires for a fully-degraded pull.
 */
export function reconcileMeetings(
  eventsByDesigner: Record<DesignerId, FilteredEvent[]>,
  bookedClientsByDesignerDay: Record<DesignerId, Set<string>>,
  aliasMap: readonly ClientAlias[],
  _ignoreList: readonly string[],
): Record<DesignerId, WorthALookItem[]> {
  const out: Record<DesignerId, WorthALookItem[]> = {};

  for (const [designerId, events] of Object.entries(eventsByDesigner)) {
    const id = designerId as DesignerId;
    const worthALook: WorthALookItem[] = [];
    const bookedToday = bookedClientsByDesignerDay[id] ?? new Set<string>();

    for (const event of events) {
      // Mechanical filters first — overhead/declined/all-day/OOO/solo/after-hours
      // never reach alias matching (ignore-list applied BEFORE alias resolution).
      if (!isCountingMeeting(event)) continue;

      const client = matchTitleToClient(event.summary, aliasMap);
      if (client === null) continue; // uncertain/ambiguous → stay quiet (D-04)
      if (bookedToday.has(client.companyId)) continue; // covered same-day (D-01/D-02)

      worthALook.push({
        title: event.summary,
        start: event.startLabel,
        link: event.htmlLink,
      });
    }

    out[id] = worthALook;
  }

  return out;
}
