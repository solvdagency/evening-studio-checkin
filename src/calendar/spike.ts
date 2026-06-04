/**
 * Live-data labelling spike (Phase 4, plan 02 — D-09). A STANDALONE one-off probe,
 * NOT part of the nightly path: nothing in src/index.ts or src/calendar/gather.ts
 * imports this file. Run it manually:
 *
 *     node --import tsx src/calendar/spike.ts
 *
 * What it does
 * ------------
 *  1. For each of the three designers (DESIGNER_CALENDAR_EMAILS) it builds a DWD
 *     calendar client via the plan-01 `buildCalendarClient` (NO new auth/network
 *     machinery) and reads ~4 weeks of real events over [now-28d, now], recurring
 *     series expanded (`singleEvents: true`).
 *  2. It pulls the SAME window's Productive bookings via the plan-02 Productive
 *     client `fetchAllPages("/bookings", …)` (the exact live-confirmed query +
 *     include from src/productive/gather.ts) and resolves, per designer per day,
 *     the set of booked client companies (task → project → company, read from the
 *     already-fetched `included` — no second call).
 *  3. It writes a flat, human-labelable Markdown sheet to a GITIGNORED scratch
 *     file so Liam can mark each DISTINCT meeting overhead / counts / not-work and
 *     confirm client names. One row per event instance.
 *  4. It dumps the raw CalendarEventResource-valid JSON for the DISTINCT events to
 *     a JSON sidecar so plan-02 task 3 can transcribe golden fixtures from real
 *     shapes (including the solo-event A1 and eventType A2 representations).
 *
 * Trust posture
 * -------------
 *  - READ-ONLY: it only reads (calendar.readonly scope + GET /bookings). It NEVER
 *    posts to Google Chat and contains no message-delivery code at all.
 *  - SECRETS: it reuses `loadSaKey()` and never logs the SA key or the minted
 *    client (T-04-05). The Productive token is read inside `fetchAllPages` from
 *    env and never surfaced here.
 *  - OUTPUT: the scratch sheet (real meeting titles, potentially sensitive — T-04-06)
 *    is written ONLY to a gitignored path under .planning/phases/04-…/. The
 *    `spike-output*` glob is gitignored.
 */

import { writeFileSync } from "node:fs";
import { DateTime } from "luxon";

import { STUDIO_ZONE } from "../domain/types.ts";
import { CalendarEventResource } from "./schemas.ts";
import { buildCalendarClient, loadSaKey } from "./auth.ts";
import { fetchAllPages } from "../productive/client.ts";
import { DESIGNER_CALENDAR_EMAILS, DESIGNER_NAMES, DESIGNER_PERSON_IDS } from "../config.ts";

/** Window: ~4 weeks back from "now" through "now", in studio time. */
const WINDOW_DAYS = 28;

/** Gitignored scratch outputs (see .gitignore `spike-output*`). */
const OUT_DIR = ".planning/phases/04-calendar-meeting-reconciliation";
const SHEET_PATH = `${OUT_DIR}/spike-output.md`;
const JSON_PATH = `${OUT_DIR}/spike-output.json`;

/** Read one relationship's linked id (mirrors gather.ts `relId`). */
function relId(rel: { data?: { id: string; type: string } | null } | undefined): string | null {
  return rel?.data?.id ?? null;
}

/**
 * A booked client company surfaced for the sheet: the Productive company id and
 * (where resolvable) its name. Resolved from the bookings `included` exactly as
 * gather.ts does — task → project → company — with the company NAME pulled from
 * the company resource's attributes for human readability in the sheet.
 */
interface BookedClient {
  companyId: string;
  companyName: string;
}

/**
 * Build, per studio-day key (yyyy-MM-dd) per designer person id, the set of booked
 * client companies. Reads ONLY the already-fetched `data` + `included` from a
 * single /bookings pull — no second call. Mirrors gather.ts `indexTaskCompany`
 * but also resolves the company NAME for the sheet.
 */
