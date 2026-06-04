/**
 * Ingestion-internal raw Productive types (Phase 2).
 *
 * Trust posture / boundary rule: these shapes describe Productive's JSON:API
 * responses as they arrive at the boundary. They are validated by the zod schemas
 * in ./schemas.ts and are for use INSIDE the src/productive/ ingestion tier ONLY.
 * They MUST NOT be imported into src/domain — the domain stays framework-agnostic
 * (Phase 1 trust boundary). Mappers (a later plan) convert these raw shapes into
 * the clean Phase-1 contracts (Booking, Absence); only those clean types cross
 * into the domain. Corrected API field names per RESEARCH "Pitfall 1".
 */

/** A JSON:API relationship linkage: `{ data: {id,type} | null }`. */
export interface RawRelationship {
  data: { id: string; type: string } | null;
}

/**
 * Raw `/bookings` resource attributes (only the fields this phase uses).
 * Corrected names: `booking_method_id` (NOT booking_method), `draft`/`canceled`
 * (NOT is_draft/is_canceled). `booking_method_id`: 1 = per-day (uses `time`),
 * 2 = percentage (uses `percentage`), 3 = total-hours (uses `total_time`).
 */
export interface RawBookingAttributes {
  booking_method_id: number;
  /** Per-day minutes (method 1); null for other methods. */
  time: number | null;
  /** Total minutes over the range (method 3); null otherwise. */
  total_time: number | null;
  /** Percentage of daily capacity (method 2); null otherwise. */
  percentage: number | null;
  /** Booking date range, "yyyy-MM-dd". */
  started_on: string;
  ended_on: string;
  /** Tentative ⟺ draft = true (D-07). */
  draft: boolean;
  /** Filter canceled = false (D-08). */
  canceled: boolean;
  /** "service" = work booking; "event" = absence booking (D-11). */
  booking_type: string;
  /** Absence approval axis (1 Approved / 2 Pending / ...); not the work-tentative signal (D-07). */
  approval_status: number | null;
}

/** A raw booking resource with the relationships this phase needs. */
export interface RawBookingResource {
  id: string;
  type: string;
  attributes: RawBookingAttributes;
  relationships: {
    person?: RawRelationship;
    task?: RawRelationship;
    service?: RawRelationship;
    event?: RawRelationship;
  };
}

/**
 * Raw `/tasks` attributes used by the briefed check (D-04): the brief lives in
 * `description` (nullable markdown); the workflow position comes from the linked
 * workflow_status resource (resolved separately).
 */
export interface RawTaskAttributes {
  title: string;
  /** Brief markdown — the D-04 non-empty guard checks this. */
  description: string | null;
  workflow_status_id: number;
  workflow_id: number;
}

/**
 * Raw `/workflow_statuses` attributes. `position` is the column order D-02/D-03
 * compare against; `category_id` is 1 Not Started / 2 Started / 3 Closed.
 */
export interface RawWorkflowStatusAttributes {
  name: string;
  position: number;
  category_id: number;
}

/**
 * Raw `/people` availabilities period (plan 06-02, CAP-06). One entry of the
 * `availabilities` array on a person resource's attributes block: the designer's
 * working-day pattern for an inclusive [started_on, ended_on] date range. Boundary
 * rule (header lines 1-11): stays INSIDE src/productive/ — the mapper converts it
 * to clean per-weekday minutes; this raw shape MUST NOT cross into src/domain.
 */
export interface RawAvailability {
  /** Period start, "yyyy-MM-dd". */
  started_on: string;
  /** Period end, "yyyy-MM-dd"; null = current/open-ended (D-01). */
  ended_on: string | null;
  /**
   * Hours-per-weekday, indexed Mon=0..Sun=6 (D-02). 7-element for a standard week;
   * 14-element for an alternating two-week schedule (D-08 — week 1 used today). A
   * 0 entry means not rostered that weekday → 0 available minutes.
   */
  working_hours: number[];
  /** Productive holiday calendar id — captured but unused (own NSW set kept). */
  holiday_calendar_id?: number | null;
}

/**
 * Raw `/people` resource attributes used by the availability pull (plan 06-02).
 * Only `availabilities` is load-bearing; everything else on the person attributes
 * block is tolerated and ignored. Boundary rule: src/productive/ only — the clean
 * per-designer per-weekday minutes lookup is what crosses into the domain.
 */
export interface RawPersonAttributes {
  /** The designer's working-day patterns (one per dated period); see RawAvailability. */
  availabilities?: RawAvailability[];
}

/** A raw `/people` resource carrying the availability attributes (plan 06-02). */
export interface RawPersonResource {
  id: string;
  type: string;
  attributes: RawPersonAttributes;
}

/** JSON:API page envelope: `data` array, optional `included`, and a `meta` block. */
export interface RawJsonApiPage {
  data: unknown[];
  included?: unknown[];
  meta: {
    current_page: number;
    total_pages: number;
    total_count: number;
    page_size: number;
  };
}
