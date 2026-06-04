/**
 * Tests for the studio rollup + StudioReport assembly (Task 1, plan 01-03).
 *
 * computeStudioReport composes the clock window (01-01) and per-designer
 * capacity (01-02) into one deterministic, non-throwing StudioReport. These
 * tests pin down CAP-05 and decisions D-07/D-08/D-09/D-10/D-18/D-19 with
 * concrete values (RESEARCH Pattern 6 rollup; ROADMAP success criterion 4).
 *
 * Every `now` is built via DateTime.fromISO("...", { zone: STUDIO_ZONE }) so the
 * suite is fully deterministic — no system clock, no mock timers.
 *
 * Run: node --import tsx --test "src/domain/__tests__/report.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import type { DesignerId } from "../types.ts";
import { STUDIO_ZONE } from "../types.ts";
import { computeStudioReport } from "../report.ts";
import type { StudioReportInput } from "../report.ts";

const sydney = (iso: string): DateTime => DateTime.fromISO(iso, { zone: STUDIO_ZONE });

const A = "designer-a" as DesignerId;
const B = "designer-b" as DesignerId;
const C = "designer-c" as DesignerId;
const ROSTER: DesignerId[] = [A, B, C];

/**
 * Mon 2026-06-08 18:00 → nextWorkingDay = Tue 2026-06-09 → window Tue/Wed/Thu/Fri
 * (4 working days). The canonical "rest of the week from a Tuesday target" case.
 */
const NOW_FOR_TUE_TARGET = sydney("2026-06-08T18:00:00");

/**
 * Fri 2026-06-05 16:30 → nextWorkingDay skips the weekend → Mon 2026-06-08 →
 * window Mon–Fri (5 working days). The Friday-rollover case (D-08).
 */
const NOW_FOR_MON_TARGET = sydney("2026-06-05T16:30:00");

/**
 * Minimal input builder; callers override only what each case cares about.
 * `rosteredMinutes` defaults to a flat standard 450-minute day for every
 * designer-date — this proves the standard week is UNCHANGED under CAP-06 (the
 * pre-existing rollup/target-day assertions below all assume a flat 7.5h day).
 */
function input(overrides: Partial<StudioReportInput>): StudioReportInput {
  return {
    now: NOW_FOR_TUE_TARGET,
    holidays: new Set<string>(),
    roster: ROSTER,
    bookings: [],
    absences: [],
    rosteredMinutes: () => 450,
    ...overrides,
  };
}

