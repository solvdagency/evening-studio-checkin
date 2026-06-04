/**
 * Non-secret, committed ingestion config for the Productive pull (Phase 2).
 *
 * Trust posture: this file is committed to the repo, so it holds ONLY non-secret
 * runtime config (D-15). The two Productive secrets — `X-Auth-Token` and the
 * `X-Organization-Id` value — are NEVER placed here; the client reads them from
 * `process.env.PRODUCTIVE_AUTH_TOKEN` / `process.env.PRODUCTIVE_ORG_ID`
 * (sourced from GitHub Actions secrets in CI, a gitignored `.env` locally).
 *
 * The Phase-1 domain invariants STUDIO_ZONE and TARGET_MINUTES deliberately stay
 * in src/domain/types.ts (Phase 1 decision) — this module is for ingestion config
 * only. Implements D-13 (NSW holiday region + studio closures) and D-14 (the three
 * monitored designer person IDs + the SOLVD org).
 */

/**
 * Productive JSON:API base URL (no trailing slash). Every request is GET against
 * a path under this base (CLAUDE.md "Item 2"). `[VERIFIED: developer.productive.io]`
 */
export const PRODUCTIVE_BASE_URL = "https://api.productive.io/api/v2" as const;

/**
 * The three monitored designers' Productive person IDs (D-14, confirmed live):
 * Liam Mills 686717, Anisha Gittins 686712, Ella Wright 686716. The two fluid
 * creatives (Dan, Lexie) are intentionally NOT tracked. These IDs are non-secret
 * identifiers, so they live here in committed config rather than in env.
 */
export const DESIGNER_PERSON_IDS = ["686717", "686712", "686716"] as const;

/**
 * Display names for the three monitored designers, keyed by Productive person id
 * (D-14, 03-CONTEXT specifics line 120). The renderer reads names from HERE — the
 * card never shows a name sourced from the API (the API is for figures only). The
 * composition root (src/index.ts) passes this into RenderContext.designerNames.
 */
export const DESIGNER_NAMES = {
  "686717": "Liam Mills",
  "686712": "Anisha Gittins",
  "686716": "Ella Wright",
} as const;

/**
 * Holiday region for the injected HolidaySet (D-13). `date-holidays` is
 * constructed as `new Holidays(country, state)` — AU / NSW for SOLVD's studio.
 * Public holidays come from the library; studio-specific closures are listed
 * separately below.
 */
export const HOLIDAY_REGION = { country: "AU", state: "NSW" } as const;

/**
 * Studio-specific closure days that are NOT public holidays (e.g. a Christmas /
 * New-Year shutdown). Committed "yyyy-MM-dd" date keys, merged into the HolidaySet
 * alongside the NSW public holidays (D-13). Empty for now — add concrete shutdown
 * dates here as they are decided; per-designer time off is handled separately as
 * Productive absence bookings (D-11), not here.
 */
export const STUDIO_CLOSURES: readonly string[] = [];

/**
 * Hosted avatar PNG for the card header (D-04/D-07): the white brand asterisk on a
 * black circle, exported to PNG (SVG support in Cards v2 is unreliable, D-04). The
 * URL MUST be anonymously fetchable by Google's server-side image renderer — a
 * public HTTPS PNG, verified in incognito (RESEARCH Pitfall 4). This is a documented
 * PLACEHOLDER public raw URL; the actual PNG is exported, committed to assets/, and
 * its real public host wired in plan 03-04 (which also confirms public reachability,
 * re-hosting on a public bucket if the repo is private). Hardcoded committed constant,
 * never user-supplied (threat T-03-03 mitigation).
 */
export const AVATAR_PNG_URL =
  "https://raw.githubusercontent.com/solvdagency/evening-studio-checkin/main/assets/avatar-asterisk.png" as const;

/**
 * Deep-link template for the "Open in Productive" CTA (D-24). `{DATE}` is replaced
 * with `report.targetDay` ("yyyy-MM-dd") by the renderer; `filter=NzQ5NTY2` is the
 * design-team scheduling filter (`NzQ5NTY2` = base64 of `749566`, verified live).
 * `34092-solvd-agency` is the SOLVD org slug. The path opens tomorrow's scheduling
 * view grouped by people, scoped to the three monitored designers.
 */
export const PRODUCTIVE_DEEPLINK_TEMPLATE =
  "https://app.productive.io/34092-solvd-agency/scheduling/bookings?date={DATE}&filter=NzQ5NTY2&groupBy=people" as const;