function bookedClientsByDesignerDay(
  data: unknown[],
  included: unknown[],
): Map<string, Map<string, BookedClient>> {
  // projectId → companyId, and companyId → companyName.
  const companyByProject = new Map<string, string>();
  const companyName = new Map<string, string>();
  for (const raw of included) {
    if (typeof raw !== "object" || raw === null) continue;
    const t = (raw as { type?: unknown }).type;
    if (t === "projects") {
      const p = raw as {
        id: string;
        relationships?: { company?: { data?: { id: string; type: string } | null } };
      };
      const cid = relId(p.relationships?.company);
      if (cid !== null) companyByProject.set(p.id, cid);
    } else if (t === "companies") {
      const c = raw as { id: string; attributes?: { name?: string } };
      companyName.set(c.id, c.attributes?.name ?? "(unnamed)");
    }
  }

  // taskId → companyId (via the task's project).
  const companyByTask = new Map<string, string>();
  for (const raw of included) {
    if (typeof raw !== "object" || raw === null || (raw as { type?: unknown }).type !== "tasks") {
      continue;
    }
    const tk = raw as {
      id: string;
      relationships?: { project?: { data?: { id: string; type: string } | null } };
    };
    const pid = relId(tk.relationships?.project);
    if (pid === null) continue;
    const cid = companyByProject.get(pid);
    if (cid !== undefined) companyByTask.set(tk.id, cid);
  }

  // Walk the bookings: for each booking, attribute its company to the designer for
  // every day the booking spans within [started_on, ended_on].
  const byDay = new Map<string, Map<string, BookedClient>>();
  for (const raw of data) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      (raw as { type?: unknown }).type !== "bookings"
    ) {
      continue;
    }
    const b = raw as {
      attributes?: { started_on?: string; ended_on?: string };
      relationships?: {
        person?: { data?: { id: string; type: string } | null };
        task?: { data?: { id: string; type: string } | null };
      };
    };
    const personId = relId(b.relationships?.person);
    const taskId = relId(b.relationships?.task);
    if (personId === null || taskId === null) continue;
    const companyId = companyByTask.get(taskId);
    if (companyId === undefined) continue; // no client company → skip (internal/fail-safe)

    const startKey = b.attributes?.started_on;
    const endKey = b.attributes?.ended_on ?? startKey;
    if (!startKey || !endKey) continue;
    let day = DateTime.fromISO(startKey, { zone: STUDIO_ZONE });
    const last = DateTime.fromISO(endKey, { zone: STUDIO_ZONE });
    if (!day.isValid || !last.isValid) continue;
    while (day <= last) {
      const dayKey = `${day.toISODate()}|${personId}`;
      let set = byDay.get(dayKey);
      if (!set) {
        set = new Map<string, BookedClient>();
        byDay.set(dayKey, set);
      }
      set.set(companyId, { companyId, companyName: companyName.get(companyId) ?? "(unnamed)" });
      day = day.plus({ days: 1 });
    }
  }
  return byDay;
}

/** One event-instance row for the labelable sheet. */
interface SheetRow {
  date: string;
  designer: string;
  title: string;
  eventType: string;
  attendees: string; // "self? · count"
  start: string; // studio-time HH:mm, or "(all-day)"
  bookedClients: string; // "id · name; …" for that designer that day
  raw: unknown; // the CalendarEventResource-valid raw event
}

/** Markdown-table-safe cell (escape the pipe + collapse newlines). */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

