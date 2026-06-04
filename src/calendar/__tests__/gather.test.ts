/**
 * Tests for the calendar ingestion root `gatherCalendar` (Task 3, plan 04-01).
 *
 * gatherCalendar is the non-throwing twin of productive/gather: per designer it
 * fetches → zod-validates → maps to a clean FilteredEvent → degrades via
 * sourceErrors, NEVER throwing across the boundary. These tests use a STUBBED
 * `fetchEvents` (no network, no credentials) and a fixed studio-zone `NOW`, and
 * load the captured events-day.json fixture via fileURLToPath — mirroring the
 * productive/gather.test.ts harness exactly.
 *
 * Run: node --import tsx --test src/calendar/__tests__/gather.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gatherCalendar, type CalendarGatherDeps } from "../gather.ts";
import { STUDIO_ZONE } from "../../domain/types.ts";
import type { Result } from "../../productive/client.ts";
import { DESIGNER_PERSON_IDS, DESIGNER_CALENDAR_EMAILS } from "../../config.ts";

/** A studio-zone "now" the evening before the 2026-06-04 target day. */
const NOW = DateTime.fromISO("2026-06-03T17:00:00", { zone: STUDIO_ZONE });

/** Load the captured events-day fixture (3 events: timed FDC, standup, all-day). */
function loadEventsFixture(): unknown[] {
  const path = fileURLToPath(
    new URL("../__fixtures__/events-day.json", import.meta.url),
  );
  const raw = JSON.parse(readFileSync(path, "utf8")) as { items: unknown[] };
  return raw.items;
}

/**
 * Build deps with a stubbed fetchEvents that returns the SAME ok page for every
 * designer (subject ignored). No network, no credentials.
 */
function depsReturning(items: unknown[]): CalendarGatherDeps {
  return {
    now: NOW,
    fetchEvents: async (): Promise<Result<unknown[]>> => ({ ok: true, value: items }),
  };
}

describe("gatherCalendar (fetch → validate → degrade per designer)", () => {
  it("happy path: events keyed by all three designers, empty sourceErrors", async () => {
    const out = await gatherCalendar(depsReturning(loadEventsFixture()));
    assert.deepEqual(out.sourceErrors, []);
    for (const id of DESIGNER_PERSON_IDS) {
      assert.ok(Array.isArray(out.eventsByDesigner[id]), `events for ${id}`);
      assert.equal(out.eventsByDesigner[id].length, 3);
    }
    // FilteredEvent shape: clean output, no raw Google type crosses the boundary.
    const fdc = out.eventsByDesigner[DESIGNER_PERSON_IDS[0]].find(
      (e) => e.id === "evt-fdc-checkin",
    );
    assert.ok(fdc);
    assert.equal(fdc!.summary, "FDC IPO Launch Check-In");
    assert.equal(fdc!.htmlLink, "https://www.google.com/calendar/event?eid=evt-fdc-checkin");
    assert.equal(typeof fdc!.startLabel, "string");
    assert.equal(fdc!.attendeeCount, 2);
    assert.equal(fdc!.responseStatusSelf, "needsAction");
    // The all-day event carries startDate (not startDateTime) and a date label.
    const leave = out.eventsByDesigner[DESIGNER_PERSON_IDS[0]].find(
      (e) => e.id === "evt-allday-leave",
    );
    assert.ok(leave);
    assert.equal(leave!.startDate, "2026-06-05");
  });

  it("degrade: a failed read for one designer pushes ONE sourceError; others populate", async () => {
    const failFor = DESIGNER_CALENDAR_EMAILS[DESIGNER_PERSON_IDS[1]];
    const items = loadEventsFixture();
    const out = await gatherCalendar({
      now: NOW,
      fetchEvents: async (subject: string): Promise<Result<unknown[]>> =>
        subject === failFor ? { ok: false, error: "boom" } : { ok: true, value: items },
    });
    // Exactly one sourceError, mentioning Calendar + the failed designer's name.
    assert.equal(out.sourceErrors.length, 1);
    assert.match(out.sourceErrors[0], /Calendar/);
    assert.match(out.sourceErrors[0], /Anisha/);
    // The failed designer has an empty (well-formed) list; the others populate.
    assert.deepEqual(out.eventsByDesigner[DESIGNER_PERSON_IDS[1]], []);
    assert.equal(out.eventsByDesigner[DESIGNER_PERSON_IDS[0]].length, 3);
    assert.equal(out.eventsByDesigner[DESIGNER_PERSON_IDS[2]].length, 3);
  });

  it("shape-drift: an entry missing id is skipped (noted), valid ones kept", async () => {
    const items = [
      { id: "evt-ok", summary: "Real meeting", start: { dateTime: "2026-06-05T10:00:00+10:00" } },
      { summary: "No id here", start: { dateTime: "2026-06-05T11:00:00+10:00" } }, // drift
    ];
    const out = await gatherCalendar(depsReturning(items));
    // The drift is noted at least once (one per designer it appears for is fine).
    assert.ok(out.sourceErrors.length > 0);
    assert.ok(out.sourceErrors.some((e) => /skipped|validation/i.test(e)));
    // Each designer keeps exactly the one valid event.
    for (const id of DESIGNER_PERSON_IDS) {
      assert.equal(out.eventsByDesigner[id].length, 1);
      assert.equal(out.eventsByDesigner[id][0].id, "evt-ok");
    }
  });

  it("never throws even when every read fails (degrade contract)", async () => {
    await assert.doesNotReject(async () => {
      const out = await gatherCalendar({
        now: NOW,
        fetchEvents: async (): Promise<Result<unknown[]>> => ({ ok: false, error: "down" }),
      });
      assert.equal(out.sourceErrors.length, DESIGNER_PERSON_IDS.length);
      for (const id of DESIGNER_PERSON_IDS) {
        assert.deepEqual(out.eventsByDesigner[id], []);
      }
    });
  });
});
