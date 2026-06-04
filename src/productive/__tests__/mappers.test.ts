/**
 * Tests for per-day minutes normalization + Productive→Booking/Absence mapping
 * (Task 2, plan 02-02).
 *
 * Trust-critical arithmetic (D-09): every booking is normalized to EXACT minutes
 * on the target day across all three `booking_method_id`s. These tests pin down
 * the real D-09 example (480 min over Jun 3–4 = 240/day), the divide-by-zero
 * guard (Pitfall 5), the NaN/null coercion (mirrors capacity.safeMinutes), and
 * the D-07/D-11/D-12 split: work bookings (service relationship) → Booking[],
 * absence bookings (event relationship) → Absence[], `isTentative ⟺ draft===true`.
 *
 * Run: node --import tsx --test "src/productive/__tests__/mappers.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  minutesOnDay,
  workingDaysInRange,
  mapToBookingsAndAbsences,
  availabilityToWeekdayMinutes,
  rosteredMinutesForWeekday,
  type RawBookingForMapping,
  type RawAvailabilityForMapping,
} from "../mappers.ts";
import { TARGET_MINUTES } from "../../domain/types.ts";

/** Build a minimal booking attributes object for minutesOnDay tests. */
function attrs(
  partial: Partial<RawBookingForMapping["attributes"]>,
): RawBookingForMapping["attributes"] {
  return {
    booking_method_id: 1,
    time: null,
    total_time: null,
    percentage: null,
    started_on: "2026-06-03",
    ended_on: "2026-06-03",
    draft: false,
    canceled: false,
    ...partial,
  };
}

/** Build a full raw booking with a chosen relationship kind. */
function booking(
  partial: Partial<RawBookingForMapping["attributes"]>,
  rel: "service" | "event",
  personId: string | null = "686717",
): RawBookingForMapping {
  const relationships: RawBookingForMapping["relationships"] = {
    person: personId === null ? { meta: { included: false } } : { data: { id: personId, type: "people" } },
  };
  if (rel === "service") relationships.service = { data: { id: "svc-1", type: "services" } };
  if (rel === "event") relationships.event = { data: { id: "evt-1", type: "events" } };
  return { id: "b1", type: "bookings", attributes: attrs(partial), relationships };
}

const TARGET = "2026-06-03";
const NO_HOLIDAYS: ReadonlySet<string> = new Set();

describe("minutesOnDay (D-09) — method 1 (per day)", () => {
  it("time=240, target day inside [started,ended] = 240 minutes", () => {
    const a = attrs({ booking_method_id: 1, time: 240, started_on: "2026-06-03", ended_on: "2026-06-04" });
    assert.equal(minutesOnDay(a, TARGET, 2), 240);
  });

  it("target day OUTSIDE the booking range = 0", () => {
    const a = attrs({ booking_method_id: 1, time: 240, started_on: "2026-06-04", ended_on: "2026-06-05" });
    assert.equal(minutesOnDay(a, TARGET, 2), 0);
  });
});

describe("minutesOnDay (D-09) — method 3 (total hours)", () => {
  it("480 min over Jun 3–4 (2 working days) = 240/day (real D-09 example)", () => {
    const a = attrs({ booking_method_id: 3, total_time: 480, started_on: "2026-06-03", ended_on: "2026-06-04" });
    assert.equal(minutesOnDay(a, TARGET, 2), 240);
  });

  it("workingDaysInRange=0 → 0 (no divide-by-zero / Infinity; Pitfall 5)", () => {
    const a = attrs({ booking_method_id: 3, total_time: 480, started_on: "2026-06-03", ended_on: "2026-06-04" });
    const result = minutesOnDay(a, TARGET, 0);
    assert.equal(result, 0);
    assert.equal(Number.isFinite(result), true);
  });
});

describe("minutesOnDay (D-09) — method 2 (percentage)", () => {
  it("percentage=50 → round(0.5 * 450) = 225", () => {
    const a = attrs({ booking_method_id: 2, percentage: 50, started_on: "2026-06-03", ended_on: "2026-06-03" });
    assert.equal(minutesOnDay(a, TARGET, 1), Math.round(0.5 * TARGET_MINUTES));
    assert.equal(minutesOnDay(a, TARGET, 1), 225);
  });
});

