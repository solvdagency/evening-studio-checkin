/**
 * BriefFlag emission — the brief existence check (BRIEF-01 / BRIEF-02 / BRIEF-03).
 *
 * For each CONFIRMED, TARGET-DAY, CLIENT booking, emit at most one `BriefFlag`
 * describing the FIRST failure mode found, keyed by the job/task — NEVER by a PM
 * (BRIEF-03 / project tone constraint): there is no pm/manager/owner/approver field
 * on BriefFlag, and `jobLabel` is the project/task title only.
 *
 * The three failure modes (D-04 (a)/(b)/(c)):
 *  - "no-task"     : no task linked at all (BRIEF-01 / D-10). Real bookings — they
 *                    still count toward hours upstream; here they flag.
 *  - "not-briefed" : task linked but its status is BEFORE the Briefed column (BRIEF-02).
 *  - "blank-brief" : task at/past Briefed but the description is empty (D-04 false-trust).
 * A booking whose task is fully briefed (at/past Briefed + non-empty) yields no flag.
 *
 * Suppression (no flag emitted):
 *  - tentative bookings (draft=true) — a PM hasn't locked the work, so "not briefed"
 *    would be premature noise (D-05). Tracked for context only.
 *  - internal/non-client bookings — `isClient=false` (D-06). Internal work still
 *    counts toward hours upstream; only the brief flag is suppressed.
 *    LIVE-CONFIRMED SIGNAL (02-03 Task 3, corrects RESEARCH A2/A3): for SOLVD the
 *    company-ABSENCE signal does NOT work — the known internal booking ("Liams
 *    Booking Time for Ai", project "Solvd Ai") IS linked to a company (SOLVD
 *    Agency's own record). The reliable signal is the project's `project_type_id`:
 *    live data shows internal=1, client=2 (the disputed enum direction, resolved
 *    live). The chain is task → project → project_type_id (NOT service → project —
 *    services link via `deal`, not `project`). The gather step (02-04) resolves
 *    this and passes the boolean `isClient` here, keeping this module pure.
 *  - non-target-day bookings — brief checks apply only to the target day (D-08);
 *    the wider window feeds the rest-of-week rollup, not brief flags.
 *
 * Pure + testable: the client-vs-internal decision and the task-status resolution
 * are passed in as already-resolved inputs (the gather step in 02-04 resolves the
 * service→project→company chain and the task workflow_status). This file holds no
 * network or Productive-raw-shape logic and mirrors the per-field-documented
 * exported-interface style of src/domain/capacity.ts `DesignerResult`.
 */

import type { DesignerId } from "../domain/types.ts";
import { isBriefed, type TaskStatusForBrief } from "./briefed.ts";

/**
 * A surfaced brief problem on one confirmed client target-day booking. Phase 3
 * renders this. Keyed by job/task; carries NO PM identity (BRIEF-03).
 */
export interface BriefFlag {
  /** The designer the booking belongs to (for grouping in the message). */
  designerId: DesignerId;
  /** Productive booking id — for the Phase-3 deep-link (MSG-06). */
  bookingId: string;
  /** Productive task id, or null when no task is linked (BRIEF-01). */
  taskId: string | null;
  /** Project/task title for human display — the "job", NEVER a PM (BRIEF-03). */
  jobLabel: string;
  /** Which of the three failure modes this flag represents (D-04 a/b/c). */
  reason: "no-task" | "not-briefed" | "blank-brief";
  /** Context only — tentative bookings are NOT flagged, so this is always false here (D-05). */
  isTentative: boolean;
}

/**
 * The pre-resolved per-booking input `assessBriefs` consumes. The gather step
 * (02-04) builds these: it resolves whether the booking is client work
 * (`isClient` — true when the project has a client `company`, D-06), whether the
 * booking falls on the target day (`isTargetDay`, D-08), the tentative flag
 * (`isTentative ⟺ draft`, D-07), the human `jobLabel` (project/task title — never
 * a PM), and the linked task's resolved status (`task`, or null for no task).
 */
export interface AssessBookingInput {
  designerId: DesignerId;
  bookingId: string;
  /** Tentative ⟺ Productive `draft===true` (D-07). Tentative → never flagged (D-05). */
  isTentative: boolean;
  /**
   * True for client work, false for internal/overhead (D-06). LIVE-CONFIRMED:
   * derive from the project's `project_type_id` (internal=1, client=2 live), via
   * the task → project chain — NOT company-absence, which is unreliable for SOLVD
   * (internal projects carry SOLVD's own company). Resolved by the gather step.
   */
  isClient: boolean;
  /** True when the booking covers the target day — brief checks are target-day only (D-08). */
  isTargetDay: boolean;
  /** Project/task title for display — the "job". NEVER a PM (BRIEF-03). */
  jobLabel: string;
  /**
   * The linked task's resolved status + id, or null when no task is linked
   * (BRIEF-01 / D-10). `descriptionNonEmpty` drives the D-04 blank-brief guard.
   */
  task: (TaskStatusForBrief & { taskId: string }) | null;
}

/**
 * Assess each booking and emit a `BriefFlag` for every confirmed, target-day,
 * client booking that is not fully briefed (BRIEF-01/02/03). Tentative (D-05),
 * internal/non-client (D-06), and non-target-day (D-08) bookings are skipped and
 * yield no flag. Returns at most one flag per booking — the first failure mode in
 * D-04 order: no-task → not-briefed → blank-brief. Pure; never throws.
 */
export function assessBriefs(
  bookings: readonly AssessBookingInput[],
  briefedPositionByWorkflow: ReadonlyMap<string, number>,
): BriefFlag[] {
  const flags: BriefFlag[] = [];

  for (const b of bookings) {
    // Suppression gates (D-05 / D-08 / D-06) — never flag these.
    if (b.isTentative) continue; // D-05 — tentative not locked yet
    if (!b.isTargetDay) continue; // D-08 — brief checks are target-day only
    if (!b.isClient) continue; // D-06 — internal work excluded from flags

    // (a) No task linked → no-task (BRIEF-01 / D-10).
    if (b.task === null) {
      flags.push(flag(b, null, "no-task"));
      continue;
    }

    // (b)/(c) Task linked: briefed ⟺ at/past Briefed AND non-empty (D-02 + D-04).
    if (isBriefed(b.task, briefedPositionByWorkflow)) {
      continue; // fully briefed → no flag
    }

    // Not briefed: distinguish "before Briefed" (b) from "at/past but blank" (c).
    // Check the POSITION first (D-04 order): if the task is at/past Briefed but
    // failed the briefed check, the cause is the empty description → blank-brief
    // (D-04). Otherwise the task is before the Briefed column → not-briefed
    // (BRIEF-02). A task before Briefed AND blank still flags as not-briefed —
    // its primary, actionable failure is that it has not reached Briefed yet.
    const briefedPos = briefedPositionByWorkflow.get(b.task.workflowId);
    const atOrPastBriefed =
      briefedPos !== undefined && b.task.position >= briefedPos;
    const reason = atOrPastBriefed ? "blank-brief" : "not-briefed";
    flags.push(flag(b, b.task.taskId, reason));
  }

  return flags;
}

/** Build a BriefFlag from a booking input + outcome — keyed by job/task only. */
function flag(
  b: AssessBookingInput,
  taskId: string | null,
  reason: BriefFlag["reason"],
): BriefFlag {
  return {
    designerId: b.designerId,
    bookingId: b.bookingId,
    taskId,
    jobLabel: b.jobLabel,
    reason,
    isTentative: false, // tentative bookings are never reached (suppressed above)
  };
}
