/**
 * Tests for the ingestion composition root `gather` (Task 1, plan 02-04).
 *
 * gather is the twin of computeStudioReport: it pulls → validates → maps →
 * assesses → assembles, NEVER throwing across the boundary. These tests use a
 * STUBBED page fetcher (no real network) so they are deterministic and offline:
 *   - the captured real /bookings fixture (02-01) drives the happy path;
 *   - a forced Result-error stub proves the degrade-via-sourceErrors path;
 *   - a partial-pull stub proves assessedDesigners omits the uncovered designer
 *     and computeStudioReport names them in missingDesigners (T-02-15);
 *   - the happy-path output is fed into computeStudioReport to prove the
 *     end-to-end spine produces a well-formed StudioReport (no throw).
 *
 * Run: node --import tsx --test "src/productive/__tests__/gather.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gather, type GatherDeps } from "../gather.ts";
import { computeStudioReport } from "../../domain/report.ts";
import { STUDIO_ZONE } from "../../domain/types.ts";
import type { DesignerId } from "../../domain/types.ts";
import type { Result } from "../client.ts";
import { DESIGNER_PERSON_IDS } from "../../config.ts";

type Page = { data: unknown[]; included: unknown[] };

/** A studio-zone "now" the evening before the 2026-06-04 fixture target day. */
const NOW = DateTime.fromISO("2026-06-03T17:00:00", { zone: STUDIO_ZONE });

/** Load the captured live /bookings page (6 bookings, 9 included). */
function loadBookingsFixture(): Page {
  const path = fileURLToPath(
    new URL("../__fixtures__/bookings-page.json", import.meta.url),
  );
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    data: unknown[];
    included?: unknown[];
  };
  return { data: raw.data, included: raw.included ?? [] };
}

/** A minimal /workflow_statuses pull: SOLVD Standard Briefed at position 3. */
function workflowStatusesPage(): Page {
  const status = (
    id: string,
    name: string,
    position: number,
    workflowId: string,
  ) => ({
    id,
    type: "workflow_statuses",
    attributes: { name, position, category_id: 2 },
    relationships: { workflow: { data: { id: workflowId, type: "workflows" } } },
  });
  return {
    data: [
      status("s1", "Not Started", 1, "w1"),
      status("s2", "Quoting", 2, "w1"),
      status("s3", "Briefed", 3, "w1"),
      status("s4", "Working on it", 4, "w1"),
    ],
    included: [],
  };
}

/**
 * Build a deps object with a stubbed fetcher routed by path. Any path not in
 * `pages` returns an empty successful page.
 */
function depsWith(pages: Record<string, Result<Page>>): GatherDeps {
  return {
    now: NOW,
    fetchPages: async (path: string): Promise<Result<Page>> =>
      pages[path] ?? { ok: true, value: { data: [], included: [] } },
  };
}

const OK = (page: Page): Result<Page> => ({ ok: true, value: page });
const ERR = (error: string): Result<Page> => ({ ok: false, error });

/**
 * Build a minimal allocations page. Each entry is a live-shaped /allocations
 * record (booking_type is a real attribute; person via relationship). Used for
 * the GAP-CLOSURE set-difference: present-in-allocations-but-absent-from-bookings
 * ⟹ tentative.
 */
function allocation(
  id: string,
  personId: string,
  bookingType: "service" | "event",
  minutes: number,
  day: string,
): unknown {
  return {
    id,
    type: "allocations",
    attributes: {
      booking_method_id: 1,
      time: minutes,
      total_time: minutes,
      percentage: null,
      started_on: day,
      ended_on: day,
      total_working_days: 1,
      booking_type: bookingType,
    },
    relationships: {
      person: { data: { id: personId, type: "people" } },
      service:
        bookingType === "service"
          ? { data: { id: "svc-" + id, type: "services" } }
          : { data: null },
      event:
        bookingType === "event"
          ? { data: { id: "evt-" + id, type: "events" } }
          : { data: null },
    },
  };
}

