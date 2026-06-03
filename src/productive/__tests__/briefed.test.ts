/**
 * Tests for the dynamic Briefed-position resolution + isBriefed judgment
 * (Task 1, plan 02-03) and the BriefFlag emission (Task 2, plan 02-03).
 *
 * The load-bearing subtlety (D-02): "briefed" is at-OR-PAST the Briefed column,
 * not status === "Briefed" (Pitfall 3). A task that has moved forward to "Working
 * on it" is still briefed. The false-trust guard (D-04): a task sitting in/past
 * Briefed with a BLANK description is NOT briefed (the live "R1 EDM Design" case).
 * The fail-safe (D-03): a workflow with no Briefed column → not briefed.
 *
 * The Briefed POSITION is resolved per workflow by the status NAME "Briefed" from
 * a /workflow_statuses fixture — the 6 live status IDs are NEVER hardcoded.
 *
 * Run: node --import tsx --test "src/productive/__tests__/briefed.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBriefedPositionMap, isBriefed } from "../briefed.ts";
import { assessBriefs, type BriefFlag, type AssessBookingInput } from "../brief.ts";
import type { DesignerId } from "../../domain/types.ts";

const DESIGNER = "686717" as DesignerId;

/**
 * Build a /workflow_statuses-shaped resource. `name` is the column name (the
 * "Briefed" name is what the map resolves on); `position` is the column order;
 * the `workflow` relationship linkage carries the workflow id the position is
 * keyed by. Mirrors the live shape: workflow_status → workflow relationship.
 */
function status(
  id: string,
  name: string,
  position: number,
  workflowId: string,
): {
  id: string;
  type: string;
  attributes: { name: string; position: number; category_id: number };
  relationships: { workflow: { data: { id: string; type: string } } };
} {
  return {
    id,
    type: "workflow_statuses",
    attributes: { name, position, category_id: 2 },
    relationships: { workflow: { data: { id: workflowId, type: "workflows" } } },
  };
}

describe("buildBriefedPositionMap (D-01 / D-03 — resolve Briefed position by NAME)", () => {
  it("maps each workflow id to the position of its status named 'Briefed'", () => {
    // SOLVD Standard (workflow "w1") → Briefed at position 3 (D-01 live).
    // SOLVD Design Retainers (workflow "w2") → Briefed at position 2 (D-01 live).
    const statuses = [
      status("s1", "Not Started", 1, "w1"),
      status("s2", "Quoting", 2, "w1"),
      status("s3", "Briefed", 3, "w1"),
      status("s4", "Working on it", 4, "w1"),
      status("s5", "Not Started", 1, "w2"),
      status("s6", "Briefed", 2, "w2"),
    ];
    const map = buildBriefedPositionMap(statuses);
    assert.equal(map.get("w1"), 3);
    assert.equal(map.get("w2"), 2);
  });

  it("a workflow with no 'Briefed' status is absent from the map (D-03 fail safe)", () => {
    const statuses = [
      status("s1", "Not Started", 1, "w3"),
      status("s2", "Working on it", 2, "w3"),
    ];
    const map = buildBriefedPositionMap(statuses);
    assert.equal(map.has("w3"), false);
  });

  it("resolves by name not id — does not depend on the live status ids", () => {
    const statuses = [status("999999", "Briefed", 5, "w9")];
    const map = buildBriefedPositionMap(statuses);
    assert.equal(map.get("w9"), 5);
  });
});

describe("isBriefed (D-02 at-or-past / D-04 non-empty / D-03 fail safe)", () => {
  const map = new Map<string, number>([
    ["w1", 3],
    ["w2", 2],
  ]);

  it("at Briefed (position === briefedPos) + non-empty → briefed", () => {
    assert.equal(
      isBriefed({ workflowId: "w1", position: 3, descriptionNonEmpty: true }, map),
      true,
    );
  });

  it("past Briefed (Working on it, position > briefedPos) + non-empty → still briefed (D-02 load-bearing)", () => {
    assert.equal(
      isBriefed({ workflowId: "w1", position: 4, descriptionNonEmpty: true }, map),
      true,
    );
  });

  it("before Briefed (Not Started, position < briefedPos) → not briefed", () => {
    assert.equal(
      isBriefed({ workflowId: "w1", position: 1, descriptionNonEmpty: true }, map),
      false,
    );
  });

  it("at/past Briefed but BLANK description → not briefed (D-04 blank-brief, R1 EDM case)", () => {
    assert.equal(
      isBriefed({ workflowId: "w1", position: 3, descriptionNonEmpty: false }, map),
      false,
    );
  });

  it("task's workflow has no Briefed status (not in map) → not briefed (D-03 fail safe)", () => {
    assert.equal(
      isBriefed({ workflowId: "w-unknown", position: 9, descriptionNonEmpty: true }, map),
      false,
    );
  });
});

