/**
 * Tests for the quarter-hour rounding helper (Task 1, plan 01-02).
 *
 * Covers the documented round-half-up, display-only behaviour (D-16):
 *   - minutesToHours converts exact minutes to unrounded decimal hours.
 *   - roundToQuarterHour snaps decimal hours to the nearest 0.25h, half-up.
 *   - the two compose: roundToQuarterHour(minutesToHours(min)).
 *
 * Run: node --import tsx --test "src/domain/__tests__/round.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { minutesToHours, roundToQuarterHour } from "../round.ts";

describe("minutesToHours", () => {
  it("converts the 450-minute target to exactly 7.5h", () => {
    assert.equal(minutesToHours(450), 7.5);
  });

  it("converts 0 minutes to 0 hours", () => {
    assert.equal(minutesToHours(0), 0);
  });

  it("converts 465 minutes to 7.75h (no rounding here — exact division)", () => {
    assert.equal(minutesToHours(465), 7.75);
  });
});

describe("roundToQuarterHour", () => {
  it("rounds 6.40 up to 6.5 (round-half-up at 0.25 granularity)", () => {
    assert.equal(roundToQuarterHour(6.4), 6.5);
  });

  it("rounds 6.10 down to 6.0", () => {
    assert.equal(roundToQuarterHour(6.1), 6.0);
  });

  it("rounds 7.125 up to 7.25 (the half-quarter rounds up)", () => {
    assert.equal(roundToQuarterHour(7.125), 7.25);
  });

  it("leaves an exact quarter (7.5) unchanged", () => {
    assert.equal(roundToQuarterHour(7.5), 7.5);
  });

  it("composes with minutesToHours: 384min (6.4h) → 6.5", () => {
    assert.equal(roundToQuarterHour(minutesToHours(384)), 6.5);
  });
});
