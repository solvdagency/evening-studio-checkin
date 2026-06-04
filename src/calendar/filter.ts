/**
 * Mechanical calendar filters + the overhead matcher + the composed
 * counting-meeting predicate (Phase 4, plan 04-03 — MEET-02 / MEET-05).
 *
 * These are the trust-critical exclusion rules: small PURE boolean predicates
 * over a clean `FilteredEvent` (src/calendar/gather.ts). They mirror the
 * predicate style of src/productive/briefed.ts — pre-resolved inputs in, a
 * boolean out, never throwing.
 *
 * Trust boundary (CLAUDE.md / threat T-04-08): this module imports NOTHING from
 * src/domain and never touches capacity arithmetic. It recomputes NO hours,
 * reads NO system clock (it parses the event's OWN start), and makes NO network
 * call. The only inputs are the FilteredEvent and the committed non-secret config
 * (MEETING_IGNORE_LIST, WORK_DAY_START/END).
 *
 * Data-shape notes pinned by the plan-02 spike (src/config.ts SPIKE FINDINGS):
 *  - A1 SOLO: solo events have the `attendees` key ENTIRELY ABSENT → mapped to
 *    `attendeeCount === 0`. isSolo treats count ≤ 1 as solo.
 *  - A2: outOfOffice / all-day / declined-self did NOT occur in the 28-day live
 *    window, so those paths are exercised by hand-built fixtures — but the
 *    predicates here implement them for real.
 */

import { DateTime } from "luxon";
import { STUDIO_ZONE } from "../domain/types.ts";
import { MEETING_IGNORE_LIST, WORK_DAY_START, WORK_DAY_END } from "../config.ts";
import type { FilteredEvent } from "./gather.ts";

/** eventTypes that are not trackable studio work and are excluded wholesale (D-08). */
const NON_WORK_EVENT_TYPES = new Set(["outOfOffice", "focusTime", "workingLocation"]);

/**
 * True ⟺ the designer's OWN RSVP is declined (D-08). Reads only the `self:true`
 * attendee's responseStatus (already resolved into `responseStatusSelf` by
 * gatherCalendar) — NOT the event-level `status`, and NOT other attendees'
 * responses. needsAction / tentative / accepted / undefined are all NOT declined
 * (Liam never RSVPs, so needsAction is the norm for real work meetings).
 */
export function isDeclined(e: FilteredEvent): boolean {
  return e.responseStatusSelf === "declined";
}

/**
 * True ⟺ the event is all-day: a date-only start (`startDate` present) with no
 * timed `startDateTime` (D-08). All-day events carry no studio time to attribute.
 */
export function isAllDay(e: FilteredEvent): boolean {
  return e.startDate !== undefined && e.startDateTime === undefined;
}

/**
 * True ⟺ the eventType marks the slot as non-work: out-of-office, focus time, or
 * a working-location marker (D-08 / MEET-05). `default` and undefined are work.
 */
export function isOutOfOffice(e: FilteredEvent): boolean {
  return e.eventType !== undefined && NON_WORK_EVENT_TYPES.has(e.eventType);
}

/**
 * True ⟺ the event is a solo block (only the designer, or no attendees at all).
 * A1 (spike-pinned): solo events have the `attendees` key ENTIRELY ABSENT, which
 * gatherCalendar maps to `attendeeCount === 0`; a self-only invite is count 1.
 * Both (≤ 1) are solo — not a real multi-party meeting.
 */
export function isSolo(e: FilteredEvent): boolean {
  return e.attendeeCount <= 1;
}

/**
 * True ⟺ a TIMED event starts outside the studio working-hours window
 * (WORK_DAY_START..WORK_DAY_END) in the STUDIO zone (D-08, RESEARCH Pitfall 2 —
 * compare in Australia/Sydney, never UTC). The 17:30 Falcon Dinner (== END) is
 * after-hours; a 16:00 meeting is kept.
 *
 * An event with no parseable timed start (all-day or missing) has no time to
 * attribute → treated as after-hours (excluded). The window bound check is
 * inclusive of START and EXCLUSIVE of END (a 17:30 start is out).
 */
export function isAfterHours(e: FilteredEvent): boolean {
  if (e.startDateTime === undefined) return true; // all-day / no time → exclude
  const dt = DateTime.fromISO(e.startDateTime).setZone(STUDIO_ZONE);
  if (!dt.isValid) return true; // unparseable → no trustworthy time → exclude
  const minutes = dt.hour * 60 + dt.minute;
  return minutes < toMinutes(WORK_DAY_START) || minutes >= toMinutes(WORK_DAY_END);
}

/** Parse an "HH:mm" studio-hours bound to minutes-since-midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * True ⟺ the title matches a committed overhead phrase (D-07). Case-insensitive
 * substring against MEETING_IGNORE_LIST — SPECIFIC phrases, so "Team Weekly WIP"
 * is overhead but a client "FDC WIP" is NOT swallowed. Applied BEFORE alias
 * resolution so "travel time, stevedores" is excluded before it could match the
 * Stevedores client. "(No title)" matches no phrase → not overhead.
 */
export function isOverhead(title: string): boolean {
  const lower = title.toLowerCase();
  return MEETING_IGNORE_LIST.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * The single composed predicate the reconciler consumes: a meeting COUNTS (is
 * reconciled) ⟺ it is none of declined / all-day / out-of-office / solo /
 * after-hours / overhead. Bias is structural: any exclusion wins.
 */
export function isCountingMeeting(e: FilteredEvent): boolean {
  return !(
    isDeclined(e) ||
    isAllDay(e) ||
    isOutOfOffice(e) ||
    isSolo(e) ||
    isAfterHours(e) ||
    isOverhead(e.summary)
  );
}
