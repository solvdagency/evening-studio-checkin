/**
 * Ingestion composition root — the twin of src/domain/report.ts::computeStudioReport.
 *
 * `gather` is the single call that makes Phase 2 real: it pulls the three
 * monitored designers' bookings + absences over the target→Friday window,
 * validates every response at the zod boundary, normalizes per-day minutes
 * (D-09), resolves the brief chain (D-02/D-03/D-04/D-06), and assembles exactly
 * what Phase 3 needs:
 *   { bookings, absences, briefFlags, holidays, assessedDesigners, sourceErrors }
 *
 * Composition style mirrors computeStudioReport (report.ts lines 164-223): an
 * injected-deps object (so `now` + the page fetcher are stubbable and the
 * function stays deterministic and unit-testable), pure helpers called in order,
 * and a WELL-FORMED object returned even on empty/partial/failed input.
 *
 * Trust posture — this function NEVER throws across the boundary (RESEARCH
 * Pitfall 6 / threats T-02-14, T-02-18). Every source failure — a Result error
 * from the client, a zod shape drift, a missing credential — is accumulated into
 * `sourceErrors` and the run DEGRADES rather than crashing the nightly post. The
 * /projects response that carries the D-06 internal-vs-client signal is parsed
 * through the `ProjectResource` zod schema with `safeParse` (never trusted raw).
 *
 * Window + brief scope (D-08): the rest-of-week window feeds the rollup; the
 * brief checks apply ONLY to the target-day confirmed client bookings. Each
 * mapped booking/absence carries a `date` per window day so the report's rollup
 * attributes minutes to the correct slot (DatedBooking / DatedAbsence).
 *
 * assessedDesigners semantics (report.ts lines 76-87): gather passes ONLY the
 * designers a successful pull actually covered. A designer the pull failed to
 * reach is OMITTED so computeStudioReport names them in `missingDesigners`
 * (silent-partial-result guard, T-02-15 / T-01-06) — a partial pull can never
 * masquerade as a complete report.
 *
 * Live-confirmed include set + signals (02-03 SUMMARY):
 *   /bookings include = task,task.workflow_status,task.project,task.project.company
 *   /workflow_statuses?include=workflow → Briefed-position map + statusId index
 *   isClient ⟺ project.project_type_id === 2 (client); internal === 1 (NOT
 *   company-absence, which is unreliable for SOLVD).
 */

import type { DateTime } from "luxon";
import type { Absence, Booking, DesignerId, HolidaySet } from "../domain/types.ts";
import type { DatedBooking, DatedAbsence } from "../domain/report.ts";
import { nextWorkingDay, restOfWeekWindow } from "../domain/clock.ts";
import { fetchAllPages, type Result } from "./client.ts";
import {
  BookingResource,
  WorkflowStatusResource,
  ProjectResource,
  AllocationResource,
  PersonResource,
} from "./schemas.ts";
import {
  mapToBookingsAndAbsences,
  availabilityToWeekdayMinutes,
  rosteredMinutesForWeekday,
  type RawBookingForMapping,
  type RawAvailabilityForMapping,
} from "./mappers.ts";
import { buildBriefedPositionMap, briefHasContent, type RawWorkflowStatus } from "./briefed.ts";
import { assessBriefs, type AssessBookingInput, type BriefFlag } from "./brief.ts";
import { buildHolidaySet, yearsForWindow } from "../holidays.ts";
import {
  DESIGNER_PERSON_IDS,
  STUDIO_CLOSURES,
  BRIEF_TEMPLATE_SKELETON,
  BRIEF_TEMPLATE_TAIL_ANCHORS,
} from "../config.ts";
import type { ActiveClient } from "../config.ts";

/**
 * What `gather` produces — everything Phase 3 needs. `bookings`/`absences` are
 * dated per window day (DatedBooking/DatedAbsence) so computeStudioReport's
 * rollup attributes them correctly; brief flags are target-day-only (D-08).
 */
