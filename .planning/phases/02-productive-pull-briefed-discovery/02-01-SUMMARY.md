---
phase: 02-productive-pull-briefed-discovery
plan: 01
subsystem: api
tags: [productive, json-api, zod, fetch, pagination, date-holidays, dotenv, ingestion]

# Dependency graph
requires:
  - phase: 01-core-math-clock
    provides: "Booking/Absence/HolidaySet contracts + STUDIO_ZONE/TARGET_MINUTES the ingestion layer maps into"
provides:
  - "src/productive/client.ts — non-throwing, env-authenticated, paginating JSON:API client (Result<T>)"
  - "src/productive/schemas.ts — zod boundary schemas validated against a real /bookings response"
  - "src/productive/types.ts — ingestion-internal raw types (never cross into domain)"
  - "src/config.ts — designer person IDs, base URL, NSW holiday region, studio closures"
  - ".env.example — committed secret-name template"
  - "src/productive/__fixtures__/bookings-page.json — real captured /bookings page (schema ground truth)"
  - "CONFIRMED: X-Organization-Id = 34092 (bare numeric) returns 200"
affects: [02-02-mappers, 02-03-briefed-include, 02-04-gather, productive-ingestion]

# Tech tracking
tech-stack:
  added: [zod ^4.4.3, date-holidays ^3.30.2, dotenv ^17.4.2, "@types/node (dev)"]
  patterns:
    - "Result<T> discriminated union — failures are values, never thrown across the boundary"
    - "zod .safeParse at the network boundary; tolerant (loose) schemas so new API fields never break the pull"
    - "auth headers built from process.env only; token never logged, never committed"
    - "paginate until meta.current_page >= meta.total_pages; never assume one page"

key-files:
  created:
    - src/config.ts
    - .env.example
    - src/productive/types.ts
    - src/productive/schemas.ts
    - src/productive/client.ts
    - src/productive/__tests__/schemas.test.ts
    - src/productive/__fixtures__/bookings-page.json
  modified:
    - tsconfig.json
    - package.json

key-decisions:
  - "X-Organization-Id is the bare numeric 34092 (confirmed live HTTP 200; the slug form also works, but 34092 is the canonical/committed value)"
  - "Live /bookings has NO booking_type attribute — work-vs-absence (D-11) is the service vs event relationship, not an attribute"
  - "Live /bookings has NO approval_status integer — model uses approved/rejected booleans; draft remains the tentative signal (D-07)"
  - "Un-included relationships arrive as { meta: { included: false } } — the Relationship schema tolerates both data and meta forms"
  - "Added allowImportingTsExtensions + @types/node so the project's .ts-import convention typechecks (Phase 1 tsc was broken)"

patterns-established:
  - "Non-throwing boundary client (Result<T>) — every Productive call degrades to an error value"
  - "Tolerant zod boundary schemas validated against a captured real fixture, not assumptions"
  - "Secrets only in env (.env / Actions); non-secret config committed in src/config.ts (D-15)"

requirements-completed: [BRIEF-01]

# Metrics
duration: 8min
completed: 2026-06-03
---

# Phase 2 Plan 01: Productive Ingestion Spine Summary

**Non-throwing, env-authenticated, paginating Productive JSON:API client with zod boundary schemas corrected against a real /bookings response, and a confirmed working X-Organization-Id (34092).**

## Performance

- **Duration:** 8 min (continuation agent; excludes prior checkpoint wait)
- **Started:** 2026-06-03T10:18:21Z
- **Completed:** 2026-06-03T10:26:12Z
- **Tasks:** 4 (1 package-legitimacy checkpoint resolved, 2 build tasks, 1 live-probe checkpoint resolved)
- **Files modified:** 10 (7 created, 3 modified incl. lockfile)

## Accomplishments
- Installed the three human-approved net-new packages (zod, date-holidays, dotenv) after the blocking-human legitimacy gate.
- Built `src/productive/client.ts`: a `Result<T>` client that never throws — `getJson` returns an error value on non-ok HTTP and on a thrown fetch; `fetchAllPages` paginates to `total_pages` and safeParses every page.
- Wrote zod boundary schemas with the corrected field names (`booking_method_id`/`draft`/`canceled`), plus a tolerant `ProjectResource` carrying the D-06 nullable `company` signal.
- **Ran the live auth probe:** confirmed `X-Organization-Id=34092` returns **HTTP 200**, captured a real 6-booking page, and corrected three schema assumptions against the live shape.

## Live Probe Result (Task 4 — human-verify gate)

- **Working `PRODUCTIVE_ORG_ID`:** `34092` (bare numeric, the value already in `.env`). HTTP **200** on `GET /people/686717`. The slug form `34092-solvd-agency` *also* returned 200, but `34092` is the canonical committed value. (Resolves A1 / Open Q1 / Pitfall 2.)
- **Live field names vs corrected schema:** `booking_method_id`, `draft`, `canceled` all present in live data; old names (`is_draft`/`is_canceled`/`booking_method`) absent. Pitfall 1 validated against real data.
- **Captured fixture:** `src/productive/__fixtures__/bookings-page.json` — a real single page, 6 bookings / 9 included resources (services + tasks), for the three designers over the 2026-06-03→06-05 window. No secrets in the file. Parses green under `JsonApiPage` and `BookingResource`.