/**
 * The renderer's ENTIRE colour vocabulary — the five locked inline `<font color>`
 * hex values (D-11/D-23). No other colours exist on the card surface: Cards v2
 * forbids background/highlight (D-03) and custom fonts (D-02); brand yellow lives
 * ONLY baked into the avatar PNG, never as card text (yellow-on-white fails WCAG).
 *  - open   : status red — open time ("Xh open") and the 🤖 degraded state.
 *  - full   : status green — full day.
 *  - over   : amber-brown — overbooked only ("Xh over").
 *  - muted  : grey — all greyed detail/flag text (booked/open detail, names, codes).
 *  - openDots: open-dots grey — the EMPTY portion of the week-bar dot run only.
 */
export const BRAND_COLORS = {
  open: "#d93025",
  full: "#188038",
  over: "#b06000",
  muted: "#5f6368",
  openDots: "#c9ccd1",
} as const;

/**
 * Calendar SECRET posture (Phase 4): mirrors the Productive token rule at the top
 * of this file. The Google service-account private-key JSON is a SECRET and is
 * NEVER committed here — `src/calendar/auth.ts` reads it from
 * `process.env.GOOGLE_SA_KEY` (a GitHub Actions secret in CI; a gitignored
 * `.env` / `secrets/` file locally) and `JSON.parse`s it. The key value (and the
 * minted JWT client) is never logged. Only the NON-secret calendar config below
 * — the overhead ignore-list, the client-alias map, the designer calendar emails,
 * and the studio-hours window — lives in this committed file.
 */

/**
 * Overhead-ceremony ignore-list (D-07): SPECIFIC title phrases (NOT loose
 * keywords), matched case-insensitively as substrings against a meeting title.
 * These are the recurring internal team meetings the studio explicitly does NOT
 * count against the 7.5h day and never reconciles. Specific phrases — so a future
 * client meeting like "FDC WIP" is NOT accidentally swallowed by "WIP". Seeded
 * from the real meetings observed across all three calendars (04-CONTEXT
 * §Specifics); plan 02's labelling spike refines/extends this list.
 */
export const MEETING_IGNORE_LIST: readonly string[] = [
  "Daily Stand-up", // "Team Daily Stand-up"
  "Weekly WIP", // "Team Weekly WIP"
  "Creative WIP", // "Creative WIP - plan the week"
  "Creative team", // "Creative team - review (bring a piece of work!)"
];

/**
 * One client/company the meeting-title → client matcher (D-03) can resolve a
 * calendar event to. `companyId` is the Productive company id the same-day
 * reconciliation (D-01/D-02) compares against; `aliases` are the title tokens a
 * meeting may carry (short code, legal/trading name, project shorthand).
 */
export interface ClientAlias {
  companyId: string;
  companyName: string;
  code?: string;
  aliases: string[];
}

/**
 * Committed client-alias map (D-03/D-09): calendar-title tokens → Productive
 * company. Seeded with the live-validated FDC entry (04-CONTEXT §Specifics: FDC
 * Construction, id 1333899, code FDCC, IPO Launch Video project). Plan 02's
 * labelling spike confirms/extends this map against ~3-4 weeks of real meetings.
 */
export const CLIENT_ALIAS_MAP: readonly ClientAlias[] = [
  {
    companyId: "1333899",
    companyName: "FDC Construction",
    code: "FDCC",
    aliases: ["FDC", "FDC Construction", "FDCC", "IPO Launch"], // spike confirms/extends
  },
];

/**
 * The three monitored designers' primary calendar emails, keyed by Productive
 * person id to align with DESIGNER_PERSON_IDS / DESIGNER_NAMES (live-confirmed
 * 2026-06-04, STATE.md). The calendar read impersonates each of these via the
 * service account's domain-wide delegation (one `subject:` per designer). These
 * are non-secret identifiers, so they live in committed config.
 */
export const DESIGNER_CALENDAR_EMAILS = {
  "686717": "liamm@solvdagency.com.au",
  "686712": "anishag@solvdagency.com.au",
  "686716": "ellaw@solvdagency.com.au",
} as const;

/**
 * Studio working-hours window (D-08), studio-zone local time "HH:mm". Meetings
 * starting outside 08:30–17:30 (e.g. the 17:30 Falcon Dinner) are excluded as
 * after-hours by the mechanical filter in plan 03. Committed, non-secret.
 */
export const WORK_DAY_START = "08:30" as const;
export const WORK_DAY_END = "17:30" as const;
