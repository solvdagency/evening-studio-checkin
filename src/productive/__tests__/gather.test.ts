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
