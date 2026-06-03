/**
 * Tests for the Productive boundary: zod schemas + the non-throwing client (Task 3, plan 02-01).
 *
 * These pin the trust-critical boundary behaviour:
 *  - the captured real /bookings fixture parses under JsonApiPage (ground truth);
 *  - a malformed page (missing meta.total_pages) safeParses to .success === false
 *    (degrades, never throws);
 *  - a booking using the OLD field name (is_draft) FAILS the corrected schema
 *    (guards against the Pitfall-1 field-name regression);
 *  - getJson returns a Result error on a non-ok fetch AND on a thrown fetch,
 *    never throwing across the boundary.
 *
 * Run: node --import tsx --test "src/productive/__tests__/schemas.test.ts"
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { JsonApiPage, BookingResource, AllocationResource } from "../schemas.ts";
import { getJson } from "../client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "..", "__fixtures__", "bookings-page.json");

describe("JsonApiPage schema (boundary validation)", () => {
  it("parses the captured real /bookings fixture (success)", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const parsed = JsonApiPage.safeParse(raw);
    assert.equal(parsed.success, true);
  });

  it("safeParses a malformed page (missing meta.total_pages) to success === false", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    delete raw.meta.total_pages;
    const parsed = JsonApiPage.safeParse(raw);
    assert.equal(parsed.success, false);
  });
});

describe("BookingResource schema (corrected field names — Pitfall 1)", () => {
  it("accepts a booking with the corrected names (booking_method_id/draft/canceled)", () => {
    // Mirrors the LIVE shape confirmed in Task 4: no booking_type / approval_status
    // attributes; work-vs-absence is the service/event relationship; un-included
    // relationships arrive as { meta: { included: false } }.
    const good = {
      id: "1",
      type: "bookings",
      attributes: {
        booking_method_id: 1,
        time: 240,
        total_time: null,
        percentage: null,
        started_on: "2026-06-03",
        ended_on: "2026-06-03",
        draft: false,
        canceled: false,
        approved: true,
        rejected: false,
        total_working_days: 1,
      },
      relationships: {
        service: { data: { id: "7", type: "services" } },
        event: { data: null },
        person: { meta: { included: false } },
        task: { data: { id: "5", type: "tasks" } },
        organization: { data: { id: "34092", type: "organizations" } },
      },
    };
    assert.equal(BookingResource.safeParse(good).success, true);
  });

  it("rejects a booking using the OLD name is_draft (regression guard)", () => {
    const old = {
      id: "1",
      type: "bookings",
      attributes: {
        booking_method_id: 1,
        time: 240,
        total_time: null,
        percentage: null,
        started_on: "2026-06-03",
        ended_on: "2026-06-03",
        is_draft: false, // OLD name — `draft`/`canceled` are required, so this must fail
        is_canceled: false,
      },
      relationships: {},
    };
    assert.equal(BookingResource.safeParse(old).success, false);
  });
});

describe("AllocationResource schema (tentative-capture boundary — GAP-CLOSURE)", () => {
  it("accepts a live-shaped /allocations record (service work, un-included person)", () => {
    // Mirrors the LIVE allocation confirmed against org 34092 (allocation
    // 31811360 = Anisha, 2026-06-04, 210 min, client Dairy Farmers). Allocations
    // expose booking_type ("service"|"event") as a real ATTRIBUTE (unlike
    // /bookings, where work-vs-absence is the service/event relationship), and
    // carry NO task/project relationship. Un-included relationships arrive as
    // { meta: { included: false } } — same JSON:API shape as bookings.
    const good = {
      id: "31811360",
      type: "allocations",
      attributes: {
        booking_method_id: 1,
        time: 210,
        total_time: 210,
        percentage: null,
        started_on: "2026-06-04",
        ended_on: "2026-06-04",
        total_working_days: 1,
        booking_type: "service",
      },
      relationships: {
        person: { data: { id: "686712", type: "people" } },
        service: { data: { id: "9001", type: "services" } },
        event: { data: null },
        client: { meta: { included: false } },
        responsible: { meta: { included: false } },
      },
    };
    assert.equal(AllocationResource.safeParse(good).success, true);
  });

  it("accepts an absence-type allocation (booking_type 'event')", () => {
    const event = {
      id: "42",
      type: "allocations",
      attributes: {
        booking_method_id: 1,
        time: 450,
        total_time: 450,
        percentage: null,
        started_on: "2026-06-04",
        ended_on: "2026-06-04",
        total_working_days: 1,
        booking_type: "event",
      },
      relationships: {
        person: { data: { id: "686712", type: "people" } },
        event: { data: { id: "777", type: "events" } },
      },
    };
    assert.equal(AllocationResource.safeParse(event).success, true);
  });

  it("rejects a record missing required figure fields (degrades, never throws)", () => {
    const bad = {
      id: "1",
      type: "allocations",
      attributes: {
        // booking_method_id missing → must fail (degrade to a skip, not a crash)
        started_on: "2026-06-04",
        ended_on: "2026-06-04",
      },
      relationships: {},
    };
    assert.equal(AllocationResource.safeParse(bad).success, false);
  });
});

describe("getJson (non-throwing Result client)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns { ok:false } on a non-ok HTTP response (never throws)", async () => {
    globalThis.fetch = (async () =>
      new Response("forbidden", { status: 403 })) as typeof fetch;
    const r = await getJson("https://api.productive.io/api/v2/people/686717", {});
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /403/);
  });

  it("returns { ok:false } when fetch throws (never throws)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const r = await getJson("https://api.productive.io/api/v2/people/686717", {});
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /network down/);
  });

  it("returns { ok:true, value } on a successful response", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const r = await getJson("https://api.productive.io/api/v2/bookings", {});
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, { data: [] });
  });
});
