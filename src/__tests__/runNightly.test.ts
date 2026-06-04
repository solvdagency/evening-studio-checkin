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
 *   (b) calendar-only — a calendar sourceError (figures intact) posts the NORMAL
 *                 card with real figures + one muted calendars-unavailable note,
 *                 NO 📅 line, returns 0 (REL-01: figures stay trusted, never the
 *                 degraded card, and the GOOGLE_SA_KEY reason never leaks).
 *   (c) post-fail — postToChat returns { ok:false } → returns 1 (REL-02: GitHub's
 *                 failed-run email fires).
 *   (d) productive — a Productive sourceError posts the 🤖 degraded card and
 *                 returns 0 (REL-01: never silently skip a night).
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
import { renderTemplate } from "../render/renderMessage.ts";
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
    // Flat standard 7.5h day for every designer-date: keeps these end-to-end render
    // assertions on the pre-CAP-06 "present-but-empty → underbooked" rows; the
    // per-designer availability behaviour is exercised directly in gather.test.ts.
    rosteredMinutes: () => 450,
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

  it("(b) calendar-only: a calendar sourceError posts the NORMAL card with figures + one muted note, no 📅, returns 0 (REL-01)", async () => {
    const post = makePostStub({ ok: true, value: undefined });

    // A realistic calendar failure: the failing read yields NO events for the
    // designer(s) — only the sourceError. Reuse stubCalendarResult, then clear the
    // eventsByDesigner so no meeting survives to reconcile (matches a real outage).
    const calFail: CalendarResult = {
      ...stubCalendarResult([
        "Couldn't reach Calendar for Liam Mills: GOOGLE_SA_KEY missing client_email/private_key",
      ]),
      eventsByDesigner: { [LIAM]: [], [ANISHA]: [], [ELLA]: [] },
    };

    const code = await runNightly(NOW, {
      gather: async () => stubGatherResult(),
      gatherCalendar: async () => calFail,
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 0, "a calendar-only failure keeps figures and still returns 0");
    assert.equal(post.calls.length, 1, "the normal card was still posted exactly once");
    const json = JSON.stringify(post.calls[0].payload);
    assert.ok(
      json.includes("couldn't check calendars"),
      "the muted calendars-unavailable note is present",
    );
    assert.ok(!json.includes("📅"), "no 📅 worth-a-look line on a calendar-only failure");
    assert.ok(
      json.includes("Open in Productive"),
      "it is the NORMAL card (figures intact), not the degraded card",
    );
    assert.ok(!json.includes("GOOGLE_SA_KEY"), "the SA-key reason never reaches the card");
    assert.ok(
      !json.includes("Couldn't reach Couldn't reach"),
      "no doubled 'Couldn't reach' prefix",
    );
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

  it("(e) flag-OFF byte-identity: with USE_LLM_RENDERER unset the posted card equals renderTemplate (slice-1 independently-shippable guarantee)", async () => {
    // The flag-off default must be byte-identical to renderTemplate. We assert it by
    // capturing the payload runNightly posts when no renderMessage is injected (so it
    // resolves the env-driven default) against the payload it posts when renderTemplate
    // is injected explicitly — over the SAME stubbed inputs. Equal ⇒ the default-off
    // path is renderTemplate, with no LLM influence.
    const wasFlag = process.env.USE_LLM_RENDERER;
    delete process.env.USE_LLM_RENDERER;
    try {
      const sharedStubs = {
        gather: async () => stubGatherResult(),
        gatherCalendar: async () => stubCalendarResult(),
        webhookUrl: STUB_WEBHOOK,
      };

      const defaultPost = makePostStub({ ok: true, value: undefined });
      const codeDefault = await runNightly(NOW, {
        ...sharedStubs,
        postToChat: defaultPost.postToChat,
      });

      const templatePost = makePostStub({ ok: true, value: undefined });
      const codeTemplate = await runNightly(NOW, {
        ...sharedStubs,
        postToChat: templatePost.postToChat,
        renderMessage: renderTemplate,
      });

      assert.equal(codeDefault, 0, "flag-off default path returns 0");
      assert.equal(codeTemplate, 0, "explicit-template path returns 0");
      assert.equal(defaultPost.calls.length, 1, "default path posted once");
      assert.equal(templatePost.calls.length, 1, "template path posted once");
      assert.deepStrictEqual(
        defaultPost.calls[0].payload,
        templatePost.calls[0].payload,
        "with the flag off the posted card is byte-identical to renderTemplate",
      );
    } finally {
      if (wasFlag === undefined) delete process.env.USE_LLM_RENDERER;
      else process.env.USE_LLM_RENDERER = wasFlag;
    }
  });

  it("(f) routine-not-rostered: a 0-rostered designer renders 'off' with 'not in <Weekday>' wording, NOT 'on leave / Full day off.' (D-04/D-05)", async () => {
    const post = makePostStub({ ok: true, value: undefined });

    // Anisha rostered 0 on the target day (a routine non-working day); Liam & Ella
    // standard 7.5h. No absences — so Anisha's "off" is routine, not booked leave.
    const gatherOffAnisha = (): GatherResult => ({
      ...stubGatherResult(),
      rosteredMinutes: (designerId: DesignerId) => (designerId === ANISHA ? 0 : 450),
    });

    const code = await runNightly(NOW, {
      gather: async () => gatherOffAnisha(),
      gatherCalendar: async () => ({
        eventsByDesigner: { [LIAM]: [], [ANISHA]: [], [ELLA]: [] },
        sourceErrors: [],
      }),
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 0, "the run posts and returns 0");
    assert.equal(post.calls.length, 1, "posted exactly once");
    const json = JSON.stringify(post.calls[0].payload);
    // The target day for Wed 3 Jun is Thu 4 Jun → "not in Thursday".
    assert.ok(
      json.includes("not in Thursday"),
      "a routine non-working day reads 'not in <Weekday>'",
    );
    assert.ok(
      !json.includes("on leave / Full day off."),
      "a routine non-working day is NOT the literal 'on leave / Full day off.' wording",
    );
    assert.ok(json.includes("⚪"), "the off row keeps the ⚪ marker");
  });

  it("(g) availability-unreadable: a designer in missingDesigners still renders the 🤖 \"couldn't read\" row (D-06, no regression)", async () => {
    const post = makePostStub({ ok: true, value: undefined });

    // Anisha omitted from assessedDesigners (availability unreadable) → she lands in
    // report.missingDesigners and must render the existing 🤖 row.
    const gatherMissingAnisha = (): GatherResult => ({
      ...stubGatherResult(),
      assessedDesigners: [LIAM, ELLA],
    });

    const code = await runNightly(NOW, {
      gather: async () => gatherMissingAnisha(),
      gatherCalendar: async () => ({
        eventsByDesigner: { [LIAM]: [], [ANISHA]: [], [ELLA]: [] },
        sourceErrors: [],
      }),
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 0, "the run posts and returns 0 (never skip a night)");
    assert.equal(post.calls.length, 1, "posted exactly once");
    const json = JSON.stringify(post.calls[0].payload);
    assert.ok(json.includes("🤖"), "the availability-unreadable designer renders the 🤖 row");
    assert.ok(json.includes("couldn't read"), "the 🤖 row carries the \"couldn't read\" copy");
    // It is the NORMAL card (figures intact), not the top-level degraded variant.
    assert.ok(
      json.includes("Open in Productive"),
      "it is the normal figures-bearing card, not the degraded variant",
    );
  });

  it("(h) all-designers-unreadable: a whole-roster availability miss still posts a card with 🤖 rows, returns 0 (REL-01)", async () => {
    const post = makePostStub({ ok: true, value: undefined });

    // Every designer omitted from assessedDesigners (e.g. a whole /people failure)
    // → all three land in missingDesigners. The figures-bearing card STILL posts
    // with three 🤖 rows; it does NOT hit the top-level degraded card.
    const gatherAllMissing = (): GatherResult => ({
      ...stubGatherResult(),
      assessedDesigners: [],
    });

    const code = await runNightly(NOW, {
      gather: async () => gatherAllMissing(),
      gatherCalendar: async () => ({
        eventsByDesigner: { [LIAM]: [], [ANISHA]: [], [ELLA]: [] },
        sourceErrors: [],
      }),
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 0, "the run posts and returns 0 (never skip a night)");
    assert.equal(post.calls.length, 1, "posted exactly once");
    const json = JSON.stringify(post.calls[0].payload);
    const robotCount = (json.match(/🤖/g) ?? []).length;
    assert.equal(robotCount, 3, "all three designers render a 🤖 \"couldn't read\" row");
    assert.ok(
      json.includes("Open in Productive"),
      "it is the normal figures-bearing card (figures intact), not the degraded variant",
    );
  });

  it("(d) productive failure still posts the 🤖 degraded card and returns 0 (REL-01)", async () => {
    const post = makePostStub({ ok: true, value: undefined });

    const code = await runNightly(NOW, {
      gather: async () => stubGatherResult(["Couldn't reach Productive: 403"]),
      gatherCalendar: async () => stubCalendarResult(),
      postToChat: post.postToChat,
      webhookUrl: STUB_WEBHOOK,
    });

    assert.equal(code, 0, "a Productive failure degrades and still returns 0 (never skip a night)");
    assert.equal(post.calls.length, 1, "the degraded card was still posted exactly once");
    const json = JSON.stringify(post.calls[0].payload);
    assert.ok(json.includes("🤖"), "the 🤖 degraded marker is present");
    assert.ok(
      !json.includes("Open in Productive"),
      "the degraded card has no button (proves it is the degraded variant)",
    );
    assert.ok(!json.includes("GOOGLE_SA_KEY"), "no SA-key reason leaks into the degraded card");
  });
});