/* ----------------------------------------------------------------------------
 * Task 2 — assessBriefs: BriefFlag emission by job/task (BRIEF-01/02/03)
 * ------------------------------------------------------------------------- */

const BRIEFED_MAP = new Map<string, number>([["w1", 3]]);

/** Build an assessBriefs booking input with sensible client/confirmed defaults. */
function bookingInput(partial: Partial<AssessBookingInput>): AssessBookingInput {
  return {
    designerId: DESIGNER,
    bookingId: "b1",
    isTentative: false,
    isClient: true,
    isTargetDay: true,
    jobLabel: "Acme — Homepage hero",
    task: null,
    ...partial,
  };
}

describe("assessBriefs (BRIEF-01/02/03 — flag by job/task, never by PM)", () => {
  it("confirmed client booking with no task → reason 'no-task', taskId null (BRIEF-01 / D-10)", () => {
    const flags = assessBriefs([bookingInput({ task: null })], BRIEFED_MAP);
    assert.equal(flags.length, 1);
    assert.equal(flags[0].reason, "no-task");
    assert.equal(flags[0].taskId, null);
    assert.equal(flags[0].jobLabel, "Acme — Homepage hero");
  });

  it("confirmed booking whose task is before Briefed → reason 'not-briefed' (BRIEF-02)", () => {
    const flags = assessBriefs(
      [
        bookingInput({
          task: { taskId: "t1", workflowId: "w1", position: 1, descriptionNonEmpty: true },
        }),
      ],
      BRIEFED_MAP,
    );
    assert.equal(flags.length, 1);
    assert.equal(flags[0].reason, "not-briefed");
    assert.equal(flags[0].taskId, "t1");
  });

  it("confirmed booking at/past Briefed but blank description → reason 'blank-brief' (D-04)", () => {
    const flags = assessBriefs(
      [
        bookingInput({
          task: { taskId: "t2", workflowId: "w1", position: 4, descriptionNonEmpty: false },
        }),
      ],
      BRIEFED_MAP,
    );
    assert.equal(flags.length, 1);
    assert.equal(flags[0].reason, "blank-brief");
  });

  it("confirmed booking fully briefed (at/past Briefed + non-empty) → no flag", () => {
    const flags = assessBriefs(
      [
        bookingInput({
          task: { taskId: "t3", workflowId: "w1", position: 3, descriptionNonEmpty: true },
        }),
      ],
      BRIEFED_MAP,
    );
    assert.equal(flags.length, 0);
  });

  it("tentative (draft) booking → NO flag regardless of brief state (D-05)", () => {
    const flags = assessBriefs(
      [bookingInput({ isTentative: true, task: null })],
      BRIEFED_MAP,
    );
    assert.equal(flags.length, 0);
  });

  it("internal booking (no client company) → NO flag even with no task (D-06)", () => {
    const flags = assessBriefs(
      [bookingInput({ isClient: false, task: null })],
      BRIEFED_MAP,
    );
    assert.equal(flags.length, 0);
  });

  it("non-target-day booking → NO flag (D-08 brief checks are target-day only)", () => {
    const flags = assessBriefs(
      [bookingInput({ isTargetDay: false, task: null })],
      BRIEFED_MAP,
    );
    assert.equal(flags.length, 0);
  });

  it("flags are keyed by job/task only — BriefFlag has no PM/manager field (BRIEF-03)", () => {
    const flags = assessBriefs([bookingInput({ task: null })], BRIEFED_MAP);
    const flag: BriefFlag = flags[0];
    const keys = Object.keys(flag);
    for (const forbidden of ["pm", "manager", "owner", "approver"]) {
      assert.equal(keys.includes(forbidden), false);
    }
  });
});
