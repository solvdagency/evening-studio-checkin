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
import {
  buildBriefedPositionMap,
  isBriefed,
  briefHasContent,
  normalizeBriefLine,
} from "../briefed.ts";
import { assessBriefs, type BriefFlag, type AssessBookingInput } from "../brief.ts";
import { BRIEF_TEMPLATE_SKELETON, BRIEF_TEMPLATE_TAIL_ANCHORS } from "../../config.ts";
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
    const statuses = [status("s1", "Not Started", 1, "w3"), status("s2", "Working on it", 2, "w3")];
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
    const flags = assessBriefs([bookingInput({ isTentative: true, task: null })], BRIEFED_MAP);
    assert.equal(flags.length, 0);
  });

  it("internal booking (no client company) → NO flag even with no task (D-06)", () => {
    const flags = assessBriefs([bookingInput({ isClient: false, task: null })], BRIEFED_MAP);
    assert.equal(flags.length, 0);
  });

  it("non-target-day booking → NO flag (D-08 brief checks are target-day only)", () => {
    const flags = assessBriefs([bookingInput({ isTargetDay: false, task: null })], BRIEFED_MAP);
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

/* ----------------------------------------------------------------------------
 * briefHasContent — tell a REAL brief from the blank studio template (BRIEF-02,
 * Liam pilot feedback 2026-06-25). Samples are the LIVE template: UNFILLED is the
 * real unfilled task 18541491 (metadata blank, not auto-filled); FILLED mirrors a
 * real filled brief (task 18445833, HVO fact sheet), trimmed.
 * ------------------------------------------------------------------------- */

// The real blank template, verbatim shape (escaped "1\." period + ** bold + ⁃ tail).
const UNFILLED_TEMPLATE = `**FINAL CLIENT APPROVED BRIEF GOES HERE
You can copy and paste from your Client Brief or complete a new one here

DESIGN BRIEF**

**Brief Writer**:
**Project No**:
**Budget**:
**Deadline**:

**1\\. BACKGROUND - why are we here. Give us us the history:**

**2\\. WHAT DO WE NEED TO ACHIEVE - clear objectives or single outcome**

**3\\. DELIVERABLES - simply... what do you need me to do/create?**

Asset 1 *(copy and paste this if there are more than 1 asset):*

1.  What is it?
2.  Where is it going?
3.  How many are we creating?
4.  What is the size/spec?
5.  Will it be printed?
6.  Link to asset folder (images, logos, copy etc)?
7.  What exact copy is going in, or on, the asset?
8.  Detail any design direction (reference material, where colours need to go etc)

Asset 2: (paste numbers 1-8 below)

**4\\. NEXT STEPS:**

-

**5\\. OTHER DOCS, LINKS, FILES ETC**



**Designer Check-List**

⁃Must always have content or an idea what content is required before starting design.
⁃Review allocated hours and discuss with PM before you start if not adequate.
⁃Package files

**VERSION CONTROL PROCESS**

Every new version that has been created following client feedback must be saved in a new folder labeled as the version
R02 = round 2`;

const FILLED_BRIEF = `**Brief Writer**: Tay
**Project No**: HVO-227
**Budget**: 2 hrs initial design
**Deadline**: COB today

**1\\. BACKGROUND - why are we here. Give us us the history:**

We have been asked to create a fact sheet for the updated HVO continuation project proposal

**2\\. WHAT DO WE NEED TO ACHIEVE - clear objectives or single outcome**

Design 1 x double sided landscape A4 fact sheet

**3\\. DELIVERABLES - simply... what do you need me to do/create?**

Asset 1 *(copy and paste this if there are more than 1 asset):*

1.  What is it? a fact sheet showing the amended continuation project proposal

**Designer Check-List**

⁃Package files`;

const has = (d: string | null | undefined): boolean =>
  briefHasContent(d, BRIEF_TEMPLATE_SKELETON, BRIEF_TEMPLATE_TAIL_ANCHORS);

describe("briefHasContent (BRIEF-02 — real brief vs blank template, lean lenient)", () => {
  it("the LIVE unfilled template → NOT a real brief (the bug this fixes)", () => {
    assert.equal(has(UNFILLED_TEMPLATE), false);
  });

  it("a filled brief (real answers under the headings) → real brief", () => {
    assert.equal(has(FILLED_BRIEF), true);
  });

  it("a short but genuine brief → real brief (lenient: any content counts)", () => {
    assert.equal(has("Make the logo bigger and swap the hero image for the new one."), true);
  });

  it("null / empty / whitespace description → not a real brief", () => {
    assert.equal(has(null), false);
    assert.equal(has(undefined), false);
    assert.equal(has(""), false);
    assert.equal(has("   \n  \n"), false);
  });

  it("template with ONLY the boilerplate tail (check-list/version-control) → not a real brief", () => {
    const tailOnly = `**Designer Check-List**
⁃Must always do a test/proof print
**VERSION CONTROL PROCESS**
R02 = round 2`;
    assert.equal(has(tailOnly), false);
  });

  it("does not false-flag when one extra non-template line slips in (lenient direction)", () => {
    const drifted = UNFILLED_TEMPLATE.replace(
      "Asset 2: (paste numbers 1-8 below)",
      "Asset 2: (paste numbers 1-8 below)\n\nActually we also need a press ad for Mudgee Guardian",
    );
    assert.equal(has(drifted), true);
  });
});

describe("normalizeBriefLine (markdown/marker/whitespace-insensitive)", () => {
  it("strips bold markers, escaping backslashes and a leading number marker", () => {
    assert.equal(
      normalizeBriefLine(
        "**1\\. WHAT DO WE NEED TO ACHIEVE - clear objectives or single outcome**",
      ),
      "what do we need to achieve - clear objectives or single outcome",
    );
  });

  it("strips a ⁃ bullet marker and collapses whitespace", () => {
    assert.equal(normalizeBriefLine("⁃Package   files "), "package files");
  });
});
