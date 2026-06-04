/**
 * End-to-end reconcile → render test (plan quick-260604-kig, Task 1 — MEET-04).
 *
 * Verification gap this closes: no existing test drives a REAL unaccounted client
 * meeting all the way through the deterministic reconciler (reconcileMeetings,
 * real CLIENT_ALIAS_MAP + MEETING_IGNORE_LIST over the committed golden fixtures)
 * AND THEN through the templated renderer (renderTemplate) to prove the 📅
 * "worth a look" sub-line actually appears — deep-linked, soft-voiced, never the
 * word "conflict" — under the right designer in the Cards v2 payload. The mirror
 * case (a same-day COVERED meeting) must render NO 📅 line. The two existing suites
 * test these halves in isolation (reconcile.test.ts proves the list; the
 * renderMessage worth-a-look suite proves the line from a hand-written ctx); this
 * stitches the real reconciler output INTO the renderer, end to end.
 *
 * node:test + node:assert/strict, fully offline. No network, no clock, no hour
 * math. Mirrors the fixture-loading helpers of reconcile.test.ts and the
 * report/ctx builders of renderMessage.test.ts.
 *
 * Run: node --import tsx --test "src/calendar/__tests__/reconcile-render.e2e.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FilteredEvent } from "../gather.ts";
import type { DesignerId } from "../../domain/types.ts";
import type { DesignerResult } from "../../domain/capacity.ts";
import type { StudioReport } from "../../domain/report.ts";
import type { RenderContext } from "../../render/cards.ts";
import { renderTemplate } from "../../render/renderMessage.ts";
import { CLIENT_ALIAS_MAP, MEETING_IGNORE_LIST } from "../../config.ts";
import { reconcileMeetings } from "../reconcile.ts";

const ANISHA = "686712" as DesignerId;
const ELLA = "686716" as DesignerId;
const LIAM = "686717" as DesignerId;

const FDC_COMPANY = "1333899";

const NAMES: Record<string, string> = {
  [ANISHA]: "Anisha Gittins",
  [ELLA]: "Ella Wright",
  [LIAM]: "Liam Mills",
};

// --- Fixture loading (mirrors reconcile.test.ts toFilteredEvent/loadFixtures) ---

interface RawFixture {
  _label: string;
  id: string;
  summary?: string;
  htmlLink?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

function toFilteredEvent(raw: RawFixture): FilteredEvent {
  const attendees = raw.attendees ?? [];
  const self = attendees.find((a) => a.self === true);
  return {
    id: raw.id,
    summary: raw.summary ?? "(No title)",
    htmlLink: raw.htmlLink ?? "",
    startLabel: raw.start?.dateTime ?? raw.start?.date ?? "",
    startDateTime: raw.start?.dateTime,
    startDate: raw.start?.date,
    eventType: raw.eventType,
    responseStatusSelf: self?.responseStatus,
    attendeeCount: attendees.length,
  };
}

function loadFixtures(): Map<string, FilteredEvent> {
  const path = fileURLToPath(new URL("../__fixtures__/labelled-events.json", import.meta.url));
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawFixture[];
  const map = new Map<string, FilteredEvent>();
  for (const r of raw) map.set(r._label, toFilteredEvent(r));
  return map;
}

const F = loadFixtures();
const get = (label: string): FilteredEvent => {
  const e = F.get(label);
  assert.ok(e, `fixture missing: ${label}`);
  return e;
};

const COVERED = get("counts/FDC · covered"); // "Quick FDC catch up", 3 Jun
const WORTH = get("counts/FDC · worth-a-look"); // "FDC IPO Launch Check-In", 26 May

// --- Minimal busy report + ctx builders (mirrors renderMessage.test.ts) ---

/** Minutes from hours, exact (display helper only — no capacity arithmetic). */
const h = (hours: number): number => Math.round(hours * 60);

