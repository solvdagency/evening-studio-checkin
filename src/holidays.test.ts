/**
 * Tests for the HolidaySet builder (src/holidays.ts, Task 1 plan 02-02).
 *
 * The HolidaySet is the contract the Phase-1 clock consumes (ReadonlySet of
 * "yyyy-MM-dd" studio-zone keys). These tests pin down D-13: NSW public holidays
 * from `date-holidays` plus committed studio closures, with keys that EXACTLY
 * match the clock's `toISODate()` output (Pitfall 4 — no time component, no space).
 *
 * Run: node --import tsx --test "src/holidays.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { buildHolidaySet, yearsForWindow } from "./holidays.ts";
import { STUDIO_ZONE } from "./domain/types.ts";
import { isWorkingDay } from "./domain/clock.ts";

describe("buildHolidaySet (D-13) — NSW public holidays", () => {
  it("contains Australia Day 2026 as the exact key '2026-01-26'", () => {
    const set = buildHolidaySet([2026], []);
    assert.equal(set.has("2026-01-26"), true);
  });

  it("produces keys in the clock's toISODate() format (no time, no space)", () => {
    const set = buildHolidaySet([2026], []);
    for (const key of set) {
      // toISODate() shape: yyyy-MM-dd, exactly 10 chars, no whitespace.
      assert.match(key, /^\d{4}-\d{2}-\d{2}$/, `key "${key}" is not a bare yyyy-MM-dd`);
    }
  });

  it("a holiday key makes the clock treat that weekday as a non-working day", () => {
    const set = buildHolidaySet([2026], []);
    // 2026-01-26 (Australia Day) is a Monday — a weekday that must now be non-working.
    const australiaDay = DateTime.fromISO("2026-01-26", { zone: STUDIO_ZONE });
    assert.equal(australiaDay.weekday <= 5, true, "fixture date must be a weekday");
    assert.equal(isWorkingDay(australiaDay, set), false);
  });
});

describe("buildHolidaySet (D-13) — studio closures merge", () => {
  it("merges committed STUDIO_CLOSURES into the same set", () => {
    const closures = ["2026-12-28", "2026-12-29"];
    const set = buildHolidaySet([2026], closures);
    assert.equal(set.has("2026-12-28"), true);
    assert.equal(set.has("2026-12-29"), true);
  });

  it("an empty closures list still yields the public holidays", () => {
    const set = buildHolidaySet([2026], []);
    assert.equal(set.size > 0, true);
    assert.equal(set.has("2026-01-26"), true);
  });
});

describe("buildHolidaySet (D-13) — multi-year enumeration", () => {
  it("covers a December→January window across two years", () => {
    // A late-December Friday run targets early-January next year, so the set must
    // hold holidays from BOTH years (RESEARCH line 360).
    const set = buildHolidaySet([2026, 2027], []);
    assert.equal(set.has("2026-01-26"), true); // Australia Day 2026
    assert.equal(set.has("2027-01-26"), true); // Australia Day 2027
  });
});

describe("yearsForWindow helper", () => {
  it("returns the target year and the next year", () => {
    const target = DateTime.fromISO("2026-12-31", { zone: STUDIO_ZONE });
    assert.deepEqual(yearsForWindow(target), [2026, 2027]);
  });

  it("a mid-year target still includes next year (cheap, harmless coverage)", () => {
    const target = DateTime.fromISO("2026-06-03", { zone: STUDIO_ZONE });
    assert.deepEqual(yearsForWindow(target), [2026, 2027]);
  });
});

describe("buildHolidaySet (D-13) — only public holidays", () => {
  it("does not blow up enumerating a year and returns a non-empty public-only set", () => {
    // date-holidays emits non-"public" types (bank, observance, optional...).
    // We can't assert a specific excluded name portably, but we CAN assert the
    // builder filters to public holidays only by checking a known bank/observance
    // day is absent while the public Australia Day is present.
    const set = buildHolidaySet([2026], []);
    assert.equal(set.has("2026-01-26"), true, "public Australia Day present");
    // Valentine's Day (2026-02-14) is an observance, never a NSW public holiday.
    assert.equal(set.has("2026-02-14"), false, "non-public observance excluded");
  });
});
