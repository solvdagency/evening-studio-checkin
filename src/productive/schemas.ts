/**
 * zod boundary schemas for Productive JSON:API responses (Phase 2).
 *
 * Trust posture: this is the validation gate where untrusted external JSON enters
 * (threat T-02-03). Every fetched page is validated with `.safeParse` (NEVER
 * `.parse`, which throws) so a shape drift degrades to a Result error instead of
 * crashing the nightly run. Schemas validate only the fields this phase uses and
 * are tolerant of extra fields — a new Productive attribute must never break the
 * pull. Implements the CORRECTED API field names from RESEARCH "Pitfall 1":
 * `booking_method_id`, `draft`, `canceled` (NOT booking_method / is_draft /
 * is_canceled). Used by ./client.ts (page validation) and later mappers/briefed.
 *
 * Export posture: only `safeParse`-usable schemas are exported; no `.parse`
 * wrapper is exported (anti-pattern — would throw across the boundary).
 */

import { z } from "zod";

/**
 * A JSON:API relationship as Productive actually returns it (confirmed against a
 * live /bookings response, Task 4). A relationship is EITHER a linkage
 * `{ data: {id,type} | null }` when the related resource is sideloaded/linked, OR
 * a not-included marker `{ meta: { included: false } }` when it was not requested
 * in `include`. The schema must tolerate both, or a populated booking with
 * un-included relationships (person/creator/etc.) fails to parse. `.loose()` keeps
 * any extra relationship keys (Productive returns ~15 per booking). Optional at the
 * field level so a missing relationship parses too.
 */
export const Relationship = z
  .object({
    data: z.object({ id: z.string(), type: z.string() }).nullable().optional(),
    meta: z.object({ included: z.boolean() }).loose().optional(),
  })
  .loose()
  .optional();

/**
 * Raw `/bookings` attributes (confirmed against a live response, Task 4).
 * Corrected names: `booking_method_id`, `draft`, `canceled`. Numeric figure
 * fields are nullable (only one is populated per `booking_method_id`).
 *
 * Two CONTEXT/research assumptions were corrected against live data:
 *  - There is NO `booking_type` ATTRIBUTE. Work-vs-absence (D-11) is determined by
 *    which RELATIONSHIP is populated: `service` (work) vs `event` (absence). The
 *    `filter[booking_type]` query param still works server-side; it is just not an
 *    attribute on the resource.
 *  - There is NO `approval_status` integer attribute. The live model uses
 *    `approved` / `rejected` booleans (D-07 says this axis is NOT the work-tentative
 *    signal anyway — tentative ⟺ `draft`). Both are kept OPTIONAL/tolerant so the
 *    schema neither requires a field the API omits nor breaks if Productive re-adds one.
 * `total_working_days` is sideloaded by the API (handy for the D-09 method-3 divisor)
 * and is kept optional. Extra attributes are tolerated by zod's default object parse.
 */
export const BookingAttributes = z.object({
  booking_method_id: z.number(),
  time: z.number().nullable(),
  total_time: z.number().nullable(),
  percentage: z.number().nullable(),
  started_on: z.string(),
  ended_on: z.string(),
  draft: z.boolean(),
  canceled: z.boolean(),
  approved: z.boolean().optional(),
  rejected: z.boolean().optional(),
  total_working_days: z.number().nullable().optional(),
});

/**
 * A `/bookings` resource. `relationships` is a loose object: Productive returns
 * ~15 relationship keys per booking and we only name the four this phase uses;
 * `.loose()` keeps the rest so a new relationship never breaks the parse. Work
 * vs absence is read from `service` vs `event` here, not from an attribute.
 */
export const BookingResource = z.object({
  id: z.string(),
  type: z.literal("bookings"),
  attributes: BookingAttributes,
  relationships: z
    .object({
      person: Relationship,
      task: Relationship,
      service: Relationship,
      event: Relationship,
    })
    .loose(),
});

/**
 * Raw `/tasks` attributes used by the briefed check (D-04). `description` is the
 * nullable brief markdown the non-empty guard inspects.
 */
export const TaskAttributes = z.object({
  title: z.string(),
  description: z.string().nullable(),
  workflow_status_id: z.number(),
  workflow_id: z.number(),
});

/**
 * Raw `/workflow_statuses` attributes. `position` is the column order D-02/D-03
 * compare the linked task's status position against.
 */
export const WorkflowStatusAttributes = z.object({
  name: z.string(),
  position: z.number(),
  category_id: z.number(),
});

/**
 * A `/workflow_statuses` resource. The `workflow` relationship linkage carries
 * the workflow id the Briefed position is keyed by (D-03 — resolve per workflow).
 * The relationship is `included: false` by default on a status, so the gather
 * step requests `/workflow_statuses` directly (where each status DOES carry its
 * `workflow` linkage) rather than relying on a deep nested include (RESEARCH A7).
 */
export const WorkflowStatusResource = z.object({
  id: z.string(),
  type: z.literal("workflow_statuses"),
  attributes: WorkflowStatusAttributes,
  relationships: z
    .object({
      workflow: Relationship,
    })
    .loose(),
});

/**
 * D-06 internal-vs-client signal: a small, tolerant `/projects` resource schema.
 * The individual project attributes are NOT load-bearing here, so `attributes`
 * is a loose/passthrough object. The load-bearing field is the `company`
 * relationship: a client project links to a `company`; an internal/overhead
 * project has none. The relationship is NULLABLE/OPTIONAL so that the ABSENCE of
 * a client company is the (robust, enum-independent) internal-vs-client signal
 * the gather step in a later plan reads through this same zod boundary.
 */
export const ProjectResource = z.object({
  id: z.string(),
  attributes: z.object({}).loose(),
  relationships: z
    .object({
      company: Relationship,
    })
    .optional(),
});

/**
 * JSON:API page envelope. `data` is an untyped array (each element is validated
 * by the resource schema appropriate to the call); `included` is optional;
 * `meta` carries the pagination figures the client's paginate loop reads.
 */
export const JsonApiPage = z.object({
  data: z.array(z.unknown()),
  included: z.array(z.unknown()).optional(),
  meta: z.object({
    current_page: z.number(),
    total_pages: z.number(),
    total_count: z.number(),
    page_size: z.number(),
  }),
});
