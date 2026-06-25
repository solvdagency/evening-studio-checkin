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
import type { ClientAlias, ActiveClient } from "../config.ts";
import type { FilteredEvent } from "./gather.ts";
import { isCountingMeeting } from "./filter.ts";

/**
 * One surfaced "worth a look" meeting for a designer. Rendered as the 📅 sub-line:
 * `📅 {title} · {duration}, not in Productive` — PLAIN muted text, no deep link.
 * Carries no hours and no client assertion — a soft nudge only.
 *
 * This shape OVERRIDES the earlier MSG-06 "deep-linked title" decision (no htmlLink
 * anymore) and changes the D-14 sub-line wording (duration + "not in Productive",
 * not start time + "worth a look") — per Liam's direct pilot feedback.
 */
export interface WorthALookItem {
  /** The meeting title (the event summary). */
  title: string;
  /** Meeting length in minutes (presentation-only). Undefined → duration segment omitted. */
  durationMinutes?: number;
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

/** Trailing legal / geographic suffix words stripped from a company name (longest-first per pass). */
const COMPANY_SUFFIX =
  /[\s,]+(?:pty|ltd|limited|corporation|corp|inc|incorporated|group|co|trust|holdings|australia)\.?$/i;

/**
 * Reduce a Productive company name to its distinctive core for whole-phrase matching:
 * drop a trailing parenthetical ("(SITE)", "(Rural Press)") and any trailing legal /
 * geographic suffix words ("Pty Ltd", "Corporation", "Australia", …), repeatedly. So
 * "Hunter Water Corporation" → "Hunter Water", "Stream Hill Pty Ltd" → "Stream Hill",
 * "Yancoal Australia Ltd" → "Yancoal". Pure; trims + collapses whitespace.
 */
export function deSuffixCompanyName(name: string): string {
  let s = name.trim().replace(/\s*\([^)]*\)\s*$/, "");
  let prev: string;
  do {
    prev = s;
    s = s.replace(COMPANY_SUFFIX, "");
  } while (s !== prev);
  return s.replace(/\s+/g, " ").trim();
}

/** Escape a string for use as a literal inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True ⟺ `needle` (a multi-token phrase) appears in `hay` as WHOLE words — bounded
 * by non-alphanumeric edges, with flexible internal whitespace. This is the
 * precision-first rule for the dynamic active-client list: "Hunter Water" matches
 * "Hunter Water — logo round 2" but the client "Domain" never matches "domain
 * renewal" mid-word, and a short fragment can't pre-empt a real word.
 */
function wholePhraseMatch(hayLower: string, needleLower: string): boolean {
  if (needleLower.length === 0) return false;
  const tokens = needleLower.split(/\s+/).map(escapeRe);
  const pattern = `(?<![a-z0-9])${tokens.join("\\s+")}(?![a-z0-9])`;
  return new RegExp(pattern, "i").test(hayLower);
}

/**
 * Match a meeting title against the LIVE active-client list (D-04 bias-to-silence).
 * Each client's de-suffixed name must appear as a WHOLE phrase (wholePhraseMatch).
 * A de-suffixed core under 4 chars is skipped (too short/ambiguous — the curated
 * CLIENT_ALIAS_MAP owns the safe short aliases like HW/SH). If two DIFFERENT
 * companies match → ambiguous → null (stay quiet). Returns a ClientAlias-shaped
 * result so it composes with `matchTitleToClient`.
 */
export function matchActiveClient(
  title: string,
  activeClients: readonly ActiveClient[],
): ClientAlias | null {
  const lower = title.toLowerCase();
  let matched: ActiveClient | null = null;
  for (const c of activeClients) {
    const core = deSuffixCompanyName(c.companyName);
    if (core.length < 4) continue; // too short → leave to the curated map
    if (!wholePhraseMatch(lower, core.toLowerCase())) continue;
    if (matched === null) matched = c;
    else if (matched.companyId !== c.companyId) return null; // two companies → ambiguous (D-04)
  }
  return matched === null
    ? null
    : { companyId: matched.companyId, companyName: matched.companyName, aliases: [] };
}

/**
 * Combine the curated-alias match (substring) with the live active-client match
 * (whole-phrase). Agreement or a single source wins; a genuine DISAGREEMENT (two
 * different companies) is ambiguous → null (bias to silence, D-04).
 */