export interface GatherResult {
  /** Per-window-day work bookings (tagged with `date`), ready for the report. */
  bookings: DatedBooking[];
  /** Per-window-day absences (tagged with `date`), ready for the report. */
  absences: DatedAbsence[];
  /** Brief flags for confirmed client target-day bookings only (D-08). */
  briefFlags: BriefFlag[];
  /** The injected holiday set the report reuses (no second build). */
  holidays: HolidaySet;
  /** ONLY the designers the pull actually reached (report → missingDesigners). */
  assessedDesigners: DesignerId[];
  /**
   * Per-designer per-day ROSTERED minutes (CAP-06 / D-01 / D-02) — the lookup the
   * report's available-minutes basis is built from. Given a designer id and a
   * studio-zone "yyyy-MM-dd" date key, returns that designer's real rostered
   * minutes for the matching weekday (e.g. Anisha = 0 on Wed/Fri). Sourced from the
   * /people `availabilities` pull, parsed at the zod boundary and mapped to exact
   * integer minutes. A designer with NO readable availability returns 0 here AND is
   * omitted from `assessedDesigners` (D-06) — so the report names them "couldn't
   * read", never silently invents a flat-7.5h day. Satisfies the Plan-01
   * StudioReportInput.rosteredMinutes contract; src/index.ts passes it straight in.
   */
  rosteredMinutes: (designerId: DesignerId, dateKey: string) => number;
  /** Accumulated source failures — non-empty means a degraded run, never a crash. */
  sourceErrors: string[];
  /**
   * Open Q1 — each assessed designer's set of booked CLIENT company ids for the
   * TARGET day, derived from the SAME already-fetched bookings `included` (NO
   * second /bookings call). The Phase-4 meeting reconciler consumes this ready-
   * made Set per designer to decide same-day coverage (D-01/D-02/D-03); it never
   * recomputes hours. Every assessed designer is initialised to an empty Set
   * (empty, never undefined) so "no client booking" is distinct from "unread".
   * Domain `Booking` is deliberately NOT extended — src/domain stays untouched.
   */
  bookedClientsByDesignerDay: Record<DesignerId, Set<string>>;
  /**
   * Live active-client companies — every company with an OPEN client project
   * (status=1, project_type=2), pulled fresh each run (Liam pilot feedback
   * 2026-06-25). The meeting reconciler whole-phrase-matches these so real client
   * meetings are caught even when the curated alias map doesn't know the client.
   * Empty on a failed/degraded pull (reconcile then falls back to the curated map).
   */
  activeClients: ActiveClient[];
  /**
   * Per-designer TARGET-DAY booked task/service labels (job titles). Feeds the
   * narrow "needs its own booking" reconciler rule (Problem/SOLVD): generic company
   * time doesn't cover such a meeting, but a same-named booking label does. Every
   * assessed designer is initialised to an empty array.
   */
  bookedLabelsByDesignerDay: Record<DesignerId, string[]>;
}

/**
 * Injected dependencies (mirrors report.ts's injected `now` for determinism).
 * `fetchPages` defaults to the real `fetchAllPages` client; tests pass a stub so
 * gather runs with no network. `now` is the injected studio-zone clock.
 */
export interface GatherDeps {
  now: DateTime;
  /** Page fetcher: (path, query) → Result of accumulated data+included. */
  fetchPages?: (
    path: string,
    query: string,
  ) => Promise<Result<{ data: unknown[]; included: unknown[] }>>;
}

/** A resolved task status: its workflow id + column position + brief non-empty. */
interface ResolvedTask {
  taskId: string;
  workflowId: string;
  position: number;
  descriptionNonEmpty: boolean;
  /** project_type_id of the task's project: client=2, internal=1 (D-06). */
  isClient: boolean;
  /** Project/task title for the human jobLabel — never a PM (BRIEF-03). */
  jobLabel: string;
}

/** A `workflow_status` entry indexed by id → { workflowId, position }. */
interface StatusIndexEntry {
  workflowId: string;
  position: number;
}

/** Pull the linkage id off a tolerant relationship ({data}|{meta}|absent). */
function relId(rel: { data?: { id: string; type: string } | null } | undefined): string | null {
  return rel?.data?.id ?? null;
}

/**
 * True when a task description is a REAL brief, not just the unfilled studio
 * template (BRIEF-02 false-trust guard / Liam pilot feedback 2026-06-25). The
 * brief template is auto-inserted into the description on task creation, so a
 * merely non-empty description is NOT proof of a written brief. `briefHasContent`
 * strips the fixed template skeleton + boilerplate tail (committed config) and
 * checks whether any real content remains. Lean lenient — any genuine content
 * counts — to avoid false "not briefed" flags (Liam's explicit instruction).
 */
function descriptionNonEmpty(description: string | null | undefined): boolean {
  return briefHasContent(description, BRIEF_TEMPLATE_SKELETON, BRIEF_TEMPLATE_TAIL_ANCHORS);
}

/**
 * Build the brief-resolution indexes from a /workflow_statuses?include=workflow
 * pull: the Briefed-position map (workflowId → position, by NAME, D-03) and a
 * statusId → { workflowId, position } index (a task exposes only its status id;
 * its workflow is resolved through this index — 02-03 decision). Parses every
 * status through the `WorkflowStatusResource` zod schema (safeParse); a drifted
 * entry is skipped, never thrown.
 */
function indexWorkflowStatuses(data: unknown[]): {
  briefedMap: Map<string, number>;
  statusIndex: Map<string, StatusIndexEntry>;
} {
  const validStatuses: RawWorkflowStatus[] = [];
  const statusIndex = new Map<string, StatusIndexEntry>();

  for (const raw of data) {
    const parsed = WorkflowStatusResource.safeParse(raw);
    if (!parsed.success) continue; // drift → skip this status, never throw
    const s = parsed.data;
    const workflowId = s.relationships.workflow?.data?.id ?? null;
    if (workflowId === null) continue; // cannot key a position without a workflow
    statusIndex.set(s.id, { workflowId, position: s.attributes.position });
    validStatuses.push({
      id: s.id,
      type: s.type,
      attributes: {
        name: s.attributes.name,
        position: s.attributes.position,
        category_id: s.attributes.category_id,
      },
      relationships: { workflow: { data: { id: workflowId, type: "workflows" } } },
    });
  }

  return { briefedMap: buildBriefedPositionMap(validStatuses), statusIndex };
}

