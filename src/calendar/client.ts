/**
 * Non-throwing Google Calendar events client (Phase 4) — the twin of
 * src/productive/client.ts's `getJson`.
 *
 * Trust posture: this is the calendar network boundary. The googleapis client
 * throws on error (rather than returning a status), so `listDayEvents` wraps the
 * `events.list` call in a try/catch and converts ANY throw into a `Result` VALUE
 * — it NEVER throws across this boundary (REL-01 / threat T-04-04). The error
 * string carries only the thrown message (status/message), exactly like the
 * Productive client's "no headers in the error" rule — it never echoes the SA
 * key or access token (T-04-01).
 *
 * The `Result<T>` type is REUSED from src/productive/client.ts (never redefined).
 * `client` is typed loosely (the googleapis `calendar_v3.Calendar` surface) so
 * tests can hand-stub `events.list` with no network or credentials.
 */

import type { Result } from "../productive/client.ts";

/** The narrow slice of the googleapis calendar client this module calls. */
interface CalendarEventsClient {
  events: {
    list: (params: Record<string, unknown>) => Promise<{ data?: { items?: unknown[] } }>;
  };
}

/**
 * List the impersonated designer's primary-calendar events in the [timeMin,
 * timeMax) window, with recurring series expanded to real instances
 * (`singleEvents: true`; `orderBy: "startTime"` is only valid WITH it). Returns
 * the raw `items` array as a Result; any thrown client error degrades to
 * `{ ok: false, error }`. Keep the window wide (full studio day) — the studio-
 * hours clip is applied in code later (RESEARCH Pattern 2 / Pitfall 2).
 */
export async function listDayEvents(
  client: CalendarEventsClient,
  timeMin: string,
  timeMax: string,
): Promise<Result<unknown[]>> {
  try {
    const res = await client.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true, // expand recurring series into instances
      orderBy: "startTime", // valid only with singleEvents:true
      timeZone: "Australia/Sydney",
      maxResults: 250,
    });
    return { ok: true, value: res.data?.items ?? [] };
  } catch (e) {
    // SECURITY: only the thrown message — never the SA key / token (T-04-01).
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