async function main(): Promise<void> {
  const saKeyResult = loadSaKey();
  if (!saKeyResult.ok) {
    // Degrade like the boundary does — print the generic message (never the key)
    // and exit non-zero so the human knows the credential is missing.
    console.error(`spike: ${saKeyResult.error}`);
    process.exit(1);
  }
  const saKey = saKeyResult.value;

  const now = DateTime.now().setZone(STUDIO_ZONE);
  const timeMin = now.minus({ days: WINDOW_DAYS }).toISO();
  const timeMax = now.toISO();
  if (timeMin === null || timeMax === null) {
    console.error("spike: failed to build the studio-time window");
    process.exit(1);
  }
  const afterKey = now.minus({ days: WINDOW_DAYS }).toISODate();
  const beforeKey = now.toISODate();

  // (1) Productive bookings for the SAME window — the exact live-confirmed query +
  //     include from src/productive/gather.ts (reuse fetchAllPages; no new client).
  const personFilter = DESIGNER_PERSON_IDS.join(",");
  const include =
    "person,service,event,task,task.workflow_status,task.project,task.project.company";
  const bookingsQuery =
    `filter[person_id]=${personFilter}` +
    `&filter[after]=${afterKey}` +
    `&filter[before]=${beforeKey}` +
    `&filter[canceled]=false` +
    `&include=${include}`;

  const bookingsResult = await fetchAllPages("/bookings", bookingsQuery);
  let clientsByDay = new Map<string, Map<string, BookedClient>>();
  if (bookingsResult.ok) {
    clientsByDay = bookedClientsByDesignerDay(
      bookingsResult.value.data,
      bookingsResult.value.included,
    );
    console.log(`spike: pulled ${bookingsResult.value.data.length} bookings`);
  } else {
    // Degrade — the sheet is still useful without the booked-client column.
    console.error(`spike: bookings pull failed (continuing without it): ${bookingsResult.error}`);
  }

  // (2) Calendar events per designer over the window.
  const rows: SheetRow[] = [];
  const distinctRaw = new Map<string, unknown>(); // event id → raw (for fixtures)

  for (const personId of DESIGNER_PERSON_IDS) {
    const email = (DESIGNER_CALENDAR_EMAILS as Record<string, string>)[personId];
    const name = (DESIGNER_NAMES as Record<string, string>)[personId] ?? personId;
    const client = buildCalendarClient(saKey, email);

    let items: unknown[] = [];
    try {
      const res = await client.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        timeZone: STUDIO_ZONE,
        maxResults: 2500,
      });
      items = res.data?.items ?? [];
    } catch (e) {
      // Never log the key/token; only the thrown message. Degrade per designer.
      console.error(
        `spike: calendar read failed for ${name}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }
    console.log(`spike: ${name} — ${items.length} event instances`);

    for (const item of items) {
      const parsed = CalendarEventResource.safeParse(item);
      if (!parsed.success) continue; // tolerate drift — skip the odd event
      const ev = parsed.data;
      distinctRaw.set(ev.id, item);

      // attendees shape (A1): how a solo event presents.
      const attendees = ev.attendees ?? [];
      const selfEntry = attendees.find((a) => a.self === true);
      const attendeesNote =
        attendees.length === 0
          ? "none (array absent/empty)"
          : `self=${selfEntry ? "yes" : "no"} · count=${attendees.length}`;

      // start: studio-time HH:mm for timed events; "(all-day)" for date-only.
      let startNote = "(unknown)";
      let dayKey = "";
      if (ev.start?.dateTime) {
        const dt = DateTime.fromISO(ev.start.dateTime).setZone(STUDIO_ZONE);
        startNote = dt.isValid ? dt.toFormat("HH:mm") : ev.start.dateTime;
        dayKey = dt.isValid ? (dt.toISODate() ?? "") : "";
      } else if (ev.start?.date) {
        startNote = "(all-day)";
        dayKey = ev.start.date;
      }

      const booked = dayKey ? clientsByDay.get(`${dayKey}|${personId}`) : undefined;
      const bookedNote = booked
        ? [...booked.values()].map((c) => `${c.companyId} · ${c.companyName}`).join("; ")
        : "";

      rows.push({
        date: dayKey || "(unknown)",
        designer: name,
        title: ev.summary ?? "(No title)",
        eventType: ev.eventType ?? "(default)",
        attendees: attendeesNote,
        start: startNote,
        bookedClients: bookedNote,
        raw: item,
      });
    }
  }

  // Sort the sheet by date then designer then start, for easy human scanning.
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.designer.localeCompare(b.designer) ||
      a.start.localeCompare(b.start),
  );

  // (3) Write the labelable Markdown sheet.
  const header = [
    "# Phase 4 — labelling spike output",
    "",
    `Generated ${now.toISO()} (studio zone ${STUDIO_ZONE}).`,
    `Window: ${afterKey} → ${beforeKey} (last ${WINDOW_DAYS} days).`,
    "",
    "## How to label",
    "",
    "For each DISTINCT meeting title, add a label in the **label** column:",
    "- **overhead** — recurring internal ceremony, never counts (Stand-up / WIP / Creative team).",
    "- **counts** — client meeting / 1:1 / training / Problem-SOLVD: should be in Productive.",
    "- **not-work** — lunch / solo webinar / after-hours.",
    "",
    'Confirm each client meeting\'s client name + short code (e.g. "FDC" → FDC Construction / FDCC).',
    "Note the real `attendees` shape for a SOLO event (array absent, or one self:true entry?) and",
    "whether `eventType` is populated on the OOO / focusTime instances.",
    "",
    "Confirm the two validated cases appear:",
    '- COVERED — "Quick FDC catch up" (3 Jun, Liam booked FDC same day → not flagged).',
    '- WORTH A LOOK — "FDC IPO Launch Check-In" (26 May, no FDC booking that day → flagged).',
    "",
    "## Event instances",
    "",
    "| label | date | designer | meeting title | eventType | attendees (self?, count) | start (studio) | booked clients that day (id · name) |",
    "| ----- | ---- | -------- | ------------- | --------- | ------------------------ | -------------- | ----------------------------------- |",
  ];
  const body = rows.map(
    (r) =>
      `| | ${cell(r.date)} | ${cell(r.designer)} | ${cell(r.title)} | ${cell(r.eventType)} | ${cell(r.attendees)} | ${cell(r.start)} | ${cell(r.bookedClients)} |`,
  );
  const footer = [
    "",
    "## Distinct titles (for the ignore-list / alias decisions)",
    "",
    ...[...new Set(rows.map((r) => r.title))].sort().map((t) => `- ${cell(t)}`),
    "",
  ];
  writeFileSync(SHEET_PATH, [...header, ...body, ...footer].join("\n"), "utf8");

  // (4) Dump the distinct raw events (CalendarEventResource-valid) for fixtures.
  writeFileSync(JSON_PATH, JSON.stringify([...distinctRaw.values()], null, 2), "utf8");

  console.log(`spike: wrote ${rows.length} rows to ${SHEET_PATH}`);
  console.log(`spike: wrote ${distinctRaw.size} distinct raw events to ${JSON_PATH}`);
  console.log("spike: DONE — open the sheet and label each distinct meeting.");
}

main().catch((e) => {
  // Final safety net — never leak the key; surface only the message.
  console.error(`spike: unexpected failure: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