function combineMatches(
  curated: ClientAlias | null,
  dynamic: ClientAlias | null,
): ClientAlias | null {
  if (curated !== null && dynamic !== null) {
    return curated.companyId === dynamic.companyId ? curated : null;
  }
  return curated ?? dynamic;
}

/** Normalize for the "needs own booking" comparison: lowercase, strip non-alphanumerics. */
function normForOwnBooking(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Return the first "needs own booking" phrase the title contains (normalized,
 * punctuation-insensitive), else null. e.g. "Problem/SOLVD Fortnightly Team
 * Meeting" → "Problem/SOLVD".
 */
function matchOwnBookingPhrase(title: string, phrases: readonly string[]): string | null {
  const t = normForOwnBooking(title);
  for (const p of phrases) {
    const np = normForOwnBooking(p);
    if (np.length > 0 && t.includes(np)) return p;
  }
  return null;
}

/**
 * Optional inputs that widen / tighten reconciliation beyond the curated alias map
 * (Liam pilot feedback 2026-06-25). All default to inert, so a 4-arg call (the 42
 * existing tests) behaves EXACTLY as before.
 */
export interface ReconcileOptions {
  /** Live active-client companies (Productive). Whole-name matched, de-suffixed. Default []. */
  activeClients?: readonly ActiveClient[];
  /**
   * Per-designer target-day booked task/service labels — the coverage signal for the
   * `ownBookingPhrases` rule below. Default {} (nothing booked → those meetings flag).
   */
  bookedLabelsByDesignerDay?: Record<DesignerId, readonly string[]>;
  /**
   * Meeting-title phrases that require their OWN same-named booking, not mere company
   * coverage (config.MEETINGS_NEEDING_OWN_BOOKING, e.g. "Problem/SOLVD"). Default [].
   */
  ownBookingPhrases?: readonly string[];
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
 *     else push { title, durationMinutes }.
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
  opts?: ReconcileOptions,
): Record<DesignerId, WorthALookItem[]> {
  const activeClients = opts?.activeClients ?? [];
  const bookedLabelsByDesignerDay = opts?.bookedLabelsByDesignerDay ?? {};
  const ownBookingPhrases = opts?.ownBookingPhrases ?? [];
  const out: Record<DesignerId, WorthALookItem[]> = {};

  for (const [designerId, events] of Object.entries(eventsByDesigner)) {
    const id = designerId as DesignerId;
    const worthALook: WorthALookItem[] = [];
    const bookedToday = bookedClientsByDesignerDay[id] ?? new Set<string>();
    const labelsToday = bookedLabelsByDesignerDay[id] ?? [];

    for (const event of events) {
      // Mechanical filters first — overhead/declined/all-day/OOO/solo/after-hours
      // never reach alias matching (ignore-list applied BEFORE alias resolution).
      if (!isCountingMeeting(event)) continue;

      // NARROW "needs its own booking" rule (Problem/SOLVD): generic standing/company
      // time does NOT cover these — only a booking whose LABEL matches the meeting
      // does. So a "Problem Solvd" booking covers it; "Liam time" never does. This
      // intercepts BEFORE the company-coverage path so it can't be masked by any
      // same-company booking (the live miss this fixes).
      const ownPhrase = matchOwnBookingPhrase(event.summary, ownBookingPhrases);
      if (ownPhrase !== null) {
        const needle = normForOwnBooking(ownPhrase);
        const covered = labelsToday.some((l) => normForOwnBooking(l).includes(needle));
        if (!covered) {
          worthALook.push({ title: event.summary, durationMinutes: event.durationMinutes });
        }
        continue; // handled — never falls through to company-level coverage
      }

      // Match the title to a client: the curated alias map (substring, the safe short
      // aliases) UNION the live active-client list (whole-phrase). Disagreement or no
      // confident match → stay quiet (D-04).
      const client = combineMatches(
        matchTitleToClient(event.summary, aliasMap),
        matchActiveClient(event.summary, activeClients),
      );
      if (client === null) continue; // uncertain/ambiguous → stay quiet (D-04)
      if (bookedToday.has(client.companyId)) continue; // covered same-day (D-01/D-02)

      worthALook.push({
        title: event.summary,
        durationMinutes: event.durationMinutes,
      });
    }

    out[id] = worthALook;
  }

  return out;
}
