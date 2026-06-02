/**
 * Tests for per-designer capacity + classification (Task 2, plan 01-02).
 *
 * Trust-critical arithmetic: every figure is computed in exact integer minutes
 * and only rounded to 0.25h at the display edge. These tests pin down decisions
 * D-01..D-06, D-15, D-16, D-17 with concrete values.
 *
 * Run: node --import tsx --test "src/domain/__tests__/capacity.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Booking, DesignerId } from "../types.ts";
import {
  availableMinutes,
  bookedMinutes,
  classifyDay,
  computeDesignerDay,
} from "../capacity.ts";

const DESIGNER = "designer-1" as DesignerId;

/** Helper: build a Booking without repeating the designerId everywhere. */
function booking(minutes: number, isTentative: boolean): Booking {
  return { designerId: DESIGNER, minutes, isTentative };
}

describe("availableMinutes (CAP-01 / D-02)", () => {
  it("no absence -> full 450-minute day", () => {
    assert.equal(availableMinutes(0), 450);
  });

  it("2h absence (120min) -> 330 available (5.5h)", () => {
    assert.equal(availableMinutes(120), 330);
  });

  it("full-day absence (450) -> floored at 0", () => {
    assert.equal(availableMinutes(450), 0);
  });

  it("over-full absence (600) -> floored at 0, never negative", () => {
    assert.equal(availableMinutes(600), 0);
  });

  it("non-finite absence is treated defensively as 0 absence (D-19, never NaN)", () => {
    assert.equal(availableMinutes(Number.NaN), 450);
    assert.equal(availableMinutes(Number.POSITIVE_INFINITY), 450);
  });
});

describe("bookedMinutes (CAP-02 / D-04 / D-05)", () => {
  it("separates confirmed from tentative", () => {
    const result = bookedMinutes([booking(300, false), booking(120, true)]);
    assert.deepEqual(result, { confirmed: 300, tentative: 120 });
  });

  it("empty bookings -> zero confirmed and tentative", () => {
    assert.deepEqual(bookedMinutes([]), { confirmed: 0, tentative: 0 });
  });

  it("coerces non-finite booking minutes to 0 (D-19, never NaN)", () => {
    const result = bookedMinutes([booking(Number.NaN, false), booking(60, false)]);
    assert.deepEqual(result, { confirmed: 60, tentative: 0 });
  });
});

describe("classifyDay (D-01 / D-03 / D-04 / D-06 / D-17)", () => {
  it("available 0, confirmed 0 -> off (NOT underbooked), open 0 (no available hours)", () => {
    assert.deepEqual(classifyDay(0, 0), { status: "off", openMin: 0 });
  });

  it("any confirmed gap -> underbooked with open = available - confirmed", () => {
    assert.deepEqual(classifyDay(450, 420), { status: "underbooked", openMin: 30 });
  });

  it("zero bookings on a full day -> underbooked, full 450 open (D-17)", () => {
    assert.deepEqual(classifyDay(450, 0), { status: "underbooked", openMin: 450 });
  });

  it("confirmed === available -> ok, open 0", () => {
    assert.deepEqual(classifyDay(450, 450), { status: "ok", openMin: 0 });
  });

  it("confirmed over available -> overbooked, unclamped negative open (D-06)", () => {
    assert.deepEqual(classifyDay(450, 480), { status: "overbooked", openMin: -30 });
  });
});

describe("computeDesignerDay (composition + shaky + display rounding)", () => {
  it("confirmed 0 + tentative 300 on a 450 day -> underbooked AND shaky, open stays 450", () => {
    const r = computeDesignerDay(DESIGNER, [booking(300, true)], 0);
    assert.equal(r.status, "underbooked");
    assert.equal(r.shaky, true);
    assert.equal(r.openMin, 450);
    assert.equal(r.confirmedMin, 0);
    assert.equal(r.tentativeMin, 300);
  });

  it("shaky is orthogonal to status: an ok day can also be shaky", () => {
    // confirmed 450 (ok) + tentative 60 -> ok AND shaky
    const r = computeDesignerDay(DESIGNER, [booking(450, false), booking(60, true)], 0);
    assert.equal(r.status, "ok");
    assert.equal(r.shaky, true);
  });

  it("shaky is false when there is no tentative time", () => {
    const r = computeDesignerDay(DESIGNER, [booking(450, false)], 0);
    assert.equal(r.shaky, false);
  });

  it("a fully-off designer is classified off but still represented", () => {
    const r = computeDesignerDay(DESIGNER, [], 450);
    assert.equal(r.status, "off");
    assert.equal(r.availableMin, 0);
    assert.equal(r.designerId, DESIGNER);
  });

  it("display rounding: availableMin 384 (6.4h) surfaces availableHours 6.5, exact min retained (D-16)", () => {
    // 2h6m absence = 66min -> available 384min = 6.4h -> display 6.5h
    const r = computeDesignerDay(DESIGNER, [], 66);
    assert.equal(r.availableMin, 384);
    assert.equal(r.availableHours, 6.5);
  });

  it("bookedHours surfaces confirmed display hours; openHours rounds the open figure", () => {
    // confirmed 420min = 7.0h booked; open 30min = 0.5h
    const r = computeDesignerDay(DESIGNER, [booking(420, false)], 0);
    assert.equal(r.bookedHours, 7.0);
    assert.equal(r.openHours, 0.5);
  });
});