describe("minutesOnDay (D-09) — defensive coercion (mirrors safeMinutes)", () => {
  it("unknown booking_method_id → 0, never throws", () => {
    const a = attrs({ booking_method_id: 99, time: 240, started_on: "2026-06-03", ended_on: "2026-06-03" });
    assert.equal(minutesOnDay(a, TARGET, 1), 0);
  });

  it("null time (method 1) → 0", () => {
    const a = attrs({ booking_method_id: 1, time: null, started_on: "2026-06-03", ended_on: "2026-06-03" });
    assert.equal(minutesOnDay(a, TARGET, 1), 0);
  });

  it("NaN total_time (method 3) coerced → 0", () => {
    const a = attrs({ booking_method_id: 3, total_time: NaN, started_on: "2026-06-03", ended_on: "2026-06-03" });
    assert.equal(minutesOnDay(a, TARGET, 1), 0);
  });

  it("null percentage (method 2) → 0", () => {
    const a = attrs({ booking_method_id: 2, percentage: null, started_on: "2026-06-03", ended_on: "2026-06-03" });
    assert.equal(minutesOnDay(a, TARGET, 1), 0);
  });
});

describe("workingDaysInRange — reuses clock isWorkingDay", () => {
  it("Jun 3–4 2026 (Wed–Thu) = 2 working days", () => {
    assert.equal(workingDaysInRange("2026-06-03", "2026-06-04", NO_HOLIDAYS), 2);
  });

  it("Fri Jun 5 → Mon Jun 8 skips the weekend = 2 working days", () => {
    assert.equal(workingDaysInRange("2026-06-05", "2026-06-08", NO_HOLIDAYS), 2);
  });

  it("a holiday in range reduces the divisor (Open Q3: yes)", () => {
    const holidays = new Set(["2026-06-04"]);
    assert.equal(workingDaysInRange("2026-06-03", "2026-06-04", holidays), 1);
  });

  it("ended before started → 0 (no negative / Infinity)", () => {
    assert.equal(workingDaysInRange("2026-06-04", "2026-06-03", NO_HOLIDAYS), 0);
  });
});

describe("mapToBookingsAndAbsences (D-07 / D-11 / D-12)", () => {
  it("service relationship → Booking[]; event relationship → Absence[]", () => {
    const raw = [
      booking({ booking_method_id: 1, time: 240 }, "service"),
      booking({ booking_method_id: 1, time: 120 }, "event"),
    ];
    const { bookings, absences } = mapToBookingsAndAbsences(raw, TARGET, NO_HOLIDAYS);
    assert.equal(bookings.length, 1);
    assert.equal(absences.length, 1);
    assert.equal(bookings[0]!.minutes, 240);
    assert.equal(absences[0]!.minutes, 120);
  });

  it("isTentative === (draft === true) for work bookings (D-07)", () => {
    const raw = [
      booking({ booking_method_id: 1, time: 60, draft: true }, "service"),
      booking({ booking_method_id: 1, time: 60, draft: false }, "service"),
    ];
    const { bookings } = mapToBookingsAndAbsences(raw, TARGET, NO_HOLIDAYS);
    assert.equal(bookings[0]!.isTentative, true);
    assert.equal(bookings[1]!.isTentative, false);
  });

  it("Absence carries no isTentative field; all non-canceled absences count (D-12)", () => {
    const raw = [booking({ booking_method_id: 1, time: 90, draft: true }, "event")];
    const { absences } = mapToBookingsAndAbsences(raw, TARGET, NO_HOLIDAYS);
    assert.equal(absences.length, 1);
    assert.equal(absences[0]!.minutes, 90);
    assert.equal("isTentative" in absences[0]!, false);
  });

  it("maps person relationship id to the branded DesignerId", () => {
    const raw = [booking({ booking_method_id: 1, time: 30 }, "service", "686712")];
    const { bookings } = mapToBookingsAndAbsences(raw, TARGET, NO_HOLIDAYS);
    assert.equal(bookings[0]!.designerId, "686712");
  });

  it("method-3 booking over Jun 3–4 maps to 240 min on the target day (end-to-end D-09)", () => {
    const raw = [booking({ booking_method_id: 3, total_time: 480, started_on: "2026-06-03", ended_on: "2026-06-04" }, "service")];
    const { bookings } = mapToBookingsAndAbsences(raw, TARGET, NO_HOLIDAYS);
    assert.equal(bookings[0]!.minutes, 240);
  });

  it("a canceled booking present in the input is NOT silently included", () => {
    const raw = [booking({ booking_method_id: 1, time: 240, canceled: true }, "service")];
    const { bookings } = mapToBookingsAndAbsences(raw, TARGET, NO_HOLIDAYS);
    assert.equal(bookings.length, 0);
  });

  it("a booking that is neither service nor event is dropped (never throws)", () => {
    const raw: RawBookingForMapping[] = [
      { id: "x", type: "bookings", attributes: attrs({ time: 60 }), relationships: { person: { data: { id: "686717", type: "people" } } } },
    ];
    const { bookings, absences } = mapToBookingsAndAbsences(raw, TARGET, NO_HOLIDAYS);
    assert.equal(bookings.length, 0);
    assert.equal(absences.length, 0);
  });
});

