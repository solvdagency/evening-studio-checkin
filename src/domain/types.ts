/**
 * Shared domain contract for the Evening Studio Check-in core.
 *
 * Phase 1 is the project's trust boundary: pure, deterministic functions over
 * already-typed inputs. These types are the contracts that plans 02 (capacity)
 * and 03 (rollup) implement against, and that Phase 2 (Productive ingestion)
 * maps its raw API responses into. No implementation logic lives here.
 *
 * Config-constant placement (documented choice per Task 1 / <interfaces>):
 *   STUDIO_ZONE and TARGET_MINUTES are defined HERE as named constants rather
 *   than in a separate src/config.ts. Rationale: Phase 1 has exactly two
 *   project-wide invariants and no secret/runtime config, so a dedicated
 *   config module would be ceremony. The clock/capacity functions remain
 *   PARAMETERISED — they accept holidays (and, later, target minutes) as
 *   arguments and never reach into these globals — so purity/testability is
 *   preserved (RESEARCH "Recommended Project Structure"). If Phase 2 grows
 *   real runtime config (designer IDs, calendar emails, webhook), a thin
 *   src/config.ts can be added then without disturbing these domain constants.
 */

import type { DateTime } from "luxon";

/**
 * The studio's IANA timezone. All working-day / DST math is anchored here,
 * never to the scheduler/runner clock (SCHED-04).
 */
export const STUDIO_ZONE = "Australia/Sydney" as const;

/**
 * The standard 7.5h working day in exact minutes (Productive's native `time` unit).
 *
 * As of CAP-06 (D-02 / D-03) this is a REFERENCE / fallback constant only — it is
 * NO LONGER the per-designer available-minutes source of truth. Available minutes
 * now derive from each designer's real rostered minutes for the day (read from
 * Productive's `person.availabilities`), so a designer on a non-standard week is
 * never assumed to be working a flat 7.5h on a day they aren't rostered. The value
 * stays the documented standard-week default and remains the percentage basis used
 * by the Productive mappers (method-2 allocation conversion).
 *
 * Computing in integer minutes and converting to decimal hours only at the display
 * edge keeps the arithmetic exact (D-15 / Pitfall 3).
 */
export const TARGET_MINUTES = 450 as const;

/**
 * Branded identifier for one of the three monitored designers. The brand keeps
 * a designer id from being confused with any other string id at the type level.
 */
export type DesignerId = string & { readonly __brand: "DesignerId" };

/**
 * A single booking attributed to the target day, in exact minutes.
 *
 * `isTentative` abstracts Productive's `draft` flag (RESEARCH A2 / Pitfall 5):
 * Phase 1 stays framework-agnostic and never imports Productive response types.
 * Phase 2 owns translating `draft` / `approval_status` into this boolean.
 * Tentative time is tracked but never closes the underbooked gap (D-04 / D-05).
 */
export interface Booking {
  designerId: DesignerId;
  /** Minutes booked for the target day (Productive native unit). */
  minutes: number;
  /** True for tentative/draft bookings — counted but flagged "shaky". */
  isTentative: boolean;
}

/**
 * Per-target-day absence (time off) attributed to a designer, in exact minutes.
 * Abstracts Productive `booking_type=event` absence bookings (RESEARCH A3).
 * Available minutes for the day = TARGET_MINUTES − absence minutes, floored at 0.
 */
export interface Absence {
  designerId: DesignerId;
  /** Minutes of absence on the target day. */
  minutes: number;
}

/**
 * A working day, represented as a luxon `DateTime` anchored to `startOf("day")`
 * in the studio zone. A thin alias (planner's choice per <interfaces>): a
 * WorkingDay is just a zone-anchored, time-stripped DateTime — keeping it as
 * the native luxon type avoids wrapper ceremony while documenting the invariant
 * (always studio-zone midnight). The clock guarantees this anchoring; consumers
 * compare via `.toISODate()`, never by instant.
 */
export type WorkingDay = DateTime;

/**
 * Holidays are injected as a set of "yyyy-MM-dd" studio-zone date keys
 * (RESEARCH Pattern 1 — NOT a Set<DateTime>). String keys make calendar-day
 * comparison exact and sidestep DateTime instant-equality / zone traps.
 * Phase 1 never sources holidays; it only consumes this injected set (D-13).
 */
export type HolidaySet = ReadonlySet<string>;
