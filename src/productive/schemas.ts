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
 * Raw `/allocations` attributes (GAP-CLOSURE — live-confirmed against org 34092).
 *
 * `/allocations` is the SUPERSET of `/bookings`: it returns confirmed time AND
 * tentative/unconfirmed time, sharing identical resource ids with `/bookings`
 * for the confirmed records. The set-difference (present-in-allocations-but-not-
 * in-bookings) is the live-confirmed tentative signal — NOT the `draft` attribute,
 * which returns 0 rows in this org (supersedes the old D-07 draft assumption).
 *
 * Two shape differences from a /bookings resource:
 *  - `booking_type` IS a real attribute here ("service" = work, "event" = absence),
 *    whereas a /bookings resource has no booking_type attribute (work-vs-absence is
 *    its service/event relationship). We capture it so gather can map only
 *    service-type tentative records (absences come from the confirmed bookings pull).
 *  - allocations carry NO task/project relationship, so tentative items can never be
 *    brief-assessed (consistent with D-08 — only confirmed client bookings flag).
 * The figure fields mirror /bookings (only one is populated per booking_method_id),
 * and the relationships are the tolerant JSON:API shape ({data}|{meta:included}).
 */
export const AllocationAttributes = z.object({
  booking_method_id: z.number(),
  time: z.number().nullable(),
  total_time: z.number().nullable(),
  percentage: z.number().nullable(),
  started_on: z.string(),
  ended_on: z.string(),
  total_working_days: z.number().nullable().optional(),
  /** "service" = work, "event" = absence (a REAL attribute on /allocations). */
  booking_type: z.string(),
  /**
   * Canceled allocations must be excluded or they resurrect as phantom tentative
   * work (CR-01): /bookings is pulled with filter[canceled]=false, so a canceled
   * allocation is absent from the confirmed set and the set-difference would wrongly
   * synthesize it as live tentative time. The raw JSON:API attribute name is
   * `canceled`, matching /bookings. Kept defensive (defaults false if the API omits
   * it) so we never crash, but a present `true` is propagated so gather skips it.
   */
  canceled: z.boolean().optional().default(false),
});

/**
 * An `/allocations` resource. `relationships` is `.loose()` (allocations return
 * person/service/event/client/responsible and we only name the work-vs-absence
 * split + person here); there is deliberately NO task/project relationship to
 * resolve. Used by gather's tentative set-difference pull (GAP-CLOSURE).
 */
export const AllocationResource = z.object({
  id: z.string(),
  type: z.literal("allocations"),
  attributes: AllocationAttributes,
  relationships: z
    .object({
      person: Relationship,
      service: Relationship,
      event: Relationship,
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
 * A single `availabilities` period on a `/people` resource (plan 06-02, CAP-06).
 *
 * LIVE SHAPE (confirmed against the real /people payload 2026-06-04, correcting the
 * plan-06-02 assumption): each period is a positional TUPLE, NOT an object —
 * `[started_on, ended_on, working_hours, holiday_calendar_id]`. The whole
 * `availabilities` value is itself a JSON-encoded string (see PersonResource).
 * We validate the tuple here and `.transform()` it into the named-field object the
 * mapper consumes (mappers.ts RawAvailabilityForMapping), so all wire-shape handling
 * stays at this boundary and `availabilityToWeekdayMinutes` keeps reading clean fields.
 * Boundary discipline (header lines 1-15): validate only what's used, tolerate trailing
 * fields (`.rest`), and only ever `.safeParse` this — never `.parse`.
 *  - `ended_on` is nullable (D-01): null = current/open-ended period.
 *  - `working_hours` is a numeric array; length is NOT pinned here (7 vs 14 is the
 *    mapper's job, D-08 — see mappers.ts availabilityToWeekdayMinutes).
 *  - `holiday_calendar_id` (tuple index 3) is captured-but-unused (own NSW set kept).
 */
export const AvailabilityPeriod = z
  .tuple([
    z.string(), // [0] started_on
    z.string().nullable(), // [1] ended_on (null = open-ended, D-01)
    z.array(z.number()), // [2] working_hours (7- or 14-element; mapper handles, D-08)
  ])
  .rest(z.unknown()) // [3+] holiday_calendar_id and any future trailing fields — tolerated
  .transform(([started_on, ended_on, working_hours, holiday_calendar_id]) => ({
    started_on,
    ended_on,
    working_hours,
    holiday_calendar_id: typeof holiday_calendar_id === "number" ? holiday_calendar_id : null,
  }));

/**
 * Productive serialises `attributes.availabilities` as a JSON-encoded STRING
 * (confirmed against the live /people payload 2026-06-04 — NOT a native array, which
 * is what plan 06-02 first assumed and why every designer failed validation). Parse
 * it here at the boundary: a non-string is passed through untouched, and malformed
 * JSON is returned as-is so the downstream `z.array(AvailabilityPeriod)` fails the
 * safeParse → that designer degrades to "couldn't read" (D-06), never a fabricated
 * capacity.
 */
function parseAvailabilitiesJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * A `/people` resource carrying the designer's working-day availability (plan
 * 06-02, CAP-06). Mirrors `AllocationResource`'s id/type/attributes shape. The
 * load-bearing field is `attributes.availabilities`; the attributes object is
 * `.loose()` so every other person attribute (name, email, etc.) is tolerated and
 * never breaks the parse. `availabilities` arrives as a JSON string (decoded by
 * `parseAvailabilitiesJson`) of tuple periods; it is OPTIONAL so a person row
 * missing it still parses (the mapper then yields all-zero → that designer reads as
 * missing, D-06, never a fabricated capacity). safeParse-only (header lines 1-15).
 */
export const PersonResource = z.object({
  id: z.string(),
  type: z.literal("people"),
  attributes: z
    .object({
      availabilities: z.preprocess(parseAvailabilitiesJson, z.array(AvailabilityPeriod)).optional(),
    })
    .loose(),
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
