/**
 * runNightly orchestration integration test (plan quick-260604-kig, Task 2 —
 * REL-01 / REL-02 / MEET-04).
 *
 * Verification gap this closes: no existing test exercises the composition root's
 * three orchestration paths. This drives the REAL runNightly (with the real,
 * unstubbed computeStudioReport / reconcileMeetings / renderTemplate running
 * inside it) over fully stubbed external sources, proving:
 *   (a) happy   — all sources succeed, an unaccounted meeting surfaces all the way
 *                 to the posted payload as a 📅 line, runNightly returns 0.
 *   (b) degrade — a calendar sourceError still posts the 🤖 degraded card and
 *                 returns 0 (REL-01: never silently skip a night).
 *   (c) post-fail — postToChat returns { ok:false } → returns 1 (REL-02: GitHub's
 *                 failed-run email fires).
 *
 * The injected `now` is a FIXED weekday (asserted ≤ Friday so the test fails loudly
 * if the date ever drifts onto a weekend, which the SCHED-01 guard would skip).
 * Deps are fully stubbed: NO network, NO Google, NO Productive, NO process.env —
 * the webhookUrl is a fake "stub.invalid" the capturing postToChat never sends.
 *
 * node:test + node:assert/strict, fully offline. Mirrors guard.test.ts (Sydney
 * `now`) and reconcile.test.ts (golden-fixture FilteredEvent helper).
 *
 * Run: node --import tsx --test "src/__tests__/runNightly.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import { runNightly } from "../index.ts";
import { STUDIO_ZONE } from "../domain/types.ts";
import type { DesignerId } from "../domain/types.ts";
import type { GatherResult } from "../productive/gather.ts";
import type { CalendarResult, FilteredEvent } from "../calendar/gather.ts";
import type { CardsV2Payload } from "../render/cards.ts";
import type { Result } from "../productive/client.ts";

const ANISHA = "686712" as DesignerId;
const ELLA = "686716" as DesignerId;
const LIAM = "686717" as DesignerId;
const ROSTER: DesignerId[] = [LIAM, ANISHA, ELLA];

const FDC_COMPANY = "1333899";

// A fixed WEEKDAY now: Wed 3 Jun 2026 16:30 Sydney. Asserted weekday ≤ 5 below so
// a future edit that drifts this onto a weekend fails loudly (the SCHED-01 guard
// would otherwise skip the run and the assertions would be misleading).
const NOW = DateTime.fromISO("2026-06-03T16:30", { zone: STUDIO_ZONE });

// --- The unaccounted counting meeting (real WORTH golden fixture) ----------------
// Loaded from the committed golden fixtures so the REAL CLIENT_ALIAS_MAP (run by
// the unstubbed reconcileMeetings inside runNightly) resolves it to FDC and, with
// FDC absent from the designer's booked set, surfaces it as a 📅 worth-a-look line.

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

function loadWorthEvent(): FilteredEvent {
  const path = fileURLToPath(
    new URL("../calendar/__fixtures__/labelled-events.json", import.meta.url),
  );
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawFixture[];
  const found = raw.find((r) => r._label === "counts/FDC · worth-a-look");
  assert.ok(found, "golden fixture 'counts/FDC · worth-a-look' present");
  return toFilteredEvent(found);
}

const WORTH = loadWorthEvent();

// --- Stub builders ---------------------------------------------------------------

/**
 * A minimal valid GatherResult. No bookings/absences are needed: the unstubbed
 * computeStudioReport runs over the empty pull and produces present-but-empty
 * (underbooked) rows for the assessed roster — enough for the renderer to emit
 * the per-designer rows section the 📅 line attaches to. bookedClientsByDesignerDay
 * deliberately does NOT contain FDC for Liam, so the WORTH meeting is unaccounted.
 */
function stubGatherResult(sourceErrors: string[] = []): GatherResult {
  return {
    bookings: [],
    absences: [],
    briefFlags: [],
    holidays: new Set<string>(),
    assessedDesigners: [...ROSTER],
    sourceErrors,
    bookedClientsByDesignerDay: {
      [LIAM]: new Set<string>(), // no FDC booking → the WORTH meeting flags
      [ANISHA]: new Set<string>(),
      [ELLA]: new Set<string>(),
    },
  };
}

function stubCalendarResult(sourceErrors: string[] = []): CalendarResult {
  return {
    eventsByDesigner: {
      [LIAM]: [WORTH], // the unaccounted counting meeting
      [ANISHA]: [],
      [ELLA]: [],
    },
    sourceErrors,
  };
}

/** A capturing postToChat stub: records the payload, returns the configured Result. */
function makePostStub(result: Result<void>) {
  const calls: { payload: CardsV2Payload; webhookUrl: string }[] = [];
  const postToChat = async (
    payload: CardsV2Payload,
    webhookUrl: string,
  ): Promise<Result<void>> => {
    calls.push({ payload, webhookUrl });
    return result;
  };
  return { postToChat, calls };
}

const STUB_WEBHOOK = "https://stub.invalid/webhook";

describe("runNightly — orchestration paths (REL-01 / REL-02 / MEET-04)", () => {
  it("is a weekday now (guard sanity — fails loudly if the fixed date drifts to a weekend)", () => {
    assert.ok(NOW.isValid, "fixed now parses");
    assert.ok(NOW.weekday <= 5, `fixed now must be a weekday (got weekday ${NOW.weekday})`);
  });

  it("(a) happy: all sources succeed, the unaccounted meeting reaches the posted 📅 line, returns 0", async () => {
    const post = makePostStub({ ok: true, value: undefined });

    const code = await runNightly(NOW, {
      gather: async () => stubGatherResult(),
      gatherCalendar: async () => stubCalendarResult(),
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 0, "happy path returns 0");
    assert.equal(post.calls.length, 1, "postToChat was called exactly once");
    const json = JSON.stringify(post.calls[0].payload);
    assert.ok(json.includes("📅"), "the unaccounted meeting surfaced as a 📅 line in the payload");
    assert.equal(post.calls[0].webhookUrl, STUB_WEBHOOK, "the injected webhook is used, not env");
  });

  it("(b) degrade: a calendar sourceError still posts the degraded card and returns 0 (REL-01)", async () => {
    const post = makePostStub({ ok: true, value: undefined });

    const code = await runNightly(NOW, {
      gather: async () => stubGatherResult(),
      gatherCalendar: async () => stubCalendarResult(["Couldn't reach Calendar for Liam Mills"]),
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 0, "a data-source failure degrades and still returns 0 (never skip a night)");
    assert.equal(post.calls.length, 1, "the degraded card was still posted");
  });

  it("(c) post-fail: postToChat { ok:false } returns 1 (REL-02)", async () => {
    const post = makePostStub({ ok: false, error: "stub fail" });

    const code = await runNightly(NOW, {
      gather: async () => stubGatherResult(),
      gatherCalendar: async () => stubCalendarResult(),
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 1, "a POST failure exits non-zero so GitHub's failed-run email fires");
    assert.equal(post.calls.length, 1, "postToChat was attempted before the non-zero exit");
  });
});