/**
 * Build a projectId → isClient map from a /projects?include=company response,
 * parsed through the `ProjectResource` zod boundary (safeParse — never raw, D-06
 * / threat T-02-18). isClient ⟺ project_type_id === 2 (client); 1 = internal.
 * A project that fails to parse or has no resolvable type is treated fail-safe
 * (omitted → the booking is later treated internal and NOT brief-flagged, so a
 * shape drift can never manufacture a false client flag).
 */
function indexProjects(included: unknown[]): Map<string, boolean> {
  const isClientByProject = new Map<string, boolean>();
  for (const raw of included) {
    // Only consider resources that look like projects (cheap pre-filter).
    if (
      typeof raw !== "object" ||
      raw === null ||
      (raw as { type?: unknown }).type !== "projects"
    ) {
      continue;
    }
    const parsed = ProjectResource.safeParse(raw);
    if (!parsed.success) continue; // drift → skip (fail-safe internal)
    const attrs = parsed.data.attributes as { project_type_id?: unknown };
    const typeId = attrs.project_type_id;
    // D-06: client === 2. Anything else (internal=1, unknown) → not client.
    isClientByProject.set(parsed.data.id, typeId === 2);
  }
  return isClientByProject;
}

/**
 * Build a taskId → companyId map (Open Q1) from the bookings `included`, reading
 * the SAME already-fetched task → project → company linkage (NO second call).
 * Path: task.relationships.project.data.id → (project in included)
 * .relationships.company.data.id. A task with no resolvable client company is
 * simply absent from the map (the booking then contributes no company id — a
 * fail-safe that can never manufacture a false client). All reads go through the
 * tolerant relId reader; nothing is parsed raw beyond a cheap type pre-filter.
 */
function indexTaskCompany(included: unknown[]): Map<string, string> {
  // First: projectId → companyId.
  const companyByProject = new Map<string, string>();
  for (const raw of included) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      (raw as { type?: unknown }).type !== "projects"
    ) {
      continue;
    }
    const p = raw as {
      id: string;
      relationships?: { company?: { data?: { id: string; type: string } | null } };
    };
    const companyId = relId(p.relationships?.company);
    if (companyId !== null) companyByProject.set(p.id, companyId);
  }

  // Then: taskId → companyId (via the task's project).
  const companyByTask = new Map<string, string>();
  for (const raw of included) {
    if (typeof raw !== "object" || raw === null || (raw as { type?: unknown }).type !== "tasks") {
      continue;
    }
    const t = raw as {
      id: string;
      relationships?: { project?: { data?: { id: string; type: string } | null } };
    };
    const projectId = relId(t.relationships?.project);
    if (projectId === null) continue;
    const companyId = companyByProject.get(projectId);
    if (companyId !== undefined) companyByTask.set(t.id, companyId);
  }

  return companyByTask;
}

/**
 * Resolve every sideloaded task into a ResolvedTask keyed by task id. A task
 * exposes its current status via the `workflow_status` relationship (id only);
 * the status's workflow + position come from the workflow_status index. The
 * task's `project` relationship → project_type_id (via the project map) gives
 * D-06 isClient. jobLabel is the task title (never a PM, BRIEF-03).
 */
function indexTasks(
  included: unknown[],
  statusIndex: ReadonlyMap<string, StatusIndexEntry>,
  isClientByProject: ReadonlyMap<string, boolean>,
): Map<string, ResolvedTask> {
  const tasks = new Map<string, ResolvedTask>();
  for (const raw of included) {
    if (typeof raw !== "object" || raw === null || (raw as { type?: unknown }).type !== "tasks") {
      continue;
    }
    const t = raw as {
      id: string;
      attributes?: { title?: string; description?: string | null };
      relationships?: {
        workflow_status?: { data?: { id: string; type: string } | null };
        project?: { data?: { id: string; type: string } | null };
      };
    };
    const statusId = relId(t.relationships?.workflow_status);
    const projectId = relId(t.relationships?.project);
    const entry = statusId !== null ? statusIndex.get(statusId) : undefined;
    // A task with an unresolvable status cannot be position-compared; record it
    // with a sentinel workflow so isBriefed fails safe to not-briefed (D-03).
    tasks.set(t.id, {
      taskId: t.id,
      workflowId: entry?.workflowId ?? "",
      position: entry?.position ?? -1,
      descriptionNonEmpty: descriptionNonEmpty(t.attributes?.description),
      isClient: projectId !== null ? (isClientByProject.get(projectId) ?? false) : false,
      jobLabel: t.attributes?.title ?? "Untitled job",
    });
  }
  return tasks;
}