describe("computeStudioReport — target day + window (D-07 / D-08)", () => {
  it("Tue target derives the Tue–Fri window (4 working days)", () => {
    const r = computeStudioReport(input({}));
    assert.equal(r.targetDay, "2026-06-09");
    assert.deepEqual(r.window, ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"]);
  });

  it("Friday-evening run rolls the target to Monday, window Mon–Fri (D-08)", () => {
    const r = computeStudioReport(input({ now: NOW_FOR_MON_TARGET }));
    assert.equal(r.targetDay, "2026-06-08");
    assert.equal(r.window.length, 5);
  });
});

describe("computeStudioReport — rollup totals net of time-off (CAP-05 / D-09)", () => {
  it("Tue target, 3 designers, no absences/bookings → totalMin 5400 (90h), openMin 5400", () => {
    // 4 window days × 3 designers × 450 = 5400 min = 90.0h; everyone fully open.
    const r = computeStudioReport(input({}));
    assert.equal(r.rollup.totalMin, 5400);
    assert.equal(r.rollup.totalHours, 90);
    assert.equal(r.rollup.openMin, 5400);
    assert.equal(r.rollup.openHours, 90);
  });

  it("one designer fully off one window day reduces totalMin by 450 (D-09 net of time-off)", () => {
    // Designer A off Wednesday 2026-06-10 (full 450). totalMin = 5400 − 450 = 4950 (82.5h).
    const r = computeStudioReport(
      input({
        absences: [{ designerId: A, minutes: 450, date: "2026-06-10" }],
      }),
    );
    assert.equal(r.rollup.totalMin, 4950);
    assert.equal(r.rollup.totalHours, 82.5);
    // openMin also drops by 450 — that day contributes no available, no open.
    assert.equal(r.rollup.openMin, 4950);
  });

  it("confirmed bookings on window days reduce openMin but not totalMin", () => {
    // Designer A has 300 confirmed on Tue and 450 confirmed on Wed.
    // total unchanged (5400); open reduced by 300 + 450 = 750 → 4650.
    const r = computeStudioReport(
      input({
        bookings: [
          { designerId: A, minutes: 300, isTentative: false, date: "2026-06-09" },
          { designerId: A, minutes: 450, isTentative: false, date: "2026-06-10" },
        ],
      }),
    );
    assert.equal(r.rollup.totalMin, 5400);
    assert.equal(r.rollup.openMin, 4650);
  });

  it("overbooking on a window day never drives openMin negative for the rollup (floored per day)", () => {
    // A overbooked 600 on Tue (available 450) → that day's open contribution is max(0, 450-600)=0,
    // not -150. Other 11 day-slots fully open: 11 × 450 = 4950.
    const r = computeStudioReport(
      input({
        bookings: [{ designerId: A, minutes: 600, isTentative: false, date: "2026-06-09" }],
      }),
    );
    assert.equal(r.rollup.totalMin, 5400);
    assert.equal(r.rollup.openMin, 4950);
  });

  it("tentative bookings do NOT close the open gap in the rollup (D-04/D-05)", () => {
    // A tentative 450 on Tue → open is unaffected (confirmed-only). totalMin 5400, openMin 5400.
    const r = computeStudioReport(
      input({
        bookings: [{ designerId: A, minutes: 450, isTentative: true, date: "2026-06-09" }],
      }),
    );
    assert.equal(r.rollup.totalMin, 5400);
    assert.equal(r.rollup.openMin, 5400);
  });
});

describe("computeStudioReport — holiday inside the window (D-10)", () => {
  it("holiday on Thu removes it from the window; totalMin = 3 × 3 × 450 = 4050", () => {
    const r = computeStudioReport(input({ holidays: new Set(["2026-06-11"]) }));
    assert.deepEqual(r.window, ["2026-06-09", "2026-06-10", "2026-06-12"]);
    assert.equal(r.rollup.totalMin, 4050);
  });
});

describe("computeStudioReport — Friday rollover totals (D-08)", () => {
  it("Mon target → 5 working days → totalMin = 5 × 3 × 450 = 6750", () => {
    const r = computeStudioReport(input({ now: NOW_FOR_MON_TARGET }));
    assert.equal(r.rollup.totalMin, 6750);
  });
});

describe("computeStudioReport — per-designer results for the target day", () => {
  it("emits one DesignerResult per rostered designer with target-day figures", () => {
    const r = computeStudioReport(input({}));
    assert.equal(r.designers.length, 3);
    assert.deepEqual(
      r.designers.map((d) => d.designerId),
      [A, B, C],
    );
    // No bookings on the target day → each designer underbooked, full open (D-17).
    for (const d of r.designers) {
      assert.equal(d.status, "underbooked");
      assert.equal(d.openMin, 450);
    }
  });

  it("target-day bookings/absences flow into the per-designer result", () => {
    // A confirmed 450 on the target day (Tue) → ok, openMin 0.
    const r = computeStudioReport(
      input({
        bookings: [{ designerId: A, minutes: 450, isTentative: false, date: "2026-06-09" }],
      }),
    );
    const a = r.designers.find((d) => d.designerId === A)!;
    assert.equal(a.status, "ok");
    assert.equal(a.openMin, 0);
  });

  it("a booking with no date is attributed to the target day", () => {
    const r = computeStudioReport(
      input({
        bookings: [{ designerId: A, minutes: 450, isTentative: false }],
      }),
    );
    const a = r.designers.find((d) => d.designerId === A)!;
    assert.equal(a.status, "ok");
    // ...and it also counts toward the target-day slot in the rollup.
    assert.equal(r.rollup.openMin, 5400 - 450);
  });
});

describe("computeStudioReport — missing-designer roster gap (D-18 / T-01-06)", () => {
  it("a designer the pull did not cover is reported in missingDesigners; call does not throw", () => {
    // The pull only reached A and B (assessedDesigners); C could not be assessed.
    const r = computeStudioReport(
      input({
        assessedDesigners: [A, B],
        bookings: [
          { designerId: A, minutes: 300, isTentative: false, date: "2026-06-09" },
          { designerId: B, minutes: 300, isTentative: false, date: "2026-06-09" },
        ],
        absences: [],
      }),
    );
    assert.deepEqual(r.missingDesigners, [C]);
    // The roster is still fully represented in designers[], in roster order.
    assert.deepEqual(
      r.designers.map((d) => d.designerId),
      [A, B, C],
    );
  });

  it("present-but-empty is NOT missing — empty input for the full roster yields no gaps (D-19)", () => {
    // assessedDesigners omitted → whole roster assumed assessed (present-but-empty).
    const r = computeStudioReport(input({ bookings: [], absences: [] }));
    assert.deepEqual(r.missingDesigners, []);
    // Every designer underbooked with full open on the target day (D-17).
    for (const d of r.designers) {
      assert.equal(d.status, "underbooked");
      assert.equal(d.openMin, 450);
    }
  });

  it("an explicitly-assessed designer with zero bookings is NOT missing (present-but-empty)", () => {
    // The pull reached all three; C simply had nothing booked.
    const r = computeStudioReport(
      input({
        assessedDesigners: [A, B, C],
        bookings: [{ designerId: A, minutes: 300, isTentative: false, date: "2026-06-09" }],
      }),
    );
    assert.deepEqual(r.missingDesigners, []);
  });
});

describe("computeStudioReport — rostered-minutes basis (CAP-06 / D-02 / D-04 / D-07)", () => {
  // Window for the Tue target is Tue 06-09, Wed 06-10, Thu 06-11, Fri 06-12.
  // weekday(dateKey): a lookup that rosters a designer Mon/Tue/Thu and OFF Wed/Fri.
  const offWedFri = (_designerId: DesignerId, dateKey: string): number => {
    const wd = DateTime.fromISO(dateKey, { zone: STUDIO_ZONE }).weekday; // 1=Mon..7=Sun
    return wd === 3 || wd === 5 ? 0 : 450; // off Wed(3) & Fri(5)
  };

  it("a designer rostered 0 on the target day is \"off\" (never underbooked), even with zero bookings", () => {
    // Make the TARGET day (Tue 06-09) a non-rostered day for designer A only.
    const r = computeStudioReport(
      input({
        rosteredMinutes: (designerId, dateKey) =>
          designerId === A && dateKey === "2026-06-09" ? 0 : 450,
      }),
    );
    const a = r.designers.find((d) => d.designerId === A)!;
    assert.equal(a.status, "off");
    assert.equal(a.availableMin, 0);
    assert.equal(a.openMin, 0);
  });

  it("a designer rostered 450 on the target day with nothing booked is underbooked, openHours 7.5 (no regression)", () => {
    const r = computeStudioReport(input({ rosteredMinutes: () => 450 }));
    const a = r.designers.find((d) => d.designerId === A)!;
    assert.equal(a.status, "underbooked");
    assert.equal(a.openMin, 450);
    assert.equal(a.openHours, 7.5);
  });

  it("the rollup EXCLUDES a designer's not-rostered window days (Wed/Fri contribute 0) — CAP-05 fix (D-07)", () => {
    // Only designer A follows off-Wed/Fri; B and C stay flat 450.
    // A rostered: Tue 450, Wed 0, Thu 450, Fri 0 = 900 over the 4-day window.
    // B and C: 4 × 450 = 1800 each.  totalMin = 900 + 1800 + 1800 = 4500.
    const r = computeStudioReport(
      input({
        rosteredMinutes: (designerId, dateKey) =>
          designerId === A ? offWedFri(designerId, dateKey) : 450,
      }),
    );
    assert.equal(r.rollup.totalMin, 4500);
    // openMin equals totalMin here — nothing booked — proving the not-rostered days
    // never inflate the studio's open figure (no fabricated 3×450).
    assert.equal(r.rollup.openMin, 4500);
  });

  it("absence on a rostered day still subtracts in both the target result and the rollup", () => {
    // A rostered 450 every day, 120min absence on the Tue target.
    const r = computeStudioReport(
      input({
        rosteredMinutes: () => 450,
        absences: [{ designerId: A, minutes: 120, date: "2026-06-09" }],
      }),
    );
    const a = r.designers.find((d) => d.designerId === A)!;
    assert.equal(a.availableMin, 330); // 450 - 120
    // Rollup: A's Tue slot is 330 (not 450); the other 11 slots are 450 each.
    // total = 11×450 + 330 = 4950 + 330 = 5280.
    assert.equal(r.rollup.totalMin, 5280);
  });

  it("rosteredMinutes omitted falls back to a flat standard day and never throws (degrade-safe)", () => {
    const r = computeStudioReport({
      now: NOW_FOR_TUE_TARGET,
      holidays: new Set<string>(),
      roster: ROSTER,
      bookings: [],
      absences: [],
      // rosteredMinutes intentionally omitted
    });
    assert.equal(r.rollup.totalMin, 5400); // 4 days × 3 designers × 450
    for (const d of r.designers) {
      assert.equal(d.status, "underbooked");
      assert.equal(d.openMin, 450);
    }
  });

  it("an unknown designer-date from a provided lookup resolves to 0 (never invents capacity — D-06)", () => {
    // Lookup returns 0 for everything → every day is not-rostered → all "off", total 0.
    const r = computeStudioReport(input({ rosteredMinutes: () => 0 }));
    for (const d of r.designers) {
      assert.equal(d.status, "off");
      assert.equal(d.availableMin, 0);
    }
    assert.equal(r.rollup.totalMin, 0);
    assert.equal(r.rollup.openMin, 0);
  });
});

describe("computeStudioReport — determinism + graceful degradation (D-19 / T-01-07 / T-01-08)", () => {
  it("identical inputs yield deep-equal output (no randomness, no I/O)", () => {
    const x = input({
      bookings: [{ designerId: A, minutes: 300, isTentative: false, date: "2026-06-09" }],
      absences: [{ designerId: B, minutes: 120, date: "2026-06-10" }],
    });
    assert.deepEqual(computeStudioReport(x), computeStudioReport(x));
  });

  it("a NaN-minutes booking does not throw — coerced to 0, report still produced", () => {
    const r = computeStudioReport(
      input({
        bookings: [{ designerId: A, minutes: Number.NaN, isTentative: false, date: "2026-06-09" }],
      }),
    );
    // NaN booked → 0 confirmed → full open preserved.
    assert.equal(r.rollup.openMin, 5400);
    assert.ok(Number.isFinite(r.rollup.totalMin));
  });

  it("a NaN-minutes absence does not throw — coerced to 0 absence (full available)", () => {
    const r = computeStudioReport(
      input({
        absences: [{ designerId: A, minutes: Number.NaN, date: "2026-06-10" }],
      }),
    );
    assert.equal(r.rollup.totalMin, 5400);
    assert.ok(Number.isFinite(r.rollup.totalMin));
  });

  it("an empty roster returns a well-formed report with no designers and no gaps", () => {
    const r = computeStudioReport(input({ roster: [] }));
    assert.deepEqual(r.designers, []);
    assert.deepEqual(r.missingDesigners, []);
    assert.equal(r.rollup.totalMin, 0);
    assert.equal(r.rollup.openMin, 0);
  });

  it("empty arrays for the full roster never throw and produce a stable report", () => {
    assert.doesNotThrow(() => computeStudioReport(input({})));
  });
});
