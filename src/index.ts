/**
 * runNightly — the composition root and the ONE boundary that touches the system
 * clock, the environment, and the network sequencing for the whole nightly run.
 *
 * This is the entrypoint GitHub Actions invokes (`node --import tsx src/index.ts`).
 * It wires the four pure/side-effecting pieces the prior plans built, in order:
 *
 *   gather(deps)              (src/productive/gather.ts) — pull + degrade-on-failure
 *     → computeStudioReport   (src/domain/report.ts)     — deterministic figures
 *     → gatherCalendar(deps)  (src/calendar/gather.ts)   — additive source, degrades
 *       → reconcileMeetings   (src/calendar/reconcile.ts)— pure 📅 worth-a-look list
 *       → renderTemplate      (src/render/renderMessage.ts) — Cards v2 payload
 *         → postToChat        (src/chat/postToChat.ts)    — the one outbound POST
 *
 * Trust / determinism boundary (gather.ts header line 14, report.ts header
 * lines 19-21): this module is the SINGLE place allowed to read the system clock.
 * Every module below it takes `now` injected, which is what keeps the clock,
 * capacity, and report layers deterministic and unit-testable. We compute one
 * studio-zone `now` here and thread it down.
 *
 * THE TWO-PATH RELIABILITY RULE (03-RESEARCH Pitfall 1 — DO NOT MERGE):
 *   - A DATA-SOURCE failure is already captured inside gather's `sourceErrors`;
 *     the renderer turns that into the 🤖 degraded card, which STILL posts. The
 *     night is never silently skipped because Productive was down (REL-01).
 *   - A POST failure (`postToChat` → { ok: false }, including a missing webhook
 *     URL) is a different category: it must exit non-zero so GitHub's built-in
 *     failed-run email fires and a human notices (REL-02 / D-25). It is NEVER
 *     swallowed into an exit-0 catch.
 *
 * SECURITY (threat T-03-09): the webhook URL carries the auth key/token. It is
 * read from `process.env.GCHAT_WEBHOOK_URL`, passed straight into `postToChat`,
 * and NEVER placed inside a `console.*` call. Only the post's status/error string
 * (already URL-redacted by postToChat) is logged.
 */

import { DateTime } from "luxon";
import { STUDIO_ZONE } from "./domain/types.ts";
import type { DesignerId } from "./domain/types.ts";
import { gather } from "./productive/gather.ts";
import { gatherCalendar } from "./calendar/gather.ts";
import { reconcileMeetings } from "./calendar/reconcile.ts";
import { computeStudioReport } from "./domain/report.ts";
import type { StudioReportInput } from "./domain/report.ts";
import { minutesToHours, roundToQuarterHour } from "./domain/round.ts";
import { renderTemplate } from "./render/renderMessage.ts";
import type { RenderContext } from "./render/cards.ts";
import { postToChat } from "./chat/postToChat.ts";
import {
  DESIGNER_PERSON_IDS,
  DESIGNER_NAMES,
  STUDIO_CLOSURES,
  CLIENT_ALIAS_MAP,
  MEETING_IGNORE_LIST,
} from "./config.ts";

/**
 * Pure weekday guard (SCHED-01, defence-in-depth). The cron is already weekday-
 * only (`* * 1-5`), but a hand-edit or a `workflow_dispatch` on a weekend must
 * never produce a Saturday/Sunday post. We gate on the DAY, not the minute, so a
 * delayed scheduled run (GitHub can delay scheduled jobs under load) and a manual
 * dispatch both still fire on a weekday. luxon ISO weekday: 6 = Sat, 7 = Sun.
 *
 * Kept pure (no `process.exit`, no I/O) so guard.test.ts can assert it directly.
 */
export function shouldSkipForWeekend(now: DateTime): boolean {
  return now.weekday >= 6;
}

/**
 * Format the header subtitle "Tomorrow · {Weekday} {d} {Month}" from the target
 * day's "yyyy-MM-dd" key, rendered in the studio zone with the middot separator
 * (D-06). e.g. "Tomorrow · Thursday 4 June".
 */
function subtitleFor(targetDayKey: string): string {
  const d = DateTime.fromISO(targetDayKey, { zone: STUDIO_ZONE });
  const label = d.isValid ? d.toFormat("cccc d LLLL") : targetDayKey;
  return `Tomorrow · ${label}`;
}