/** Coerce one raw booking page entry into the mapper's structural input shape. */
function asRawBooking(parsed: ReturnType<typeof BookingResource.parse>): RawBookingForMapping {
  const r = parsed.relationships as {
    person?: { data?: { id: string; type: string } | null; meta?: unknown };
    service?: { data?: { id: string; type: string } | null; meta?: unknown };
    event?: { data?: { id: string; type: string } | null; meta?: unknown };
  };
  return {
    id: parsed.id,
    type: parsed.type,
    attributes: {
      booking_method_id: parsed.attributes.booking_method_id,
      time: parsed.attributes.time,
      total_time: parsed.attributes.total_time,
      percentage: parsed.attributes.percentage,
      started_on: parsed.attributes.started_on,
      ended_on: parsed.attributes.ended_on,
      draft: parsed.attributes.draft,
      canceled: parsed.attributes.canceled,
    },
    relationships: { person: r.person, service: r.service, event: r.event },
  };
}

/**
 * GAP-CLOSURE — coerce a tentative (allocation-only, service-type) allocation into
 * the mapper's RawBookingForMapping shape so it reuses the EXACT per-day minutes
 * logic (minutesOnDay / booking_method / total_time / total_working_days) the
 * confirmed bookings get. We force `draft: true` so mapToBookingsAndAbsences tags
 * it `isTentative: true` — that is the contract the mapper reads to mark tentative
 * work, and it flows untouched through the existing capacity machinery
 * (tentativeMin / shaky / never closes the gap — Phase-1 D-04/D-05).
 *
 * Scope boundary (approved approach): only `booking_type === "service"` (work)
 * allocations are synthesized. Tentative `event`-type allocation-only records are
 * IGNORED here — absences come from the confirmed /bookings event pull only; we
 * never synthesize a tentative absence.
 */
function tentativeAllocationToRawBooking(
  parsed: ReturnType<typeof AllocationResource.parse>,
): RawBookingForMapping {
  const r = parsed.relationships as {
    person?: { data?: { id: string; type: string } | null; meta?: unknown };
    service?: { data?: { id: string; type: string } | null; meta?: unknown };
    event?: { data?: { id: string; type: string } | null; meta?: unknown };
  };
  return {
    id: parsed.id,
    type: parsed.type,
    attributes: {
      booking_method_id: parsed.attributes.booking_method_id,
      time: parsed.attributes.time,
      total_time: parsed.attributes.total_time,
      percentage: parsed.attributes.percentage,
      started_on: parsed.attributes.started_on,
      ended_on: parsed.attributes.ended_on,
      // Forced true: the mapper reads `draft===true` to mark work tentative. The
      // tentative SIGNAL itself is the set-difference (computed by the caller),
      // not this attribute (supersedes the old D-07 draft assumption).
      draft: true,
      // Carry the TRUE canceled value through (CR-01) so the mapper's own
      // `canceled===true` skip is a second line of defense even if a canceled
      // allocation ever reaches here. The gather loop already skips canceled
      // allocations before synthesis, so in practice this is always false.
      canceled: parsed.attributes.canceled === true,
    },
    // Force a `service` linkage so the mapper classifies it as WORK (not absence).
    // Event-type allocations are filtered out before reaching here.
    relationships: {
      person: r.person,
      service:
        r.service?.data?.id != null
          ? r.service
          : { data: { id: "alloc-" + parsed.id, type: "services" } },
      event: undefined,
    },
  };
}

/**
 * Orchestrate the whole ingestion pipeline → GatherResult. Never throws: every
 * failure degrades into `sourceErrors`. See the module header for the trust
 * contract. Pure relative to its injected deps (no system clock, no hidden I/O).
 */
