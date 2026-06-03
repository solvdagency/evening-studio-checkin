/**
 * Dynamic "Briefed" column resolution + the core briefed judgment (D-02/D-03/D-04).
 *
 * "Briefed" is NOT a custom field — it is a workflow-status COLUMN named "Briefed"
 * that each workflow may contain at its own POSITION (D-01). This module builds a
 * per-workflow `{ workflowId → Briefed position }` map from a /workflow_statuses
 * response, resolved by the status NAME "Briefed" — the 6 live status IDs are
 * NEVER hardcoded (D-03; if SOLVD reorders columns or adds a workflow the logic
 * keeps working). If a workflow has no "Briefed" status it is simply absent from
 * the map → fail safe to not-briefed.
 *
 * The load-bearing subtlety (D-02, RESEARCH Pitfall 3): a task is briefed when its
 * status is AT OR PAST the Briefed column (position >= briefedPos), NOT when its
 * status === "Briefed". A task briefed days ago has usually moved forward
 * ("Working on it", "Client review") and is still briefed — a `=== Briefed` check
 * would wrongly flag active work and kill trust. The false-trust guard (D-04): a
 * task sitting at/past Briefed with a BLANK description is NOT briefed (the live
 * "R1 EDM Design" case — Briefed column, only the unfilled brief template).
 *
 * Pure + fail-safe like src/domain/capacity.ts: takes already-resolved inputs,
 * returns a decision, never throws. `undefined`/missing → false (the briefed
 * analogue of Phase 1's "coerce to 0 / floor at 0" defensive instinct).
 */

/** The name of the workflow-status column that marks a task as briefed (D-01). */
const BRIEFED_STATUS_NAME = "Briefed";

/**
 * The minimal /workflow_statuses resource shape this module reads (matches the
 * zod `WorkflowStatusResource` in ./schemas.ts). `attributes.name` is matched
 * against "Briefed"; `attributes.position` is the column order; the `workflow`
 * relationship linkage gives the workflow id the position is keyed by (D-03).
 */
export interface RawWorkflowStatus {
  id: string;
  type: string;
  attributes: { name: string; position: number; category_id?: number };
  relationships: {
    workflow?: { data?: { id: string; type: string } | null; meta?: unknown } | undefined;
  };
}

/**
 * The resolved-task-status inputs `isBriefed` compares: which workflow the task's
 * status belongs to, that status's position, and whether the task description is
 * non-empty. Pre-resolved by the gather step so this module stays pure/testable.
 */
export interface TaskStatusForBrief {
  workflowId: string;
  position: number;
  /** True when the task description (the brief markdown) has content (D-04). */
  descriptionNonEmpty: boolean;
}

/**
 * Build the per-workflow Briefed-position map from a /workflow_statuses response
 * (D-01/D-03). For each status whose name is exactly "Briefed", record
 * `{ workflowId → position }`, keyed by the status's `workflow` relationship id.
 *
 * Resolved by NAME, never by id — the live status ids (101563, 111230, …) are
 * intentionally absent from this file (D-03). The match is case-sensitive on the
 * exact studio convention "Briefed" seen in the live spike; statuses with no
 * workflow linkage are skipped (cannot key a position without a workflow).
 */
export function buildBriefedPositionMap(
  statuses: readonly RawWorkflowStatus[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of statuses) {
    if (s.attributes.name !== BRIEFED_STATUS_NAME) continue;
    const workflowId = s.relationships.workflow?.data?.id ?? null;
    if (workflowId === null) continue; // no workflow linkage → cannot key a position
    map.set(workflowId, s.attributes.position);
  }
  return map;
}

/**
 * Is a task briefed? At OR past the Briefed column in its own workflow (D-02) AND
 * non-empty description (D-04). A workflow with no Briefed position in the map →
 * false (D-03 fail safe). Mirrors capacity.classifyDay's pure, ordered, D-cited
 * style — never hardcodes a status id, never throws.
 */
export function isBriefed(
  taskStatus: TaskStatusForBrief,
  briefedPositionByWorkflow: ReadonlyMap<string, number>,
): boolean {
  const briefedPos = briefedPositionByWorkflow.get(taskStatus.workflowId);
  if (briefedPos === undefined) return false; // D-03: no Briefed column → fail safe
  return taskStatus.position >= briefedPos // D-02: at OR past Briefed (not ===)
    && taskStatus.descriptionNonEmpty; // D-04: non-empty brief guard
}
