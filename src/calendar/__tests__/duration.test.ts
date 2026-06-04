/**
 * Tests for the pure duration humanizer `humanizeDuration` (quick 260604-lco, Task 1).
 *
 * humanizeDuration turns a meeting length in minutes into a short human label for
 * the 📅 worth-a-look sub-line ("1 hour", "30 min", "1.5 hours", "1h 15m"). It is
 * PRESENTATION-ONLY formatting of a start↔end diff — it never feeds capacity/hour
 * arithmetic and reads no clock (CLAUDE.md trust rule). These tests pin every band
 * plus the two documented rounding cases.
 *
 * node:test + node:assert/strict, fully offline.
 * Run: node --import tsx --test src/calendar/__tests__/duration.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { humanizeDuration } from "../duration.ts";

describe("humanizeDuration — minute band (1..59, not whole/half hour)", () => {
  it("25 → '25 min'", () => assert.equal(humanizeDuration(25), "25 min"));
  it("45 → '45 min'", () => assert.equal(humanizeDuration(45), "45 min"));
  it("1 → '1 min'", () => assert.equal(humanizeDuration(1), "1 min"));
  it("30 → '30 min' (half hour reads better as minutes)", () =>
    assert.equal(humanizeDuration(30), "30 min"));
});

describe("humanizeDuration — exact whole hours", () => {
  it("60 → '1 hour' (singular)", () => assert.equal(humanizeDuration(60), "1 hour"));
  it("120 → '2 hours'", () => assert.equal(humanizeDuration(120), "2 hours"));
  it("180 → '3 hours'", () => assert.equal(humanizeDuration(180), "3 hours"));
});

describe("humanizeDuration — exact half hours (h ≥ 1)", () => {
  it("90 → '1.5 hours'", () => assert.equal(humanizeDuration(90), "1.5 hours"));
  it("150 → '2.5 hours'", () => assert.equal(humanizeDuration(150), "2.5 hours"));
});

describe("humanizeDuration — mixed h+m", () => {
  it("75 → '1h 15m'", () => assert.equal(humanizeDuration(75), "1h 15m"));
  it("100 → '1h 40m'", () => assert.equal(humanizeDuration(100), "1h 40m"));
  it("125 → '2h 5m'", () => assert.equal(humanizeDuration(125), "2h 5m"));
});

describe("humanizeDuration — rounds to nearest minute first", () => {
  it("89.6 → 90 → '1.5 hours'", () => assert.equal(humanizeDuration(89.6), "1.5 hours"));
  it("59.4 → 59 → '59 min'", () => assert.equal(humanizeDuration(59.4), "59 min"));
});