## Task Commits

1. **Task 1: Verify + install dependencies** — `aeb8f3c` (chore)
2. **Task 2: Config + secret template + zod schemas** — `3bcb69f` (feat)
3. **Task 3: Non-throwing client + fixture test** — `1f26d39` (test, RED) → `3afec43` (feat, GREEN)
4. **Task 4: Live auth probe + schema correction** — `8dfc93b` (fix)

**Plan metadata:** committed separately with STATE/ROADMAP updates.

## Files Created/Modified
- `src/config.ts` - Non-secret ingestion config: designer person IDs (686717/686712/686716), base URL, NSW region, closures placeholder.
- `.env.example` - Committed secret-name template (PRODUCTIVE_AUTH_TOKEN / PRODUCTIVE_ORG_ID), no values.
- `src/productive/types.ts` - Ingestion-internal raw types; documented never to cross into domain.
- `src/productive/schemas.ts` - zod safeParse boundary schemas, corrected to the live shape; tolerant Relationship + ProjectResource.
- `src/productive/client.ts` - Result<T> client: env auth headers, getJson, fetchAllPages.
- `src/productive/__tests__/schemas.test.ts` - 7 boundary tests (fixture parse, malformed-degrades, old-name regression, client non-throw).
- `src/productive/__fixtures__/bookings-page.json` - Real captured /bookings page.
- `tsconfig.json` - Added allowImportingTsExtensions + types:[node] (Rule 3 fix).
- `package.json` / `package-lock.json` - Added zod, date-holidays, dotenv, @types/node.

## Decisions Made
- Used the env value `34092` (bare numeric) as the canonical org-id after confirming both forms 200; documented for all later plans so none re-probe.
- Determined work-vs-absence (D-11) from the `service` vs `event` relationship rather than a `booking_type` attribute, because the live response has no such attribute.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Project tsc was broken; added allowImportingTsExtensions + @types/node**
- **Found during:** Task 2 (the plan's `npx tsc --noEmit` verify gate)
- **Issue:** `tsc --noEmit` produced 19 pre-existing Phase-1 errors — `@types/node` was never installed and the tsconfig lacked `allowImportingTsExtensions`, so the project's own mandated `.ts`-extension import convention could not typecheck. The plan requires `tsc --noEmit` to pass in Tasks 2 and 3.
- **Fix:** Added `allowImportingTsExtensions: true` and `types: ["node"]` to tsconfig; installed `@types/node` as a devDependency. No source behavior changed.
- **Files modified:** tsconfig.json, package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` exits 0 across the whole project (was 19 errors); full test suite 66/66.
- **Committed in:** `3bcb69f` (Task 2 commit)

**2. [Rule 1 - Bug] Corrected schemas to the live /bookings shape**
- **Found during:** Task 4 (live probe)
- **Issue:** The schema (built from CONTEXT/RESEARCH concepts) required `booking_type` (string) and `approval_status` (number), and a `Relationship` always shaped `{data}`. The live response has neither attribute and returns un-included relationships as `{ meta: { included: false } }`. Result: all 6 live bookings failed to parse — i.e. a silent empty pull every night (exactly Pitfall 1).
- **Fix:** Removed the non-existent attributes (kept `approved`/`rejected`/`total_working_days` optional); made `Relationship` tolerate both `{data}` and `{meta}` forms and `.loose()`; made the booking `relationships` object loose. Updated the test samples to mirror the live shape.
- **Files modified:** src/productive/schemas.ts, src/productive/__tests__/schemas.test.ts, src/productive/__fixtures__/bookings-page.json
- **Verification:** All 6 real bookings parse; malformed-page + old-name regression tests still assert `.success===false`; 66/66 tests, tsc clean.
- **Committed in:** `8dfc93b` (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both essential for correctness. The tsc fix unblocked the verify gate and repaired pre-existing Phase-1 breakage; the schema correction is the entire point of the Task-4 live gate (catching the assumed-vs-real field drift before any later plan trusts it). No scope creep.

## Issues Encountered
- The grep acceptance checks initially matched explanatory doc comments (e.g. comments naming the OLD field names to forbid them). Resolved by verifying the criteria at the code level (non-comment lines) — the actual code uses only corrected names and holds no secret values.

## User Setup Required
None new — `PRODUCTIVE_AUTH_TOKEN` and `PRODUCTIVE_ORG_ID=34092` are already set in the local `.env`. For CI, add both as GitHub Actions encrypted secrets (D-15) before the nightly run.

## Next Phase Readiness
- The ingestion spine is proven end-to-end: real 200, a captured fixture the schema parses, corrected field names, confirmed org-id.
- Ready for 02-02 (mappers / per-day minutes D-09 — note the live data exposes `total_working_days`, a ready divisor for method 3), 02-03 (briefed include-depth + workflow_statuses), and 02-04 (gather + D-06 internal-vs-client via the ProjectResource company signal).
- No blockers.

## Self-Check: PASSED

---
*Phase: 02-productive-pull-briefed-discovery*
*Completed: 2026-06-03*
