/**
 * Tests for the working-day clock (src/domain/clock.ts).
 *
 * Every `now` is constructed via DateTime.fromISO("...", { zone: STUDIO_ZONE })
 * so the suite is fully deterministic — no system clock, no mock timers
 * (RESEARCH Pattern 1 / Pitfall 4). Holidays are injected as a Set of
 * "yyyy-MM-dd" studio-zone date keys.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { nextWorkingDay, isWorkingDay, restOfWeekWindow } from "../clock.ts";
import { STUDIO_ZONE } from "../types.ts";

const sydney = (iso: string): DateTime =>
  DateTime.fromISO(iso, { zone: STUDIO_ZONE });

describe("nextWorkingDay", () => {
  it("rolls a Friday-evening run forward to Monday (Friday→Monday, SCHED-03)", () => {
    // Fri 2026-06-05 16:30 → skip Sat 06-06, Sun 06-07 → Mon 2026-06-08.
    const fri = sydney("2026-06-05T16:30:00");
    assert.equal(nextWorkingDay(fri, new Set()).toISODate(), "2026-06-08");
  });

  it("skips an injected holiday on the would-be target (holiday-eve)", () => {
    // Tue 2026-06-09 16:30 → Wed 06-10 is the injected holiday → Thu 2026-06-11.
    const tue = sydney("2026-06-09T16:30:00");
    assert.equal(
      nextWorkingDay(tue, new Set(["2026-06-10"])).toISODate(),
      "2026-06-11",
    );
  });

  it("is correct across the Sydney DST-end boundary (DST-boundary, SCHED-04)", () => {
    // Fri 2026-04-03 16:30 → skip Sat 04-04 and Sun 04-05 (Sydney 2026 DST end,
    // AEDT→AEST changeover) → Mon 2026-04-06. Calendar-day math must not drift.
    const friBeforeDst = sydney("2026-04-03T16:30:00");
    assert.equal(nextWorkingDay(friBeforeDst, new Set()).toISODate(), "2026-04-06");
  });

  it("advances a plain weekday to the next weekday", () => {
    // Tue 2026-06-09 → Wed 2026-06-10 (no holidays).
    const tue = sydney("2026-06-09T16:30:00");
    assert.equal(nextWorkingDay(tue, new Set()).toISODate(), "2026-06-10");
  });

  it("never reads the system clock — same input yields same output", () => {
    const fri = sydney("2026-06-05T16:30:00");
    assert.equal(
      nextWorkingDay(fri, new Set()).toISODate(),
      nextWorkingDay(fri, new Set()).toISODate(),
    );
  });
});

describe("isWorkingDay", () => {
  it("returns false for Saturday", () => {
    assert.equal(isWorkingDay(sydney("2026-06-06T00:00:00"), new Set()), false);
  });

  it("returns false for Sunday", () => {
    assert.equal(isWorkingDay(sydney("2026-06-07T00:00:00"), new Set()), false);
  });

  it("returns false for a weekday present in the holiday set", () => {
    assert.equal(
      isWorkingDay(sydney("2026-06-10T00:00:00"), new Set(["2026-06-10"])),
      false,
    );
  });

  it("returns true for a plain weekday with no holidays", () => {
    assert.equal(isWorkingDay(sydney("2026-06-09T00:00:00"), new Set()), true);
  });
});

describe("restOfWeekWindow", () => {
  it("covers a Tuesday target through Friday (Tue-run, D-07) — length 4", () => {
    const tue = sydney("2026-06-09T16:30:00").startOf("day");
    const window = restOfWeekWindow(tue, new Set());
    assert.deepEqual(
      window.map((d) => d.toISODate()),
      ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"],
    );
    assert.equal(window.length, 4);
  });

  it("covers the whole week from a Monday target (Friday-rollover, D-08) — length 5", () => {
    const mon = sydney("2026-06-08T16:30:00").startOf("day");
    const window = restOfWeekWindow(mon, new Set());
    assert.deepEqual(
      window.map((d) => d.toISODate()),
      ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"],
    );
    assert.equal(window.length, 5);
  });

  it("excludes a holiday inside the window (D-10) — length 3", () => {
    const tue = sydney("2026-06-09T16:30:00").startOf("day");
    const window = restOfWeekWindow(tue, new Set(["2026-06-11"]));
    assert.deepEqual(
      window.map((d) => d.toISODate()),
      ["2026-06-09", "2026-06-10", "2026-06-12"],
    );
    assert.equal(window.length, 3);
  });
});
