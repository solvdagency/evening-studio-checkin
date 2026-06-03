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
