/**
 * Truth-table tests for the mechanical filters (plan 04-03, MEET-02/MEET-05).
 *
 * Each pure predicate in filter.ts is asserted against the plan-02 golden
 * fixtures (src/calendar/__fixtures__/labelled-events.json) PLUS hand-built
 * edge FilteredEvents that exercise the truth-table rows the fixtures don't.
 * The fixtures are raw CalendarEventResource JSON; we map them to FilteredEvent
 * with the SAME shape gatherCalendar produces so the filters are tested against
 * the REAL data shapes (A1 solo = attendees absent; A2 OOO/all-day/declined are
 * hand-built) rather than assumptions.
 *
 * node:test + node:assert/strict, offline. No network, no clock.
 * Run: node --import tsx --test src/calendar/__tests__/filter.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FilteredEvent } from "../gather.ts";
import {
  isDeclined,
  isAllDay,
  isOutOfOffice,
  isSolo,
  isAfterHours,
  isOverhead,
  isCountingMeeting,
} from "../filter.ts";

/** The raw fixture event shape (subset we read to build a FilteredEvent). */
interface RawFixture {
  _label: string;
  id: string;
  summary?: string;
  htmlLink?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

/** Map a raw fixture to a FilteredEvent exactly as gatherCalendar does. */
function toFilteredEvent(raw: RawFixture): FilteredEvent {
  const attendees = raw.attendees ?? [];
  const self = attendees.find((a) => a.self === true);
  return {
    id: raw.id,
    summary: raw.summary ?? "(No title)",
    htmlLink: raw.htmlLink ?? "",
    startLabel: raw.start?.dateTime ?? raw.start?.date ?? "",
    startDateTime: raw.start?.dateTime,
    startDate: raw.start?.date,
    eventType: raw.eventType,
    responseStatusSelf: self?.responseStatus,
    attendeeCount: attendees.length,
  };
}

/** Load the golden fixtures keyed by their `_label` for targeted assertions. */
function loadFixtures(): Map<string, FilteredEvent> {
  const path = fileURLToPath(new URL("../__fixtures__/labelled-events.json", import.meta.url));
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawFixture[];
  const map = new Map<string, FilteredEvent>();
  for (const r of raw) map.set(r._label, toFilteredEvent(r));
  return map;
}

const F = loadFixtures();
const get = (label: string): FilteredEvent => {
  const e = F.get(label);
  assert.ok(e, `fixture missing: ${label}`);
  return e;
};

// Convenience aliases to the golden fixtures by label.
const COVERED = "counts/FDC · covered";
const WORTH = "counts/FDC · worth-a-look";
const SOLO = "not-work · solo (no attendees field)";
const AFTER = "not-work · after-hours (17:30 start)";
const OVERHEAD = "overhead · ignore-list";
const DECLINED = "synthetic · declined-self (exclude)";
const ALLDAY = "synthetic · all-day (date-only start)";
const OOO = "synthetic · out-of-office (eventType)";

describe("isDeclined — only the designer's OWN declined RSVP", () => {
  it("true when self responseStatus is declined (hand-built fixture)", () => {
    assert.equal(isDeclined(get(DECLINED)), true);
  });

  it("false for needsAction (D-08: Liam never RSVPs — golden covered case)", () => {
    assert.equal(isDeclined(get(COVERED)), false);
  });

  it("false for accepted / tentative / undefined self status", () => {
    const base = get(COVERED);
    assert.equal(isDeclined({ ...base, responseStatusSelf: "accepted" }), false);
    assert.equal(isDeclined({ ...base, responseStatusSelf: "tentative" }), false);
    assert.equal(isDeclined({ ...base, responseStatusSelf: undefined }), false);
  });

  it("ignores OTHER attendees' declines (organizer declined, self needsAction)", () => {
    // The overhead standup has an organizer with responseStatus declined; self is needsAction.
    assert.equal(isDeclined(get(OVERHEAD)), false);
  });
});

describe("isAllDay — start.date present, no dateTime", () => {
  it("true for the hand-built date-only event", () => {
    assert.equal(isAllDay(get(ALLDAY)), true);
  });

  it("false for a timed event", () => {
    assert.equal(isAllDay(get(COVERED)), false);
  });
});

describe("isOutOfOffice — eventType in {outOfOffice, focusTime, workingLocation}", () => {
  it("true for the hand-built outOfOffice event", () => {
    assert.equal(isOutOfOffice(get(OOO)), true);
  });

  it("true for focusTime and workingLocation", () => {
    const base = get(COVERED);
    assert.equal(isOutOfOffice({ ...base, eventType: "focusTime" }), true);
    assert.equal(isOutOfOffice({ ...base, eventType: "workingLocation" }), true);
  });

  it("false for default eventType and undefined", () => {
    assert.equal(isOutOfOffice(get(COVERED)), false);
    assert.equal(isOutOfOffice({ ...get(COVERED), eventType: undefined }), false);
  });
});

describe("isSolo — A1: missing attendees field counts as solo", () => {
  it("true for the real solo 'appointment' (attendees key ABSENT)", () => {
    const solo = get(SOLO);
    assert.equal(solo.attendeeCount, 0); // mapped from absent attendees
    assert.equal(isSolo(solo), true);
  });

  it("true when only the self attendee is present (count 1)", () => {
    assert.equal(isSolo({ ...get(COVERED), attendeeCount: 1 }), true);
  });

  it("false for a multi-attendee meeting (golden covered case has 3)", () => {
    assert.equal(get(COVERED).attendeeCount >= 2, true);
    assert.equal(isSolo(get(COVERED)), false);
  });
});

describe("isAfterHours — studio-zone local start outside 08:30..17:30", () => {
  it("true for the 17:30 Falcon Dinner (== WORK_DAY_END is excluded)", () => {
    assert.equal(isAfterHours(get(AFTER)), true);
  });

  it("false for a 16:00 studio-zone meeting (kept)", () => {
    const e: FilteredEvent = {
      ...get(COVERED),
      startDateTime: "2026-06-03T16:00:00+10:00",
    };
    assert.equal(isAfterHours(e), false);
  });

  it("false for the golden 09:45 covered case", () => {
    assert.equal(isAfterHours(get(COVERED)), false);
  });

  it("true for an 08:00 start (before WORK_DAY_START)", () => {
    const e: FilteredEvent = {
      ...get(COVERED),
      startDateTime: "2026-06-03T08:00:00+10:00",
    };
    assert.equal(isAfterHours(e), true);
  });

  it("compares in studio zone, not UTC (a UTC-early but Sydney-midday start is kept)", () => {
    // 2026-06-03T02:00:00Z == 12:00 Australia/Sydney (UTC+10) → within hours.
    const e: FilteredEvent = {
      ...get(COVERED),
      startDateTime: "2026-06-03T02:00:00Z",
    };
    assert.equal(isAfterHours(e), false);
  });

  it("treats an all-day (no dateTime) event as after-hours (no time to attribute)", () => {
    assert.equal(isAfterHours(get(ALLDAY)), true);
  });
});

describe("isOverhead — specific committed phrases, case-insensitive substring", () => {
  it("true for 'Team Daily Stand-up' (ignore-list 'Daily Stand-up')", () => {
    assert.equal(isOverhead(get(OVERHEAD).summary), true);
  });

  it("true for 'travel time, stevedores' (ignore-list 'travel time')", () => {
    assert.equal(isOverhead("travel time, stevedores"), true);
  });

  it("D-07: excludes 'Team Weekly WIP' but NOT a client 'FDC WIP'", () => {
    assert.equal(isOverhead("Team Weekly WIP"), true);
    assert.equal(isOverhead("FDC WIP"), false);
  });

  it("false for a counting client meeting and for (No title)", () => {
    assert.equal(isOverhead(get(COVERED).summary), false);
    assert.equal(isOverhead("(No title)"), false);
  });
});

describe("isCountingMeeting — composed predicate the reconciler consumes", () => {
  it("true for the two golden FDC cases (timed, multi-attendee, in-hours, not overhead)", () => {
    assert.equal(isCountingMeeting(get(COVERED)), true);
    assert.equal(isCountingMeeting(get(WORTH)), true);
  });

  it("false for declined / all-day / OOO / solo / after-hours / overhead", () => {
    assert.equal(isCountingMeeting(get(DECLINED)), false);
    assert.equal(isCountingMeeting(get(ALLDAY)), false);
    assert.equal(isCountingMeeting(get(OOO)), false);
    assert.equal(isCountingMeeting(get(SOLO)), false);
    assert.equal(isCountingMeeting(get(AFTER)), false);
    assert.equal(isCountingMeeting(get(OVERHEAD)), false);
  });

  it("false when the start is missing entirely (no time to attribute)", () => {
    const e: FilteredEvent = {
      ...get(COVERED),
      startDateTime: undefined,
      startDate: undefined,
    };
    assert.equal(isCountingMeeting(e), false);
  });
});