/** A confirmed /bookings page entry sharing the bookings/allocations id space. */
function confirmedBooking(
  id: string,
  personId: string,
  minutes: number,
  day: string,
): unknown {
  return {
    id,
    type: "bookings",
    attributes: {
      booking_method_id: 1,
      time: minutes,
      total_time: minutes,
      percentage: null,
      started_on: day,
      ended_on: day,
      draft: false,
      canceled: false,
      total_working_days: 1,
    },
    relationships: {
      person: { data: { id: personId, type: "people" } },
      service: { data: { id: "svc-" + id, type: "services" } },
      event: { data: null },
      task: { meta: { included: false } },
    },
  };
}

describe("gather (composition root — pull → validate → map → assess → assemble)", () => {
  it("happy path: returns a well-formed result with empty sourceErrors", async () => {
    const out = await gather(
      depsWith({
        "/bookings": OK(loadBookingsFixture()),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );

    assert.deepEqual(out.sourceErrors, []);
    assert.ok(Array.isArray(out.bookings));
    assert.ok(Array.isArray(out.absences));
    assert.ok(Array.isArray(out.briefFlags));
    assert.ok(out.holidays instanceof Set);
    // All three queried designers are covered by a successful pull.
    assert.equal(out.assessedDesigners.length, DESIGNER_PERSON_IDS.length);
  });

  it("dated output: every booking carries a window-day `date` string", async () => {
    const out = await gather(
      depsWith({
        "/bookings": OK(loadBookingsFixture()),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    for (const b of out.bookings) {
      assert.equal(typeof b.date, "string");
      assert.match(b.date as string, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("client error on bookings → empty bookings + non-empty sourceErrors + NO throw (T-02-14)", async () => {
    const out = await gather(
      depsWith({
        "/bookings": ERR("HTTP 403"),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    assert.deepEqual(out.bookings, []);
    assert.deepEqual(out.absences, []);
    assert.ok(out.sourceErrors.length > 0);
    assert.match(out.sourceErrors[0], /bookings pull failed/);
    // A failed pull reached nobody → no assessed designers.
    assert.deepEqual(out.assessedDesigners, []);
  });

  it("workflow_statuses error degrades brief resolution only (capacity still computes)", async () => {
    const out = await gather(
      depsWith({
        "/bookings": OK(loadBookingsFixture()),
        "/workflow_statuses": ERR("HTTP 500"),
      }),
    );
    // bookings still mapped; the wf error is surfaced but not fatal.
    assert.ok(out.sourceErrors.some((e) => /workflow_statuses/.test(e)));
    assert.ok(out.assessedDesigners.length === DESIGNER_PERSON_IDS.length);
  });

  it("partial pull: a failed bookings pull → report.missingDesigners names the whole roster (T-02-15)", async () => {
    const roster = DESIGNER_PERSON_IDS.map((id) => id as DesignerId);
    const out = await gather(
      depsWith({
        "/bookings": ERR("network down"),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    // gather reached nobody, so assessedDesigners is empty…
    assert.deepEqual(out.assessedDesigners, []);
    // …and the report surfaces every rostered designer as missing (not silently complete).
    const report = computeStudioReport({
      now: NOW,
      holidays: out.holidays,
      roster,
      bookings: out.bookings,
      absences: out.absences,
      assessedDesigners: out.assessedDesigners,
    });
    assert.deepEqual([...report.missingDesigners].sort(), [...roster].sort());
  });

  it("end-to-end: gather output feeds computeStudioReport → well-formed report, no throw", async () => {
    const roster = DESIGNER_PERSON_IDS.map((id) => id as DesignerId);
    const out = await gather(
      depsWith({
        "/bookings": OK(loadBookingsFixture()),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    const report = computeStudioReport({
      now: NOW,
      holidays: out.holidays,
      roster,
      bookings: out.bookings,
      absences: out.absences,
      assessedDesigners: out.assessedDesigners,
    });
    // Well-formed: one designer result per rostered designer, no missing on a full pull.
    assert.equal(report.designers.length, roster.length);
    assert.deepEqual(report.missingDesigners, []);
    assert.equal(report.targetDay, "2026-06-04");
    assert.ok(typeof report.rollup.totalMin === "number");
  });

  it("GAP-CLOSURE: an allocation-only record becomes a tentative booking (NOT counted as confirmed)", async () => {
    const TARGET = "2026-06-04";
    const person = DESIGNER_PERSON_IDS[1]; // Anisha 686712
    // id "100" is confirmed (in BOTH bookings + allocations) → 300 min confirmed.
    // id "200" is allocation-ONLY (absent from /bookings) → tentative 210 min.
    const out = await gather(
      depsWith({
        "/bookings": OK({
          data: [confirmedBooking("100", person, 300, TARGET)],
          included: [],
        }),
        "/allocations": OK({
          data: [
            allocation("100", person, "service", 300, TARGET), // same id → confirmed, skip
            allocation("200", person, "service", 210, TARGET), // allocation-only → tentative
          ],
          included: [],
        }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    assert.deepEqual(out.sourceErrors, []);

    const targetBookings = out.bookings.filter((b) => b.date === TARGET);
    const confirmed = targetBookings.filter((b) => !b.isTentative);
    const tentative = targetBookings.filter((b) => b.isTentative);

    // The shared id is confirmed once (not double-counted); 200 is tentative.
    assert.equal(confirmed.reduce((s, b) => s + b.minutes, 0), 300);
    assert.equal(tentative.reduce((s, b) => s + b.minutes, 0), 210);
    assert.ok(tentative.length === 1);
    assert.equal(tentative[0].isTentative, true);
  });

  it("GAP-CLOSURE: tentative time sets shaky + never closes the open gap (capacity machinery)", async () => {
    const TARGET = "2026-06-04";
    const person = DESIGNER_PERSON_IDS[1] as DesignerId; // Anisha 686712
    const roster = [person];
    const out = await gather(
      depsWith({
        "/bookings": OK({ data: [], included: [] }), // zero confirmed
        "/allocations": OK({
          data: [allocation("200", person, "service", 210, TARGET)], // 3.5h tentative
          included: [],
        }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    const report = computeStudioReport({
      now: NOW,
      holidays: out.holidays,
      roster,
      bookings: out.bookings,
      absences: out.absences,
      assessedDesigners: [person],
    });
    const dr = report.designers.find((d) => d.designerId === person);
    assert.ok(dr, "designer result present");
    assert.equal(dr!.confirmedMin, 0); // tentative NEVER counts as confirmed
    assert.equal(dr!.tentativeMin, 210);
    assert.equal(dr!.shaky, true);
    assert.equal(dr!.status, "underbooked");
    assert.equal(dr!.openMin, 450); // full open gap — tentative does not close it
  });

  it("GAP-CLOSURE: an allocation-only EVENT (absence) is IGNORED (no synthesized tentative absence)", async () => {
    const TARGET = "2026-06-04";
    const person = DESIGNER_PERSON_IDS[1]; // Anisha 686712
    const out = await gather(
      depsWith({
        "/bookings": OK({ data: [], included: [] }),
        "/allocations": OK({
          data: [allocation("300", person, "event", 450, TARGET)], // event-type, allocation-only
          included: [],
        }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    // No tentative work synthesized AND no absence synthesized from an event allocation.
    assert.deepEqual(out.bookings, []);
    assert.deepEqual(out.absences, []);
  });

  it("GAP-CLOSURE: an allocations pull failure degrades (sourceError) — confirmed still flows, no throw", async () => {
    const out = await gather(
      depsWith({
        "/bookings": OK(loadBookingsFixture()),
        "/allocations": ERR("HTTP 500"),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    assert.ok(out.sourceErrors.some((e) => /allocations/.test(e)));
    // Confirmed bookings still present (the fixture has work bookings).
    assert.ok(out.assessedDesigners.length === DESIGNER_PERSON_IDS.length);
  });

  it("never throws even when every source fails (degrade contract)", async () => {
    await assert.doesNotReject(async () => {
      const out = await gather(
        depsWith({
          "/bookings": ERR("boom"),
          "/workflow_statuses": ERR("boom"),
        }),
      );
      assert.ok(out.sourceErrors.length > 0);
    });
  });
});