export async function gather(deps: GatherDeps): Promise<GatherResult> {
  const fetchPages = deps.fetchPages ?? fetchAllPages;
  const sourceErrors: string[] = [];

  // CR-02 — the roster gate. A row contributes ONLY if its person id resolves to
  // a rostered designer; rows with an empty/un-included person link (the 02-04
  // include-set failure mode) or a non-monitored person id are dropped, never
  // silently attributed. (assessedDesigners is derived from pull COVERAGE at step
  // (8), not from which designers happened to have rows — see the note there.)
  const ROSTER = new Set<string>(DESIGNER_PERSON_IDS);

  // (1) Holidays + target day + window (mirror report.ts's clock derivation).
  const holidays = buildHolidaySet(yearsForWindow(deps.now), STUDIO_CLOSURES);
  const targetDay = nextWorkingDay(deps.now, holidays);
  const targetKey = targetDay.toISODate() ?? "";
  const windowDays = restOfWeekWindow(targetDay, holidays);
  const windowKeys = windowDays.map((d) => d.toISODate() ?? "");
  const lastKey = windowKeys[windowKeys.length - 1] ?? targetKey;

  // Degraded, well-formed result the early-return paths share.
  const degraded = (): GatherResult => ({
    bookings: [],
    absences: [],
    briefFlags: [],
    holidays,
    assessedDesigners: [], // reached nobody → report names the whole roster missing
    sourceErrors,
    rosteredMinutes: () => 0, // reached nobody → no rostered data → 0 (degrade-safe, D-06)
    bookedClientsByDesignerDay: {}, // reached nobody → no per-designer sets
    activeClients: [], // figures degraded → 🤖 card, no meeting matching needed
    bookedLabelsByDesignerDay: {}, // reached nobody → no per-designer labels
  });

  // (2) Pull bookings for the whole window with the live-confirmed include set.
  //     The include MUST carry person/service/event as well as the brief chain:
  //     - `service` vs `event` is the work-vs-absence split (D-11); WITHOUT them
  //       in `include` the relationships come back `{ meta: { included: false } }`
  //       and EVERY booking is dropped by the mapper (live 02-04 probe — the bug
  //       this set fixes). `person` resolves the designerId for roster matching
  //       (02-02 flag) — without it designerId is empty and no booking attributes
  //       to a rostered designer.
  //     - `task,task.workflow_status,task.project,task.project.company` resolves
  //       the brief chain in the same call (02-03 live-confirmed).
  const personFilter = DESIGNER_PERSON_IDS.join(",");
  const include =
    "person,service,event,task,task.workflow_status,task.project,task.project.company";
  const bookingsQuery =
    `filter[person_id]=${personFilter}` +
    `&filter[after]=${targetKey}` +
    `&filter[before]=${lastKey}` +
    `&filter[canceled]=false` +
    `&include=${include}`;

  const bookingsResult = await fetchPages("/bookings", bookingsQuery);
  if (!bookingsResult.ok) {
    sourceErrors.push(`bookings pull failed: ${bookingsResult.error}`);
    return degraded(); // degrade, never throw (Pitfall 6 / T-02-14)
  }

  // (3) Validate each booking at the zod boundary; drift on one entry is skipped.
  //     RawBookingForMapping (the shared mapper type) only carries person/service/
  //     event, so the booking→task linkage is recorded here in a side map keyed by
  //     booking id, for the brief-input resolution below.
  const rawBookings: RawBookingForMapping[] = [];
  const taskIdByBooking = new Map<string, string | null>();
  for (const entry of bookingsResult.value.data) {
    const parsed = BookingResource.safeParse(entry);
    if (!parsed.success) {
      sourceErrors.push("a booking entry failed validation (skipped)");
      continue;
    }
    // CR-02 — roster gate: a row with no resolved (un-included/missing) person
    // link or a non-monitored person id must NOT contribute (its minutes would
    // attribute to nobody/"" and falsely mark a designer assessed). Drop it and
    // record the signal as a sourceError rather than producing a ""-keyed booking.
    const personId = relId(
      (
        parsed.data.relationships as {
          person?: { data?: { id: string; type: string } | null };
        }
      ).person,
    );
    if (personId === null || !ROSTER.has(personId)) {
      sourceErrors.push("a booking row had no rostered person (skipped)");
      continue;
    }
    const taskRel = (
      parsed.data.relationships as {
        task?: { data?: { id: string; type: string } | null };
      }
    ).task;
    taskIdByBooking.set(parsed.data.id, relId(taskRel));
    rawBookings.push(asRawBooking(parsed.data));
  }

  // (3b) GAP-CLOSURE — capture TENTATIVE work via the /allocations superset.
  //      The live hand-check (02-04 SC-4) proved the pipeline was blind to
  //      tentative time: /bookings returns CONFIRMED records only, while
  //      /allocations is the SUPERSET (confirmed + tentative/unconfirmed),
  //      sharing identical resource ids with /bookings for the confirmed rows.
  //      Tentative SIGNAL (live-confirmed, supersedes old D-07 draft assumption):
  //      a scheduled record present in /allocations but ABSENT from /bookings is
  //      tentative. We compute the confirmed-id set, then synthesize a tentative
  //      RawBookingForMapping for each allocation-only SERVICE (work) record
  //      (reusing the mapper's minutes logic). Event-type allocation-only records
  //      are ignored — absences come from the confirmed pull only. A failed
  //      allocations pull degrades (sourceError) and the run continues
  //      confirmed-only; it NEVER crashes the gather (Pitfall 6).
  const confirmedIds = new Set<string>(rawBookings.map((b) => b.id));
  // NOTE: /allocations does NOT support filter[canceled] — Productive returns
  // HTTP 400 unsupported_filter and the whole pull degrades (live-confirmed
  // 2026-06-04). CR-01's intent (exclude canceled allocations) is enforced
  // CLIENT-SIDE in the synthesis loop below on the row's `canceled` attribute,
  // so omitting the query filter changes no behaviour. Keep after/before — those
  // ARE supported on /allocations (live-confirmed: 200 with rows).
  const allocationsQuery =
    `filter[person_id]=${personFilter}` +
    `&filter[after]=${targetKey}` +
    `&filter[before]=${lastKey}` +
    `&include=person,service,event`;
  const allocationsResult = await fetchPages("/allocations", allocationsQuery);
  if (!allocationsResult.ok) {
    sourceErrors.push(`allocations pull failed: ${allocationsResult.error}`);
    // Degrade: keep confirmed-only. Do NOT return — confirmed capacity stands.
  } else {
    for (const entry of allocationsResult.value.data) {
      const parsed = AllocationResource.safeParse(entry);
      if (!parsed.success) {
        sourceErrors.push("an allocation entry failed validation (skipped)");
        continue;
      }
      const a = parsed.data;
      // CR-02 — roster gate (mirrors the bookings loop): only a rostered person's
      // allocation contributes, and a resolved allocation marks that designer as
      // reached (assessed). A designer reached only via allocations (zero confirmed
      // bookings) is still assessed, not missing.
      const personId = relId(
        (
          a.relationships as {
            person?: { data?: { id: string; type: string } | null };
          }
        ).person,
      );
      if (personId === null || !ROSTER.has(personId)) {
        sourceErrors.push("an allocation row had no rostered person (skipped)");
        continue;
      }
      // CR-01: never trust the server filter alone — a canceled allocation is
      // absent from the (canceled-filtered) /bookings set, so the set-difference
      // below would wrongly resurrect it as live tentative work, inflating the
      // shaky figure. Skip it here regardless of what the API filter returned.
      if (a.attributes.canceled === true) continue;
      if (confirmedIds.has(a.id)) continue; // present in /bookings → confirmed, not tentative
      if (a.attributes.booking_type !== "service") continue; // ignore tentative absences (scope boundary)
      rawBookings.push(tentativeAllocationToRawBooking(a));
    }
  }

  // (4) Resolve the brief chain. Workflow statuses are a separate call (a task
  //     exposes only its status id; the status→workflow link + position come
  //     from /workflow_statuses?include=workflow — 02-03 decision).
  const wfResult = await fetchPages("/workflow_statuses", "include=workflow");
  let briefedMap = new Map<string, number>();
  let statusIndex = new Map<string, StatusIndexEntry>();
  if (!wfResult.ok) {
    sourceErrors.push(`workflow_statuses pull failed: ${wfResult.error}`);
    // Degrade brief resolution only: capacity still computes. Empty briefedMap
    // → every task fails safe to not-briefed; gather still returns a report.
  } else {
    const indexed = indexWorkflowStatuses(wfResult.value.data);
    briefedMap = indexed.briefedMap;
    statusIndex = indexed.statusIndex;
  }

  // (5) Resolve project_type_id (D-06 isClient) through the zod boundary. The
  //     projects + companies are sideloaded by the bookings include chain, so we
  //     read them from THIS pull's `included` (no extra call needed); parse each
  //     via ProjectResource.safeParse — raw projects JSON never crosses the line.
  const isClientByProject = indexProjects(bookingsResult.value.included);
  const tasksById = indexTasks(bookingsResult.value.included, statusIndex, isClientByProject);

  // (6) Map per window day so each booking/absence carries its `date` (the
  //     report's rollup attributes by date). Brief checks are target-day only.
  const bookings: DatedBooking[] = [];
  const absences: DatedAbsence[] = [];
  for (const dayKey of windowKeys) {
    const mapped = mapToBookingsAndAbsences(rawBookings, dayKey, holidays);
    for (const b of mapped.bookings) bookings.push(tagDate(b, dayKey));
    for (const a of mapped.absences) absences.push(tagDate(a, dayKey));
  }

  // (7) Brief flags: build one AssessBookingInput per TARGET-DAY booking that
  //     resolves to a work (service) booking, then delegate to assessBriefs.
  const assessInputs = buildAssessInputs(rawBookings, targetKey, tasksById, taskIdByBooking);
  const briefFlags = assessBriefs(assessInputs, briefedMap);

  // (7b) CAP-06 — pull each designer's working-day availability via a DEDICATED
  //      /people?filter[id]=... call (D-01 resolved: a person-scoped pull, NOT a
  //      /bookings sideload — availabilities is a person ATTRIBUTE, and the bookings
  //      include chain already broke once when relationships weren't included). Each
  //      entry is parsed through PersonResource.safeParse (the indexProjects idiom):
  //      on success, map its availabilities → per-weekday minutes for the target
  //      week and record them in availabilityByDesigner. A Result error degrades —
  //      NO designer is added (so all fall through to missing, never a flat-450,
  //      D-06). A single-entry safeParse failure skips ONLY that designer.
  //
  //      D-06 per-designer degrade — DISTINCT from the /allocations confirmed-only
  //      GLOBAL degrade: a designer whose availability can't be read is UNKNOWN
  //      (omitted from assessedDesigners → "couldn't read"); we NEVER fall back to a
  //      flat-7.5h baseline for them (that re-introduces the exact CAP-06 bug).
  const availabilityByDesigner = new Map<DesignerId, number[]>();
  const peopleQuery = `filter[id]=${personFilter}`;
  const peopleResult = await fetchPages("/people", peopleQuery);
  if (!peopleResult.ok) {
    sourceErrors.push(`people availability pull failed: ${peopleResult.error}`);
    // Degrade: no availability for anyone → all omitted from assessed (D-06). Do
    // NOT return — confirmed bookings still stand; the report names them missing.
  } else {
    for (const entry of peopleResult.value.data) {
      const parsed = PersonResource.safeParse(entry);
      if (!parsed.success) {
        // D-06: a SINGLE designer's unreadable availability is NOT a figures
        // degrade — the /people pull itself succeeded and the other designers'
        // numbers stay trustworthy. Omit only this one (→ missingDesigners →
        // per-designer "couldn't read" row). Logged to the Actions console for
        // observability; deliberately NOT pushed to sourceErrors (that would trip
        // the whole-card 🤖 degrade in variants.ts and hide the per-designer row).
        console.warn("a person availability entry failed validation (skipped)");
        continue;
      }
      const personId = parsed.data.id as DesignerId;
      if (!ROSTER.has(personId)) continue; // not a monitored designer → ignore
      const availabilities = (parsed.data.attributes.availabilities ??
        []) as RawAvailabilityForMapping[];
      const weekdayMinutes = availabilityToWeekdayMinutes(availabilities, targetKey);
      // D-06: a present designer with NO USABLE rostered data (no covering period,
      // or a defensively-zeroed unexpected shape → an all-zero week) is treated as
      // UNKNOWN, not "works zero days". Omit them so the report reads "couldn't
      // read" rather than silently inventing a 7-day-off week. A designer who is
      // genuinely rostered at least one day has a non-zero entry and is recorded.
      if (weekdayMinutes.every((m) => m === 0)) {
        // D-06: same as the parse-failure case above — one designer with no
        // usable rostered data is omitted (→ per-designer "couldn't read" row),
        // NOT a whole-card degrade. Console-only; never a figures sourceError.
        console.warn("a designer has no readable working-day availability (skipped)");
        continue;
      }
      availabilityByDesigner.set(personId, weekdayMinutes);
    }
  }

  // The lookup the report consumes: index a designer's per-weekday minutes by the
  // weekday of `dateKey` (D-02). An unreadable designer is absent from the map →
  // 0 (degrade-safe); but they are ALSO omitted from assessedDesigners below, so
  // the report shows them "couldn't read", not "0 / open" (D-06). Never throws.
  const rosteredMinutes = (designerId: DesignerId, dateKey: string): number => {
    const weekdayMinutes = availabilityByDesigner.get(designerId);
    if (weekdayMinutes === undefined) return 0;
    return rosteredMinutesForWeekday(weekdayMinutes, dateKey);
  };

  // (8) assessedDesigners — reaching this point means the /bookings pull SUCCEEDED
  //     (a failure returns degraded() above), so the person-scoped bookings pull
  //     COVERS all three designers (reached-but-empty → open, NOT "couldn't read").
  //     CAP-06 / D-06 narrows this: a designer must ALSO have readable availability
  //     to be assessed. assessedDesigners is therefore the INTERSECTION of the
  //     bookings-coverage roster AND the designers whose availability parsed into
  //     availabilityByDesigner. A designer with unreadable availability is omitted
  //     → report names them in missingDesigners ("couldn't read"); we NEVER
  //     substitute a flat-7.5h day for them (that is the bug D-06 forbids).
  const assessedDesigners = DESIGNER_PERSON_IDS.map((id) => id as DesignerId).filter((id) =>
    availabilityByDesigner.has(id),
  );

  // (9) Open Q1 — per-designer booked CLIENT company ids for the TARGET day, read
  //     from the SAME already-fetched `included` (no second /bookings call). Build
  //     a taskId→companyId index, then for each confirmed target-day WORK booking
  //     add its company id (via its linked task) to that designer's set. Every
  //     assessed designer is initialised to an empty Set so "no client booking"
  //     is distinct from "unread". Tentative (allocation-synthesized) bookings
  //     have no included company linkage and simply contribute nothing.
  const companyByTask = indexTaskCompany(bookingsResult.value.included);
  const bookedClientsByDesignerDay: Record<DesignerId, Set<string>> = {};
  const bookedLabelsByDesignerDay: Record<DesignerId, string[]> = {};
  for (const id of assessedDesigners) {
    bookedClientsByDesignerDay[id] = new Set<string>();
    bookedLabelsByDesignerDay[id] = [];
  }
  for (const raw of rawBookings) {
    const a = raw.attributes;
    if (a.canceled === true) continue;
    if (relId(raw.relationships.service) === null) continue; // work bookings only
    if (!(a.started_on <= targetKey && targetKey <= a.ended_on)) continue; // target day only
    const designerId = (relId(raw.relationships.person) ?? "") as DesignerId;
    const set = bookedClientsByDesignerDay[designerId];
    if (set === undefined) continue; // non-rostered / unassessed → skip
    const taskId = taskIdByBooking.get(raw.id) ?? null;
    if (taskId === null) continue;
    // Booked task LABEL (job title) — the coverage signal for the Problem/SOLVD
    // "needs its own booking" reconciler rule. A generic "Liam time" booking has a
    // task label that won't contain "Problem/SOLVD", so it can't mask the meeting.
    const label = tasksById.get(taskId)?.jobLabel;
    if (label !== undefined) bookedLabelsByDesignerDay[designerId]?.push(label);
    const companyId = companyByTask.get(taskId);
    if (companyId !== undefined) set.add(companyId);
  }

  // (10) LIVE active-client list (Liam pilot feedback 2026-06-25) — widens meeting
  //      matching beyond the frozen curated map. Additive + NON-FATAL: a failed pull
  //      is logged and yields [] (reconcile falls back to the curated map), never a
  //      figures-degrade sourceError. See fetchActiveClients.
  const activeClients = await fetchActiveClients(fetchPages);

  return {
    bookings,
    absences,
    briefFlags,
    holidays,
    assessedDesigners,
    sourceErrors,
    rosteredMinutes,
    bookedClientsByDesignerDay,
    activeClients,
    bookedLabelsByDesignerDay,
  };
}