/**
 * Build the presentation-only RenderContext from the gather result + report.
 * Everything here is display detail the deterministic report does not carry:
 * names (from config), the degraded source list, brief flags, and the
 * pre-formatted header. tentativeNotes/leaveNotes are left empty — the half-day
 * leave + tentative-client detail needs absence wording the current pull does not
 * surface per designer (carried in RenderContext when a later plan adds it).
 *
 * holiday/closure detection (per the plan): distinguish a public-holiday target
 * (in the holiday set but NOT a studio closure) from a studio-closure target (in
 * STUDIO_CLOSURES). Note: `nextWorkingDay` already skips both, so in normal
 * operation `report.targetDay` is always a working day and neither branch fires —
 * the wiring is defensive/forward-looking and inert today.
 */
function buildRenderContext(
  report: ReturnType<typeof computeStudioReport>,
  sourceErrors: string[],
  briefFlags: RenderContext["briefFlags"],
  holidays: ReadonlySet<string>,
  worthALook: RenderContext["worthALook"],
  calendarUnavailable: boolean,
): RenderContext {
  // Tentative (shaky) hours surfaced from the deterministic report so a designer
  // with only tentative work doesn't read as fully open (live-corrected 2026-06-04).
  // Display-rounded via round.ts (D-15/D-16, display-only — never re-enters math).
  // The client/job detail stays omitted until the pull surfaces it per designer.
  const tentativeNotes: RenderContext["tentativeNotes"] = {};
  for (const d of report.designers) {
    if (d.tentativeMin > 0) {
      tentativeNotes[d.designerId] = {
        tentativeHours: roundToQuarterHour(minutesToHours(d.tentativeMin)),
      };
    }
  }

  const ctx: RenderContext = {
    designerNames: { ...DESIGNER_NAMES },
    sourceErrors,
    briefFlags,
    tentativeNotes,
    worthALook,
    header: {
      subtitle: subtitleFor(report.targetDay),
      targetDate: report.targetDay,
    },
  };

  // Presentation-only: set ONLY when true so existing snapshot fixtures with no
  // field stay byte-identical (mirrors the closureTomorrow/holidayTomorrow
  // conditional-assign style). Carries no raw error text — a boolean signal only.
  if (calendarUnavailable) {
    ctx.calendarUnavailable = true;
  }

  const isClosure = STUDIO_CLOSURES.includes(report.targetDay);
  const isHoliday = holidays.has(report.targetDay) && !isClosure;
  if (isClosure) {
    ctx.closureTomorrow = { backDayLabel: subtitleFor(report.targetDay) };
  } else if (isHoliday) {
    ctx.holidayTomorrow = { dateLabel: subtitleFor(report.targetDay) };
  }

  return ctx;
}

/**
 * Injected dependencies for runNightly (the test seam). Each field defaults to
 * the real implementation / the real env webhook, so `runNightly(now)` with no
 * deps behaves exactly as before; a test passes stubs so NO network, Google,
 * Productive, or process.env is touched.
 *
 * Determinism note (trust boundary, this module's header): deps carries NO clock.
 * `now` stays the single injected clock — the import.meta.main entrypoint keeps
 * the sole DateTime.now() read. The seam only swaps function references.
 */
export interface RunNightlyDeps {
  gather: typeof gather;
  gatherCalendar: typeof gatherCalendar;
  postToChat: typeof postToChat;
  webhookUrl: string;
}

/**
 * The nightly run. Returns a process exit code instead of calling
 * `process.exit` itself, so the orchestration is testable and the single exit
 * happens at the module bottom.
 */
