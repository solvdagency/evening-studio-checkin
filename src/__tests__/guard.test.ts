/**
 * Tests for the weekday guard in the composition root (src/index.ts).
 *
 * Mirrors clock.test.ts: every `now` is constructed via
 * DateTime.fromISO("...", { zone: STUDIO_ZONE }) so the suite is fully
 * deterministic — no system clock, no mock timers. We test ONLY the pure
 * `shouldSkipForWeekend` predicate; it never touches the network or
 * `process.exit`, so importing it runs nothing side-effecting.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { shouldSkipForWeekend } from "../index.ts";
import { STUDIO_ZONE } from "../domain/types.ts";

const sydney = (iso: string): DateTime => DateTime.fromISO(iso, { zone: STUDIO_ZONE });

describe("shouldSkipForWeekend", () => {
  it("skips on a Saturday (SCHED-01 — never weekends)", () => {
    // Sat 2026-06-06 16:30 Sydney → weekday 6 → skip.
    const sat = sydney("2026-06-06T16:30:00");
    assert.equal(shouldSkipForWeekend(sat), true);
  });

  it("skips on a Sunday (SCHED-01 — never weekends)", () => {
    // Sun 2026-06-07 16:30 Sydney → weekday 7 → skip.
    const sun = sydney("2026-06-07T16:30:00");
    assert.equal(shouldSkipForWeekend(sun), true);
  });

  it("does NOT skip on a Wednesday (a normal run day)", () => {
    // Wed 2026-06-10 16:30 Sydney → weekday 3 → run.
    const wed = sydney("2026-06-10T16:30:00");
    assert.equal(shouldSkipForWeekend(wed), false);
  });

  it("does NOT skip on a Friday (the last working day)", () => {
    // Fri 2026-06-05 16:30 Sydney → weekday 5 → run.
    const fri = sydney("2026-06-05T16:30:00");
    assert.equal(shouldSkipForWeekend(fri), false);
  });

  it("is a pure predicate — same input yields the same output", () => {
    const sat = sydney("2026-06-06T16:30:00");
    assert.equal(shouldSkipForWeekend(sat), shouldSkipForWeekend(sat));
  });
});
