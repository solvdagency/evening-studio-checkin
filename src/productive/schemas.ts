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
 * A JSON:API relationship linkage: `{ data: {id,type} | null }`. Optional at the
 * field level so a missing relationship (e.g. a booking with no `task`) parses.
 */
export const Relationship = z
  .object({
    data: z.object({ id: z.string(), type: z.string() }).nullable(),
  })
  .optional();

/**
 * Raw `/bookings` attributes. Corrected names: `booking_method_id`, `draft`,
 * `canceled`. Numeric figure fields are nullable (only one is populated per
 * `booking_method_id`); `approval_status` is the secondary absence-approval axis
 * (D-07 — not the work-tentative signal).
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
  booking_type: z.string(),
  approval_status: z.number().nullable(),
});

/** A `/bookings` resource: id, type "bookings", attributes, and the relationships used. */
export const BookingResource = z.object({
  id: z.string(),
  type: z.literal("bookings"),
  attributes: BookingAttributes,
  relationships: z.object({
    person: Relationship,
    task: Relationship,
    service: Relationship,
    event: Relationship,
  }),
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
