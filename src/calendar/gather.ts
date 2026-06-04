/**
 * Calendar ingestion root (Phase 4) — the non-throwing twin of
 * src/productive/gather.ts.
 *
 * `gatherCalendar` is the additive new ingestion source: per designer it derives
 * the target-day window, fetches the day's events (DWD-impersonated, recurring
 * already expanded server-side), validates every event at the zod boundary, maps
 * survivors to a clean `FilteredEvent`, and degrades via `sourceErrors` — NEVER
 * throwing across the boundary (REL-01 / threats T-04-03/T-04-04). A read failure
 * for one designer becomes one sourceErrors string and the run continues; the
 * other designers still populate. A shape drift on one event skips that event and
 * notes it; the valid ones survive.
 *
 * Boundary: no raw Google Event type crosses out of this file — only the clean
 * `FilteredEvent` (plan 03's filter/reconcile read THIS). This module imports
 * NOTHING from src/domain/ and reads NO system clock — only the injected `now`.
 *
 * Scope (this plan): gatherCalendar emits ALL validated events as FilteredEvent.
 * The mechanical filters + overhead ignore-list are plan 03 (filter.ts); the
 * spike (plan 02) and plan 03 see the full shape here.
 *
 * Determinism: `fetchEvents` is injectable (default builds a per-subject DWD
 * client via loadSaKey + buildCalendarClient then listDayEvents) so tests run
 * with no network and no credentials; `now` is the injected studio-zone clock.
 */

import { DateTime } from "luxon";
import type { DesignerId, HolidaySet } from "../domain/types.ts";
import { STUDIO_ZONE } from "../domain/types.ts";
import { nextWorkingDay } from "../domain/clock.ts";
import { buildHolidaySet, yearsForWindow } from "../holidays.ts";
import { STUDIO_CLOSURES, DESIGNER_CALENDAR_EMAILS, DESIGNER_NAMES } from "../config.ts";
import type { Result } from "../productive/client.ts";
import { CalendarEventResource } from "./schemas.ts";
import { listDayEvents } from "./client.ts";
import { loadSaKey, buildCalendarClient } from "./auth.ts";

/**
 * A clean, boundary-crossing calendar event. No raw Google type leaks past here;
 * plan 03's filter/reconcile read these fields only.
 *  - `startLabel`: a studio-zone display label ("2:30pm" for timed, the date for
 *    all-day) for the 📅 card sub-line (D-14).
 *  - `startDateTime`/`startDate`: the raw RFC3339 / date strings (timed vs all-day)
 *    for the mechanical filters (after-hours / all-day, plan 03).
 *  - `responseStatusSelf`: the OWNER's RSVP (the `self:true` attendee) — declined
 *    detection (D-08); other attendees' statuses are not read.
 *  - `attendeeCount`: solo detection input (plan 03).
 *  - `durationMinutes`: the studio meeting length in minutes, computed from
 *    start.dateTime → end.dateTime; undefined when not timed or when end is
 *    missing. PRESENTATION-ONLY (the 📅 line's humanized duration) — never
 *    capacity/hour math, and computed from the event's own strings, not the clock.
 */
export interface FilteredEvent {
  id: string;
  summary: string;
  htmlLink: string;
  startLabel: string;
  startDateTime?: string;
  startDate?: string;
  eventType?: string;
  responseStatusSelf?: string;
  attendeeCount: number;
  durationMinutes?: number;
}

/** What `gatherCalendar` produces — per-designer events + degrade signal. */
export interface CalendarResult {
  /** Validated, clean events keyed by designer person id. */
  eventsByDesigner: Record<DesignerId, FilteredEvent[]>;
  /** Accumulated source failures — non-empty means a degraded run, never a crash. */
  sourceErrors: string[];
}

/**
 * Injected dependencies (mirrors productive/gather's GatherDeps for determinism).
 * `fetchEvents` defaults to building a per-subject DWD client and calling
 * listDayEvents; tests inject a stub so NO network/credentials are needed.
 */
export interface CalendarGatherDeps {
  now: DateTime;
  fetchEvents?: (subject: string, timeMin: string, timeMax: string) => Promise<Result<unknown[]>>;
}

/**
 * The default fetcher: mint a per-subject DWD calendar client from
 * GOOGLE_SA_KEY and list the day's events. A missing/bad key degrades to a
 * Result error (never throws, never logs the key). This is the ONLY place the
 * env credential is read in this module (the env boundary).
 */