export async function runNightly(now: DateTime, deps?: Partial<RunNightlyDeps>): Promise<number> {
  // Resolve injected deps, defaulting each to the real implementation / env
  // webhook. No clock here — `now` is the only clock (trust boundary).
  const resolvedDeps: RunNightlyDeps = {
    gather: deps?.gather ?? gather,
    gatherCalendar: deps?.gatherCalendar ?? gatherCalendar,
    postToChat: deps?.postToChat ?? postToChat,
    webhookUrl: deps?.webhookUrl ?? process.env.GCHAT_WEBHOOK_URL ?? "",
  };

  // (1) Weekday guard (SCHED-01).
  if (shouldSkipForWeekend(now)) {
    console.log("weekend — skipping");
    return 0;
  }

  // (2) Pull. gather never throws: any source failure lands in g.sourceErrors.
  const g = await resolvedDeps.gather({ now });

  // (3) Deterministic figures from the injected now (the report derives the
  //     target day itself, mirroring gather's derivation).
  const input: StudioReportInput = {
    now,
    holidays: g.holidays,
    roster: DESIGNER_PERSON_IDS.map((id) => id as DesignerId),
    bookings: g.bookings,
    absences: g.absences,
    assessedDesigners: g.assessedDesigners,
  };
  const report = computeStudioReport(input);

  // (3b) Calendar — an ADDITIVE data source (Phase 4). Uses the SAME injected
  //      `now` so calendar and Productive agree on the target day. gatherCalendar
  //      never throws: a per-designer read failure lands in cal.sourceErrors and
  //      the run continues. reconcileMeetings is pure (no clock, no network, no
  //      hour math) — it reads the filtered events + the already-built per-designer
  //      booked-client sets + the committed alias/ignore config.
  const cal = await resolvedDeps.gatherCalendar({ now });
  const worthALook = reconcileMeetings(
    cal.eventsByDesigner,
    g.bookedClientsByDesignerDay,
    CLIENT_ALIAS_MAP,
    MEETING_IGNORE_LIST,
  );

  // (4) Presentation context + (5) render the Cards v2 payload. Calendar and
  //     Productive degrade INDEPENDENTLY (REL-01):
  //       - Productive/figures failure (g.sourceErrors) → 🤖 degraded card. The
  //         figures are untrusted, so we drop to the degraded variant and still post.
  //       - Calendar-only failure (cal.sourceErrors, figures intact) → the NORMAL
  //         card with real figures + ONE muted "couldn't check calendars" note;
  //         the 📅 worth-a-look lines are simply absent (empty worthALook). NOT a
  //         degraded card — the trusted figures stay shown.
  //       - Both fail → degraded card (Productive dominates); no calendar noise is
  //         appended (the muted note lives only in the normal-card path).
  //     The two-path rule still holds: calendar is a DATA source (degrade + exit 0),
  //     never the POST-failure exit-1 branch below. Raw calendar error detail (incl.
  //     the GOOGLE_SA_KEY reason) is logged to the Actions console ONLY — never into
  //     the card and never the webhook URL (threat T-03-09 / T-L0J-01).
  if (cal.sourceErrors.length > 0) {
    console.warn(`calendar source degraded: ${cal.sourceErrors.join("; ")}`);
  }
  const ctx = buildRenderContext(
    report,
    g.sourceErrors,
    g.briefFlags,
    g.holidays,
    worthALook,
    cal.sourceErrors.length > 0,
  );
  const payload = renderTemplate(report, ctx);

  // (6) The one outbound POST. The webhook URL is read here and passed straight
  //     in — never logged. A missing/empty URL deterministically yields a post
  //     failure below (REL-02), never a silent skip.
  const posted = await resolvedDeps.postToChat(payload, resolvedDeps.webhookUrl);

  // THE TWO-PATH RULE: a POST failure is NOT degraded-and-continue — it must
  // exit non-zero so GitHub's failed-run email fires (REL-02 / D-25). We log the
  // redacted error string from postToChat (never the URL).
  if (!posted.ok) {
    console.error(`nightly post failed: ${posted.error}`);
    return 1;
  }

  console.log("nightly check-in posted");
  return 0;
}

/**
 * Run only when this file is the process entrypoint (`node --import tsx
 * src/index.ts`), NOT when it is imported (e.g. by guard.test.ts importing the
 * pure `shouldSkipForWeekend`). `import.meta.main` (Node 22.18+) is true only for
 * the directly-executed module, so importing this module never triggers a real
 * run, a network call, or a `process.exit`.
 */
if (import.meta.main) {
  // Entrypoint: the ONE system-clock read in the codebase (the clock boundary).
  const exitCode = await runNightly(DateTime.now().setZone(STUDIO_ZONE));
  // A non-zero code is a POST failure (REL-02): exit 1 so GitHub's built-in
  // failed-run email fires. Source failures never reach here — they degrade-and-
  // post inside runNightly and return 0.
  if (exitCode !== 0) process.exit(1);
  process.exit(0);
}
