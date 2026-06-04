/**
 * zod boundary schema for Google Calendar Event resources (Phase 4).
 *
 * Trust posture: this is the validation gate where untrusted external JSON (event
 * titles, links, attendee data) enters the app (threat T-04-03). Mirrors the
 * Productive boundary (src/productive/schemas.ts): validate ONLY the fields this
 * phase reads, tolerate unknown Google fields with `.loose()`, and export only
 * `safeParse`-usable schemas — NEVER a `.parse` wrapper (which would throw across
 * the boundary). A drift on one event skips that event and degrades; it never
 * crashes the nightly run.
 *
 * Fields validated (the only ones this phase reads):
 *   id (required), status, summary, htmlLink, eventType, start{date,dateTime,
 *   timeZone}, end{date,dateTime,timeZone}, attendeesOmitted,
 *   attendees[]{self,responseStatus}.
 */

import { z } from "zod";

/**
 * An event's start (or end) time. `date` is present ⟺ all-day; `dateTime` is
 * present ⟺ a timed event (RFC3339). `.loose()` keeps any extra Google fields.
 */
const EventDateTime = z
  .object({
    date: z.string().optional(), // present ⟺ all-day
    dateTime: z.string().optional(), // present ⟺ timed (RFC3339)
    timeZone: z.string().optional(),
  })
  .loose();

/**
 * A Calendar Event as returned by `events.list` (with `singleEvents: true`).
 * `id` is the only required field; everything else is optional + tolerant so a
 * new Google attribute never breaks the parse. `status` is the event lifecycle
 * (confirmed/tentative/cancelled) — NOT the owner's RSVP. The owner's RSVP is the
 * `self: true` attendee's `responseStatus` (declined detection, D-08/Pitfall 4).
 */
export const CalendarEventResource = z
  .object({
    id: z.string(),
    status: z.string().optional(), // confirmed/tentative/cancelled (NOT the RSVP)
    summary: z.string().optional(), // the title (absent on a "(No title)" event)
    htmlLink: z.string().optional(), // MSG-06 deep-link
    eventType: z.string().optional(), // default/outOfOffice/focusTime/workingLocation/...
    start: EventDateTime.optional(),
    end: EventDateTime.optional(), // timed → duration = end.dateTime − start.dateTime
    attendeesOmitted: z.boolean().optional(),
    attendees: z
      .array(
        z
          .object({
            self: z.boolean().optional(),
            responseStatus: z.string().optional(), // needsAction/declined/tentative/accepted
          })
          .loose(),
      )
      .optional(),
  })
  .loose();