/**
 * Pull the LIVE active-client company list (Liam pilot feedback 2026-06-25): every
 * company with an OPEN client project (status=1, project_type=2). Those companies
 * ride in the response `included` (only companies linked to a returned active
 * client project appear there), so we read them straight from `included`, distinct
 * by id. NON-FATAL + additive: a failed pull is logged (console.warn) and returns
 * [] so reconcile falls back to the curated alias map. It is deliberately NOT pushed
 * to `sourceErrors` — that would trip the whole-card 🤖 figures-degrade (variants.ts),
 * and this is a meeting-matching enhancement, not a figures source.
 */
async function fetchActiveClients(
  fetchPages: NonNullable<GatherDeps["fetchPages"]>,
): Promise<ActiveClient[]> {
  const query =
    "filter[status]=1&filter[project_type]=2&include=company" +
    "&fields[projects]=id&fields[companies]=name";
  const res = await fetchPages("/projects", query);
  if (!res.ok) {
    console.warn(
      `active-client list pull failed (meeting matching falls back to curated map): ${res.error}`,
    );
    return [];
  }
  const byId = new Map<string, string>();
  for (const raw of res.value.included) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      (raw as { type?: unknown }).type !== "companies"
    ) {
      continue;
    }
    const c = raw as { id: string; attributes?: { name?: unknown } };
    const name = typeof c.attributes?.name === "string" ? c.attributes.name.trim() : "";
    if (name.length > 0) byId.set(c.id, name);
  }
  return [...byId].map(([companyId, companyName]) => ({ companyId, companyName }));
}

