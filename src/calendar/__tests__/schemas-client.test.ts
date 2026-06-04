/**
 * Boundary tests for the calendar zod schema + the non-throwing events client
 * (Task 2, plan 04-01).
 *
 * These mirror the Productive boundary posture: the zod schema validates ONLY
 * the fields this phase reads and is tolerant of unknown Google fields; the
 * client wraps `events.list` so a thrown googleapis client becomes a Result
 * VALUE (never an exception), and the error string carries status/message only —
 * NEVER the SA private key. No network and no credentials are used: the client
 * is exercised with a hand-stubbed `events.list`.
 *
 * Run: node --import tsx --test src/calendar/__tests__/schemas-client.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CalendarEventResource } from "../schemas.ts";
import { listDayEvents } from "../client.ts";

describe("CalendarEventResource (tolerant zod boundary)", () => {
  it("an event with only an id parses", () => {
    const r = CalendarEventResource.safeParse({ id: "x" });
    assert.equal(r.success, true);
  });

  it("an event with no id fails", () => {
    const r = CalendarEventResource.safeParse({});
    assert.equal(r.success, false);
  });

  it("unknown extra Google fields are tolerated (still parses)", () => {
    const r = CalendarEventResource.safeParse({
      id: "x",
      summary: "FDC catch up",
      start: { dateTime: "2026-06-05T14:30:00+10:00", timeZone: "Australia/Sydney", weirdNewField: 1 },
      attendees: [{ self: true, responseStatus: "needsAction", futureField: "v" }],
      someBrandNewTopLevelField: { nested: true },
    });
    assert.equal(r.success, true);
  });
});

describe("listDayEvents (non-throwing events client)", () => {
  /** A stub googleapis calendar client whose events.list resolves with items. */
  const okClient = {
    events: {
      list: async () => ({ data: { items: [{ id: "e1" }, { id: "e2" }] } }),
    },
  };

  /**
   * A stub client whose events.list throws a REALISTIC googleapis auth error.
   * A real DWD/JWT failure surfaces an `invalid_grant`/status message — it never
   * contains the private key. The client surfaces `e.message` only, so the
   * Result error string must likewise carry no key material.
   */
  const throwingClient = {
    events: {
      list: async () => {
        throw new Error("invalid_grant: Invalid grant (status 400)");
      },
    },
  };

  it("success → { ok: true, value: items }", async () => {
    const res = await listDayEvents(okClient as never, "a", "b");
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.value.length, 2);
  });

  it("missing items → { ok: true, value: [] }", async () => {
    const empty = { events: { list: async () => ({ data: {} }) } };
    const res = await listDayEvents(empty as never, "a", "b");
    assert.equal(res.ok, true);
    if (res.ok) assert.deepEqual(res.value, []);
  });

  it("a thrown client → { ok: false } (never throws across the boundary)", async () => {
    const res = await listDayEvents(throwingClient as never, "a", "b");
    assert.equal(res.ok, false);
  });

  it("the error string carries no SA key material (no 'private_key' / 'BEGIN')", async () => {
    const res = await listDayEvents(throwingClient as never, "a", "b");
    assert.equal(res.ok, false);
    if (!res.ok) {
      // SECURITY (T-04-01): the client surfaces only status/message — never the
      // SA key. Pin that the error string contains no key material regardless of
      // upstream, mirroring the Productive client's "no headers in error" rule.
      assert.ok(!res.error.includes("private_key"));
      assert.ok(!res.error.includes("BEGIN"));
      assert.equal(typeof res.error, "string");
    }
  });
});