function designer(over: Partial<DesignerResult> & { designerId: DesignerId }): DesignerResult {
  return {
    designerId: over.designerId,
    availableMin: over.availableMin ?? h(7.5),
    confirmedMin: over.confirmedMin ?? 0,
    tentativeMin: over.tentativeMin ?? 0,
    openMin: over.openMin ?? 0,
    status: over.status ?? "ok",
    shaky: over.shaky ?? false,
    availableHours: over.availableHours ?? 7.5,
    bookedHours: over.bookedHours ?? 0,
    openHours: over.openHours ?? 0,
  };
}

/** A busy three-designer report so the per-designer rows section renders. */
function busyReport(): StudioReport {
  return {
    targetDay: "2026-06-04",
    window: ["2026-06-04"],
    designers: [
      designer({
        designerId: ANISHA,
        status: "underbooked",
        openHours: 7.5,
        openMin: h(7.5),
        bookedHours: 0,
      }),
      designer({
        designerId: ELLA,
        status: "underbooked",
        confirmedMin: h(4.5),
        openMin: h(3),
        availableHours: 7.5,
        bookedHours: 4.5,
        openHours: 3.0,
      }),
      designer({ designerId: LIAM, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
    ],
    rollup: { totalMin: h(45), openMin: h(10.5), totalHours: 45, openHours: 10.5 },
    missingDesigners: [],
  };
}

function ctx(over: Partial<RenderContext>): RenderContext {
  return {
    designerNames: NAMES,
    sourceErrors: [],
    briefFlags: [],
    tentativeNotes: {},
    header: { subtitle: "Tomorrow · Thursday 4 June", targetDate: "2026-06-04" },
    ...over,
  };
}

describe("reconcile → render e2e — an unaccounted meeting becomes a 📅 worth-a-look line", () => {
  it("WORTH: a real unbooked FDC meeting surfaces a deep-linked, soft-voiced 📅 line under Liam", () => {
    // (1) Reconcile the WORTH golden event with FDC NOT in Liam's booked set.
    const worthALook = reconcileMeetings(
      { [LIAM]: [WORTH] },
      { [LIAM]: new Set<string>() }, // no FDC booking that day → must flag
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    // RED-style guard: the reconciler must produce exactly one item before we render.
    assert.equal(worthALook[LIAM].length, 1, "reconciler must surface the unbooked meeting");
    assert.equal(worthALook[LIAM][0].title, "FDC IPO Launch Check-In");

    // (2) Feed the real reconciler output into the renderer via RenderContext.
    const out = renderTemplate(busyReport(), ctx({ worthALook: { [LIAM]: worthALook[LIAM] } }));

    // (3) Liam's row lives in sections[1], divider-separated:
    //     widget[0]=Anisha, [1]=divider, [2]=Ella, [3]=divider, [4]=Liam.
    const rowSection = out.cardsV2[0].card.sections[1];
    const liamRow = rowSection.widgets[4];
    assert.ok("decoratedText" in liamRow, "Liam's row is a decoratedText widget");
    const text = liamRow.decoratedText.text;

    assert.match(text, /📅/, "📅 sub-line present");
    assert.match(
      text,
      /<a href="[^"]*">FDC IPO Launch Check-In<\/a>/,
      "title is deep-linked to the calendar event",
    );
    assert.match(text, /worth a look/, "soft 'worth a look' voice present");

    // The soft-nudge contract: never assert a conflict anywhere in the payload.
    const json = JSON.stringify(out);
    assert.ok(!/conflict/i.test(json), "never asserts a conflict (D-04 bias-to-silence)");
  });

  it("COVERED: a same-day same-client booked FDC meeting renders NO 📅 line for Liam", () => {
    // FDC IS in Liam's booked set for the day → reconciler stays silent.
    const worthALook = reconcileMeetings(
      { [LIAM]: [COVERED] },
      { [LIAM]: new Set([FDC_COMPANY]) },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.deepEqual(worthALook[LIAM], [], "covered meeting produces no worth-a-look item");

    const out = renderTemplate(busyReport(), ctx({ worthALook: { [LIAM]: worthALook[LIAM] } }));
    const rowSection = out.cardsV2[0].card.sections[1];
    const liamRow = rowSection.widgets[4];
    assert.ok("decoratedText" in liamRow);
    assert.doesNotMatch(liamRow.decoratedText.text, /📅/, "no 📅 line for a covered meeting");
  });
});