/**
 * Availability → per-weekday rostered minutes (plan 06-02, CAP-06 / D-01 / D-02 / D-08).
 *
 * Trust-critical arithmetic: working_hours is hours-per-weekday (Mon=0..Sun=6);
 * minutes = round(hours × 60), every entry coerced through `safe(...)` so a
 * non-finite figure can never surface as NaN/Infinity (T-06-03). The period whose
 * [started_on, ended_on] covers the target date is selected (ended_on null =
 * open-ended, D-01); a 14-element pattern uses week 1 (warns if weeks differ, D-08).
 */

/** An open-ended availability period builder (ended_on null = current). */
function avail(
  working_hours: number[],
  started_on = "2026-03-09",
  ended_on: string | null = null,
): RawAvailabilityForMapping {
  return { started_on, ended_on, working_hours, holiday_calendar_id: null };
}

// 2026-06-04 is a Thursday; 2026-06-03 Wed; 2026-06-05 Fri; 2026-06-08 Mon; 2026-06-06 Sat; 2026-06-07 Sun.
const THU = "2026-06-04";
const WED = "2026-06-03";
const FRI = "2026-06-05";
const MON = "2026-06-08";
const SAT = "2026-06-06";
const SUN = "2026-06-07";

describe("availabilityToWeekdayMinutes (CAP-06 / D-01 / D-02)", () => {
  it("7-element standard week [7.5×5,0,0] → Mon..Fri 450, Sat/Sun 0", () => {
    const mins = availabilityToWeekdayMinutes([avail([7.5, 7.5, 7.5, 7.5, 7.5, 0, 0])], THU);
    assert.deepEqual(mins, [450, 450, 450, 450, 450, 0, 0]);
  });

  it("Anisha shape [7.5,7.5,0,7.5,0,0,0] → Mon=450,Tue=450,Wed=0,Thu=450,Fri=0", () => {
    const mins = availabilityToWeekdayMinutes([avail([7.5, 7.5, 0, 7.5, 0, 0, 0])], THU);
    assert.equal(mins[0], 450); // Mon
    assert.equal(mins[1], 450); // Tue
    assert.equal(mins[2], 0); // Wed
    assert.equal(mins[3], 450); // Thu
    assert.equal(mins[4], 0); // Fri
  });

  it("a weekday entry of 0 → 0 rostered minutes (not rostered)", () => {
    const mins = availabilityToWeekdayMinutes([avail([0, 7.5, 7.5, 7.5, 7.5, 0, 0])], THU);
    assert.equal(mins[0], 0);
  });

  it("14-element with identical weeks uses week 1 (no warning)", () => {
    const week = [7.5, 7.5, 0, 7.5, 0, 0, 0];
    const mins = availabilityToWeekdayMinutes([avail([...week, ...week])], THU);
    assert.deepEqual(mins, [450, 450, 0, 450, 0, 0, 0]);
  });

  it("14-element with DIFFERING weeks uses week 1 (and warns)", () => {
    const week1 = [7.5, 7.5, 0, 7.5, 0, 0, 0];
    const week2 = [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0];
    const mins = availabilityToWeekdayMinutes([avail([...week1, ...week2])], THU);
    // Week 1 used → Wed (index 2) is 0, NOT 450 from week 2.
    assert.deepEqual(mins, [450, 450, 0, 450, 0, 0, 0]);
  });

  it("period selection: ended_on null = open-ended, covers any later date", () => {
    const mins = availabilityToWeekdayMinutes(
      [avail([7.5, 7.5, 7.5, 7.5, 7.5, 0, 0], "2026-03-09", null)],
      THU,
    );
    assert.equal(mins[3], 450); // Thu rostered
  });

  it("a dayKey BEFORE all periods → 7-element all-zero (no rostered data)", () => {
    const mins = availabilityToWeekdayMinutes(
      [avail([7.5, 7.5, 7.5, 7.5, 7.5, 0, 0], "2026-03-09", "2026-12-31")],
      "2026-01-01",
    );
    assert.deepEqual(mins, [0, 0, 0, 0, 0, 0, 0]);
  });

  it("the covering closed period is selected over a non-covering one", () => {
    const mins = availabilityToWeekdayMinutes(
      [
        avail([7.5, 7.5, 7.5, 7.5, 7.5, 0, 0], "2026-01-01", "2026-02-01"), // old, not covering
        avail([7.5, 7.5, 0, 7.5, 0, 0, 0], "2026-03-09", null), // current, covers THU
      ],
      THU,
    );
    assert.deepEqual(mins, [450, 450, 0, 450, 0, 0, 0]); // current Anisha-shape period
  });

  it("a non-finite working_hours entry coerces to 0 (never NaN, T-06-03)", () => {
    const mins = availabilityToWeekdayMinutes(
      [avail([Number.NaN, 7.5, 7.5, 7.5, 7.5, 0, 0])],
      THU,
    );
    assert.equal(mins[0], 0);
    assert.equal(Number.isFinite(mins[0]), true);
  });

  it("an unexpected working_hours length (e.g. 5) → 7-element all-zero (defensive)", () => {
    const mins = availabilityToWeekdayMinutes([avail([7.5, 7.5, 7.5, 7.5, 7.5])], THU);
    assert.deepEqual(mins, [0, 0, 0, 0, 0, 0, 0]);
  });

  it("an empty availabilities array → 7-element all-zero", () => {
    const mins = availabilityToWeekdayMinutes([], THU);
    assert.deepEqual(mins, [0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("rosteredMinutesForWeekday (Mon=0..Sun=6 indexing, D-02)", () => {
  const anisha = [450, 450, 0, 450, 0, 0, 0]; // Mon,Tue,Wed,Thu,Fri,Sat,Sun

  it("Thursday 2026-06-04 → index 3 → 450", () => {
    assert.equal(rosteredMinutesForWeekday(anisha, THU), 450);
  });

  it("Wednesday 2026-06-03 → index 2 → 0 (Anisha off Wed)", () => {
    assert.equal(rosteredMinutesForWeekday(anisha, WED), 0);
  });

  it("Friday 2026-06-05 → index 4 → 0 (Anisha off Fri)", () => {
    assert.equal(rosteredMinutesForWeekday(anisha, FRI), 0);
  });

  it("Monday 2026-06-08 → index 0 → 450", () => {
    assert.equal(rosteredMinutesForWeekday(anisha, MON), 450);
  });

  it("Saturday → index 5 → 0; Sunday → index 6 → 0", () => {
    assert.equal(rosteredMinutesForWeekday(anisha, SAT), 0);
    assert.equal(rosteredMinutesForWeekday(anisha, SUN), 0);
  });

  it("a non-finite stored minute coerces to 0 (never NaN)", () => {
    const mins = [Number.NaN, 450, 450, 450, 450, 0, 0];
    assert.equal(rosteredMinutesForWeekday(mins, MON), 0);
  });

  it("an invalid date key → 0 (never throws)", () => {
    assert.equal(rosteredMinutesForWeekday(anisha, "not-a-date"), 0);
  });
});
