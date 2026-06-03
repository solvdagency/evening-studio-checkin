/**
 * Non-throwing Productive JSON:API client (Phase 2).
 *
 * Trust posture: this is the network boundary. Every failure — non-ok HTTP, a
 * thrown fetch, or a shape drift — becomes a `Result` VALUE, never an exception
 * (threat T-02-03 / RESEARCH Pitfall 6). A source failure must degrade, not crash
 * the nightly run. The three auth headers are built from `process.env` only
 * (`PRODUCTIVE_AUTH_TOKEN` / `PRODUCTIVE_ORG_ID`); the token is NEVER logged and
 * NEVER hardcoded (D-15 / threat T-02-01). `fetchAllPages` paginates until
 * `meta.total_pages`, validating every page with the zod `JsonApiPage` schema.
 *
 * Implements RESEARCH Patterns 1 (Result type), 2 (paginate until total_pages),
 * 3 (safeParse at the boundary). Uses PRODUCTIVE_BASE_URL from ../config.ts.
 */

import { PRODUCTIVE_BASE_URL } from "../config.ts";
import { JsonApiPage } from "./schemas.ts";

/**
 * A boundary result: either a value, or an error string. Replaces thrown
 * exceptions so the caller always handles failure as data (Pattern 1).
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** JSON:API content type; spec-correct on GET, harmless if the server ignores it. */
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";

/**
 * Build the three required auth headers from env (D-15). Returns a Result so a
 * missing secret degrades instead of sending an empty header and silently 403ing.
 * SECURITY: the returned object carries the token — never log it.
 */
export function authHeaders(): Result<Record<string, string>> {
  const token = process.env.PRODUCTIVE_AUTH_TOKEN;
  const orgId = process.env.PRODUCTIVE_ORG_ID;
  if (!token || !orgId) {
    return {
      ok: false,
      error:
        "missing Productive credentials: set PRODUCTIVE_AUTH_TOKEN and PRODUCTIVE_ORG_ID",
    };
  }
  return {
    ok: true,
    value: {
      "X-Auth-Token": token,
      "X-Organization-Id": orgId,
      "Content-Type": JSON_API_CONTENT_TYPE,
      Accept: JSON_API_CONTENT_TYPE,
    },
  };
}

/**
 * GET a URL and return parsed JSON as a Result. Non-ok status → error; a thrown
 * fetch (network/DNS) → error. NEVER throws across this boundary (Pattern 1).
 * SECURITY: the error message uses only the HTTP status / thrown message — it
 * does NOT echo the request headers, so the token can never leak into a log.
 */
export async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<Result<unknown>> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, value: await res.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fetch every page of a JSON:API collection at `path` (e.g. "/bookings") under
 * `query` (a pre-built query string WITHOUT page params), accumulating each
 * page's `data` and `included`. Requests `page[size]=200` (the documented max)
 * and loops `page[number]` until `current_page >= total_pages` — it always reads
 * `total_pages` and never assumes a single page (Pattern 2). Any fetch error or
 * shape drift returns a Result error (degrade). Reads auth from env.
 */
export async function fetchAllPages(
  path: string,
  query: string,
): Promise<Result<{ data: unknown[]; included: unknown[] }>> {
  const headersResult = authHeaders();
  if (!headersResult.ok) return headersResult;
  const headers = headersResult.value;

  const data: unknown[] = [];
  const included: unknown[] = [];
  let page = 1;

  // Normalise the query prefix so we can always append page params with "&".
  const sep = query.length > 0 ? "&" : "";

  while (true) {
    const url = `${PRODUCTIVE_BASE_URL}${path}?${query}${sep}page[size]=200&page[number]=${page}`;
    const res = await getJson(url, headers);
    if (!res.ok) return res;

    const parsed = JsonApiPage.safeParse(res.value);
    if (!parsed.success) {
      return { ok: false, error: `shape drift in ${path}` };
    }

    data.push(...parsed.data.data);
    included.push(...(parsed.data.included ?? []));

    if (parsed.data.meta.current_page >= parsed.data.meta.total_pages) break;
    page += 1;
  }

  return { ok: true, value: { data, included } };
}
