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
  const path = fileURLToPath(new URL("../__fixtures__/bookings-page.json", import.meta.url));
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    data: unknown[];
    included?: unknown[];
  };
  return { data: raw.data, included: raw.included ?? [] };
}

/** A minimal /workflow_statuses pull: SOLVD Standard Briefed at position 3. */
function workflowStatusesPage(): Page {
  const status = (id: string, name: string, position: number, workflowId: string) => ({
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
  canceled: boolean = false,
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
      canceled,
    },
    relationships: {
      person: { data: { id: personId, type: "people" } },
      service:
        bookingType === "service"
          ? { data: { id: "svc-" + id, type: "services" } }
          : { data: null },
      event:
        bookingType === "event" ? { data: { id: "evt-" + id, type: "events" } } : { data: null },
    },
  };
}

/** A confirmed /bookings page entry sharing the bookings/allocations id space. */
function confirmedBooking(id: string, personId: string, minutes: number, day: string): unknown {
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

/**
 * A /bookings entry whose `person` relationship is NOT included (the exact
 * 02-04 include-set failure mode). designerId resolves to "" → the row must
 * NOT count its designer as assessed (CR-02).
 */
function bookingWithMissingPerson(id: string, minutes: number, day: string): unknown {
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
      person: { meta: { included: false } }, // person link absent → designerId ""
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
    assert.equal(
      confirmed.reduce((s, b) => s + b.minutes, 0),
      300,
    );
    assert.equal(
      tentative.reduce((s, b) => s + b.minutes, 0),
      210,
    );
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

  it("CR-01: a CANCELED allocation-only record is NOT synthesized as tentative work; a non-canceled one still is", async () => {
    const TARGET = "2026-06-04";
    const person = DESIGNER_PERSON_IDS[1]; // Anisha 686712
    // id "400" is allocation-only AND canceled → must NOT become tentative work.
    // id "500" is allocation-only and NOT canceled → must become tentative work.
    const out = await gather(
      depsWith({
        "/bookings": OK({ data: [], included: [] }), // zero confirmed
        "/allocations": OK({
          data: [
            allocation("400", person, "service", 300, TARGET, true), // canceled → phantom, exclude
            allocation("500", person, "service", 210, TARGET, false), // live tentative → include
          ],
          included: [],
        }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    assert.deepEqual(out.sourceErrors, []);

    const targetBookings = out.bookings.filter((b) => b.date === TARGET);
    const tentative = targetBookings.filter((b) => b.isTentative);

    // Only the non-canceled allocation (500 → 210 min) survives; the canceled
    // 300 min must not inflate the tentative/shaky figure.
    assert.equal(tentative.length, 1);
    assert.equal(
      tentative.reduce((s, b) => s + b.minutes, 0),
      210,
    );
  });

  it("CR-01 regression: the /allocations query omits filter[canceled] (Productive returns HTTP 400 'unsupported_filter' on that endpoint; canceled exclusion is client-side per the test above)", async () => {
    const queryByPath: Record<string, string> = {};
    await gather({
      now: NOW,
      fetchPages: async (path: string, query: string): Promise<Result<Page>> => {
        queryByPath[path] = query;
        return { ok: true, value: { data: [], included: [] } };
      },
    });
    assert.ok(queryByPath["/allocations"] !== undefined, "the /allocations endpoint was queried");
    assert.ok(
      !queryByPath["/allocations"].includes("filter[canceled]"),
      `the /allocations query must omit filter[canceled] (live: HTTP 400 unsupported_filter); got: ${queryByPath["/allocations"]}`,
    );
    // The supported date-window filters must remain — proves we stripped only the bad param.
    assert.ok(queryByPath["/allocations"].includes("filter[after]"));
    assert.ok(queryByPath["/allocations"].includes("filter[before]"));
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

  it("CR-02: a row with a missing person link does not count its designer as assessed → report.missingDesigners (T-02-15)", async () => {
    const TARGET = "2026-06-04";
    const roster = DESIGNER_PERSON_IDS.map((id) => id as DesignerId);
    const reached = DESIGNER_PERSON_IDS[0]; // Liam 686717 — has a resolved row
    // Only ONE designer (index 0) has a row with a resolved person id. The pull
    // also returned a row whose person link is missing (resolves to ""), which
    // must NOT make any other designer look assessed-but-empty.
    const out = await gather(
      depsWith({
        "/bookings": OK({
          data: [
            confirmedBooking("100", reached, 300, TARGET), // resolved → reached assessed
            bookingWithMissingPerson("999", 240, TARGET), // person-less → contributes to nobody
          ],
          included: [],
        }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    // The person-less row is dropped and recorded (not silently attributed to "").
    assert.ok(
      out.sourceErrors.some((e) => /no rostered person/.test(e)),
      "person-less row recorded as a sourceError",
    );
    // Coverage-based assessment (supersedes T-02-15's row-based rule; live-corrected
    // 2026-06-04). The /bookings pull is person-scoped to the whole roster and it
    // SUCCEEDED, so all three designers were reached. The person-less row is still
    // dropped (recorded above), but the two designers with no rows of their own are
    // reached-but-empty (assessed), NOT missing.
    assert.deepEqual([...out.assessedDesigners].sort(), [...roster].sort());

    const report = computeStudioReport({
      now: NOW,
      holidays: out.holidays,
      roster,
      bookings: out.bookings,
      absences: out.absences,
      assessedDesigners: out.assessedDesigners,
    });
    // A successful pull means nobody is "missing" — empty designers are open, not unread.
    assert.deepEqual([...report.missingDesigners], []);
    // The anti-phantom guard still holds: the person-less 240 min reached NO figure,
    // so total confirmed across designers is the reached designer's 300 min alone.
    const totalConfirmed = report.designers.reduce((s, d) => s + d.confirmedMin, 0);
    assert.equal(totalConfirmed, 300, "person-less 240 min attributed to nobody");
  });

  it("live-corrected (Fri-5-Jun regression): a successful pull with ZERO rows for a designer assesses them as open, not 'couldn't read'", async () => {
    // Mirrors the live smoke post: /bookings empty, /allocations has rows for only
    // ONE designer; the other two have no rows anywhere. Because the pull SUCCEEDED
    // and is person-scoped to the roster, all three are reached → the two empty
    // designers are assessed (→ open/underbooked), NOT missing/"couldn't read".
    const TARGET = "2026-06-04";
    const onlyOne = DESIGNER_PERSON_IDS[2]; // Ella
    const roster = DESIGNER_PERSON_IDS.map((id) => id as DesignerId);
    const out = await gather(
      depsWith({
        "/bookings": OK({ data: [], included: [] }),
        "/allocations": OK({
          data: [allocation("e1", onlyOne, "service", 150, TARGET)],
          included: [],
        }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    assert.deepEqual(out.sourceErrors, []);
    assert.deepEqual([...out.assessedDesigners].sort(), [...DESIGNER_PERSON_IDS].sort());

    const report = computeStudioReport({
      now: NOW,
      holidays: out.holidays,
      roster,
      bookings: out.bookings,
      absences: out.absences,
      assessedDesigners: out.assessedDesigners,
    });
    assert.deepEqual([...report.missingDesigners], []);
    assert.equal(report.designers.length, 3);
  });

  it("CR-02: a designer reached with ZERO bookings is still assessed (reached, not missing)", async () => {
    // All three designers are reached via allocations (one resolved row each),
    // even though none has a confirmed booking. Reached ⟺ a resolved row exists
    // across bookings AND allocations, NOT whether they had confirmed work.
    const TARGET = "2026-06-04";
    const out = await gather(
      depsWith({
        "/bookings": OK({ data: [], included: [] }),
        "/allocations": OK({
          data: DESIGNER_PERSON_IDS.map((pid, i) =>
            allocation("alloc" + i, pid, "service", 60, TARGET),
          ),
          included: [],
        }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    assert.deepEqual(out.sourceErrors, []);
    assert.deepEqual([...out.assessedDesigners].sort(), [...DESIGNER_PERSON_IDS].sort());
  });

  it("Open Q1: bookedClientsByDesignerDay surfaces target-day company ids from already-fetched included", async () => {
    const TARGET = "2026-06-04";
    const person = DESIGNER_PERSON_IDS[0]; // Liam 686717
    // A confirmed target-day booking linked to a task → project → company (1333899).
    const booking = {
      id: "b-fdc",
      type: "bookings",
      attributes: {
        booking_method_id: 1,
        time: 360,
        total_time: 360,
        percentage: null,
        started_on: TARGET,
        ended_on: TARGET,
        draft: false,
        canceled: false,
        total_working_days: 1,
      },
      relationships: {
        person: { data: { id: person, type: "people" } },
        service: { data: { id: "svc-fdc", type: "services" } },
        event: { data: null },
        task: { data: { id: "t-fdc", type: "tasks" } },
      },
    };
    const included = [
      {
        id: "t-fdc",
        type: "tasks",
        attributes: {
          title: "FDC IPO Launch Video",
          description: "brief",
          workflow_status_id: 3,
          workflow_id: 1,
        },
        relationships: { project: { data: { id: "p-fdc", type: "projects" } } },
      },
      {
        id: "p-fdc",
        type: "projects",
        attributes: { project_type_id: 2 },
        relationships: { company: { data: { id: "1333899", type: "companies" } } },
      },
      { id: "1333899", type: "companies", attributes: { name: "FDC Construction" } },
    ];
    const out = await gather(
      depsWith({
        "/bookings": OK({ data: [booking], included }),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    const map = out.bookedClientsByDesignerDay;
    assert.ok(map, "bookedClientsByDesignerDay present");
    // Every assessed designer is initialised to a Set (empty, not undefined).
    for (const id of DESIGNER_PERSON_IDS) {
      assert.ok(map[id] instanceof Set, `set for ${id}`);
    }
    // Liam's set carries the FDC company id for the target day.
    assert.ok(map[person].has("1333899"));
    // A designer with no client booking has an EMPTY set (not undefined).
    assert.equal(map[DESIGNER_PERSON_IDS[1]].size, 0);
  });

  it("bookedClientsByDesignerDay is an empty-Set record on a degraded (failed) pull", async () => {
    const out = await gather(
      depsWith({
        "/bookings": ERR("HTTP 403"),
        "/workflow_statuses": OK(workflowStatusesPage()),
      }),
    );
    // degraded() returns {} for the map (no assessed designers).
    assert.ok(out.bookedClientsByDesignerDay);
    assert.deepEqual(out.bookedClientsByDesignerDay, {});
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
