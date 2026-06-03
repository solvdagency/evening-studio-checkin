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

import { JsonApiPage, BookingResource } from "../schemas.ts";
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
        booking_type: "service",
        approval_status: null,
      },
      relationships: {},
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
        is_draft: false, // OLD name — `draft` is now required, so this must fail
        is_canceled: false,
        booking_type: "service",
        approval_status: null,
      },
      relationships: {},
    };
    assert.equal(BookingResource.safeParse(old).success, false);
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