/** Tag a Booking/Absence with the window day it was mapped for. */
function tagDate<T extends Booking | Absence>(item: T, date: string): T & { date: string } {
  return { ...item, date };
}

/**
 * Build the pre-resolved brief inputs for the TARGET day only (D-08). For each
 * raw work (service) booking that covers the target day, resolve its linked task
 * (or null → no-task), isClient, tentative flag, and jobLabel. Absence (event)
 * bookings are excluded — briefs are about work. assessBriefs applies the
 * tentative/internal/non-target suppression gates.
 */
function buildAssessInputs(
  rawBookings: readonly RawBookingForMapping[],
  targetKey: string,
  tasksById: ReadonlyMap<string, ResolvedTask>,
  taskIdByBooking: ReadonlyMap<string, string | null>,
): AssessBookingInput[] {
  const inputs: AssessBookingInput[] = [];
  for (const raw of rawBookings) {
    const a = raw.attributes;
    if (a.canceled === true) continue;
    if (relId(raw.relationships.service) === null) continue; // work bookings only
    const coversTarget = a.started_on <= targetKey && targetKey <= a.ended_on;
    const designerId = (relId(raw.relationships.person) ?? "") as DesignerId;
    const taskId = taskIdByBooking.get(raw.id) ?? null;
    const resolved = taskId !== null ? tasksById.get(taskId) : undefined;

    inputs.push({
      designerId,
      bookingId: raw.id,
      isTentative: a.draft === true,
      // isClient is the task's project_type_id signal; a booking with no task
      // has no project to test → treat internal (suppressed), fail-safe (D-06).
      isClient: resolved?.isClient ?? false,
      isTargetDay: coversTarget,
      jobLabel: resolved?.jobLabel ?? "Untitled job",
      task:
        resolved !== undefined
          ? {
              taskId: resolved.taskId,
              workflowId: resolved.workflowId,
              position: resolved.position,
              descriptionNonEmpty: resolved.descriptionNonEmpty,
            }
          : null,
    });
  }
  return inputs;
}