async function defaultFetchEvents(
  subject: string,
  timeMin: string,
  timeMax: string,
): Promise<Result<unknown[]>> {
  const keyResult = loadSaKey();
  if (!keyResult.ok) return keyResult;
  const client = buildCalendarClient(keyResult.value, subject);
  return listDayEvents(client, timeMin, timeMax);
}

/**
 * Build a studio-zone display label for an event start. Timed → "2:30pm"; all-day
 * (date-only) → the ISO date. Falls back to the raw value if luxon can't parse.
 */
function startLabel(start: { date?: string; dateTime?: string } | undefined): string {
  if (start?.dateTime) {
    const dt = DateTime.fromISO(start.dateTime).setZone(STUDIO_ZONE);
    if (dt.isValid) return dt.toFormat("h:mma").toLowerCase();
    return start.dateTime;
  }
  if (start?.date) return start.date;
  return "";
}

/**
 * Meeting length in minutes from the event's OWN start/end strings (timed events
 * only). RFC3339 offsets carry the zone, so a plain diff is correct without
 * setZone. Returns undefined when either bound is missing or unparseable (all-day
 * events have no dateTime). PRESENTATION-ONLY — never capacity math, no clock read.
 */
function durationMinutes(
  start: { dateTime?: string } | undefined,
  end: { dateTime?: string } | undefined,
): number | undefined {
  if (!start?.dateTime || !end?.dateTime) return undefined;
  const s = DateTime.fromISO(start.dateTime);
  const e = DateTime.fromISO(end.dateTime);
  if (!s.isValid || !e.isValid) return undefined;
  return Math.round(e.diff(s, "minutes").minutes);
}

/**
 * Orchestrate the per-designer calendar pull → CalendarResult. Never throws:
 * every failure (a Result error from fetchEvents, a zod drift) degrades into
 * `sourceErrors`. Pure relative to its injected deps.
 */
export async function gatherCalendar(deps: CalendarGatherDeps): Promise<CalendarResult> {
  const fetchEvents = deps.fetchEvents ?? defaultFetchEvents;
  const sourceErrors: string[] = [];

  // (1) Target day — the SAME derivation as productive/gather so calendar and
  //     productive agree on "tomorrow".
  const holidays: HolidaySet = buildHolidaySet(yearsForWindow(deps.now), STUDIO_CLOSURES);
  const targetDay = nextWorkingDay(deps.now, holidays);
  const targetKey = targetDay.toISODate() ?? "";

  // (2) Australia/Sydney full-day window (keep wide; studio-hours clip is plan 03).
  const day = DateTime.fromISO(targetKey, { zone: STUDIO_ZONE });
  const timeMin = day.startOf("day").toISO() ?? "";
  const timeMax = day.endOf("day").toISO() ?? "";

  const eventsByDesigner: Record<DesignerId, FilteredEvent[]> = {};

  // (3) Per designer: fetch → validate → map. A failure degrades (one string),
  //     the loop continues so the other designers still populate.
  for (const [personId, email] of Object.entries(DESIGNER_CALENDAR_EMAILS)) {
    const id = personId as DesignerId;
    eventsByDesigner[id] = [];
    const name = DESIGNER_NAMES[personId as keyof typeof DESIGNER_NAMES] ?? personId;

    const res = await fetchEvents(email, timeMin, timeMax);
    if (!res.ok) {
      sourceErrors.push(`Couldn't reach Calendar for ${name}: ${res.error}`);
      continue; // degrade per designer, never throw (REL-01)
    }

    for (const entry of res.value) {
      const parsed = CalendarEventResource.safeParse(entry);
      if (!parsed.success) {
        sourceErrors.push(`a calendar event for ${name} failed validation (skipped)`);
        continue; // drift → skip this event, never throw
      }
      const e = parsed.data;
      const attendees = e.attendees ?? [];
      const selfAttendee = attendees.find((a) => a.self === true);
      eventsByDesigner[id].push({
        id: e.id,
        summary: e.summary ?? "(No title)",
        htmlLink: e.htmlLink ?? "",
        startLabel: startLabel(e.start),
        startDateTime: e.start?.dateTime,
        startDate: e.start?.date,
        eventType: e.eventType,
        responseStatusSelf: selfAttendee?.responseStatus,
        attendeeCount: attendees.length,
        durationMinutes: durationMinutes(e.start, e.end),
      });
    }
  }

  return { eventsByDesigner, sourceErrors };
}
