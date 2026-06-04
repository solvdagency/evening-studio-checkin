/**
 * Tests for the same-day same-client reconciler (plan 04-03, MEET-03 / MEET-04
 * input) and the matchTitleToClient matcher.
 *
 * These assert the deterministic heart of Phase 4 over the plan-02 golden
 * fixtures (src/calendar/__fixtures__/labelled-events.json) + the committed
 * CLIENT_ALIAS_MAP / MEETING_IGNORE_LIST. The two golden cases must resolve
 * exactly: "Quick FDC catch up" (3 Jun, FDC booked) → NOT flagged; "FDC IPO
 * Launch Check-In" (26 May, no FDC booking) → worth a look. D-04 bias-to-silence:
 * an uncertain / unmatched / double-matched title NEVER flags.
 *
 * node:test + node:assert/strict, offline. No network, no clock, no hour math.
 * Run: node --import tsx --test src/calendar/__tests__/reconcile.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FilteredEvent } from "../gather.ts";
import type { DesignerId } from "../../domain/types.ts";
import { CLIENT_ALIAS_MAP, MEETING_IGNORE_LIST } from "../../config.ts";
import {
  reconcileMeetings,
  matchTitleToClient,
  type WorthALookItem,
} from "../reconcile.ts";

const LIAM = "686717" as DesignerId;

const FDC_COMPANY = "1333899";
const STREEM_COMPANY = "1057026";
const STREAM_HILL_COMPANY = "1109526";

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
const OVERHEAD = get("overhead · ignore-list");
const DECLINED = get("synthetic · declined-self (exclude)");

describe("matchTitleToClient — case-insensitive, longest-alias-first", () => {
  it("matches 'Quick FDC catch up' to FDC Construction", () => {
    const m = matchTitleToClient("Quick FDC catch up", CLIENT_ALIAS_MAP);
    assert.equal(m?.companyId, FDC_COMPANY);
  });

  it("matches 'FDC IPO Launch Check-In' to FDC (via 'IPO Launch' alias)", () => {
    const m = matchTitleToClient("FDC IPO Launch Check-In", CLIENT_ALIAS_MAP);
    assert.equal(m?.companyId, FDC_COMPANY);
  });

  it("is case-insensitive", () => {
    const m = matchTitleToClient("quick fdc catch up", CLIENT_ALIAS_MAP);
    assert.equal(m?.companyId, FDC_COMPANY);
  });

  it("returns null when no alias matches (D-04 — stay silent)", () => {
    assert.equal(matchTitleToClient("Random sync with nobody", CLIENT_ALIAS_MAP), null);
  });

  it("returns null for '(No title)'", () => {
    assert.equal(matchTitleToClient("(No title)", CLIENT_ALIAS_MAP), null);
  });

  it("Streem ≠ Stream Hill: 'Streem - Sales Prop' → STREEM only, never Stream Hill", () => {
    const m = matchTitleToClient("Streem - Sales Prop", CLIENT_ALIAS_MAP);
    assert.equal(m?.companyId, STREEM_COMPANY);
    assert.notEqual(m?.companyId, STREAM_HILL_COMPANY);
  });

  it("Stream Hill ≠ Streem: 'Stream Hill Project Video' → Stream Hill only", () => {
    const m = matchTitleToClient("Stream Hill Project Video", CLIENT_ALIAS_MAP);
    assert.equal(m?.companyId, STREAM_HILL_COMPANY);
    assert.notEqual(m?.companyId, STREEM_COMPANY);
  });

  it("DOUBLE MATCH → null (bias to silence, D-04)", () => {
    // A title carrying two distinct companies' aliases must NOT confidently flag.
    const m = matchTitleToClient("FDC and Hunter Water joint review", CLIENT_ALIAS_MAP);
    assert.equal(m, null);
  });
});

describe("reconcileMeetings — the two golden cases", () => {
  it("GOLDEN 1 (COVERED): 'Quick FDC catch up' with FDC booked → NOT flagged", () => {
    const out = reconcileMeetings(
      { [LIAM]: [COVERED] },
      { [LIAM]: new Set([FDC_COMPANY]) },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.deepEqual(out[LIAM], []);
  });

  it("GOLDEN 2 (WORTH A LOOK): 'FDC IPO Launch Check-In' with NO FDC booking → flagged", () => {
    const out = reconcileMeetings(
      { [LIAM]: [WORTH] },
      { [LIAM]: new Set<string>() }, // no FDC booking on the 26th (D-02 same-day strict)
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.equal(out[LIAM].length, 1);
    const item: WorthALookItem = out[LIAM][0];
    assert.equal(item.title, "FDC IPO Launch Check-In");
    assert.equal(item.start, WORTH.startLabel);
    assert.equal(item.link, WORTH.htmlLink);
  });
});

describe("reconcileMeetings — bias against false positives (D-04)", () => {
  it("uncertain / unmatched title → stays quiet even with NO bookings", () => {
    const e: FilteredEvent = { ...COVERED, summary: "Random sync with nobody" };
    const out = reconcileMeetings(
      { [LIAM]: [e] },
      { [LIAM]: new Set<string>() },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.deepEqual(out[LIAM], []);
  });

  it("double-matched title → stays quiet even with NO bookings", () => {
    const e: FilteredEvent = { ...COVERED, summary: "FDC and Hunter Water joint review" };
    const out = reconcileMeetings(
      { [LIAM]: [e] },
      { [LIAM]: new Set<string>() },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.deepEqual(out[LIAM], []);
  });

  it("'travel time, stevedores' excluded by ignore-list BEFORE alias match", () => {
    // Without the ignore-list this would match the Stevedores alias and flag.
    const e: FilteredEvent = { ...COVERED, summary: "travel time, stevedores" };
    const out = reconcileMeetings(
      { [LIAM]: [e] },
      { [LIAM]: new Set<string>() },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.deepEqual(out[LIAM], []);
  });
});

describe("reconcileMeetings — non-counting events never reach the output", () => {
  it("an overhead event is filtered first (never flagged)", () => {
    const out = reconcileMeetings(
      { [LIAM]: [OVERHEAD] },
      { [LIAM]: new Set<string>() },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.deepEqual(out[LIAM], []);
  });

  it("a declined-self event is filtered first even though its title matches FDC", () => {
    const out = reconcileMeetings(
      { [LIAM]: [DECLINED] },
      { [LIAM]: new Set<string>() },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.deepEqual(out[LIAM], []);
  });
});

describe("reconcileMeetings — structure", () => {
  it("returns an entry (empty array) for every designer key passed in", () => {
    const out = reconcileMeetings(
      { [LIAM]: [] },
      { [LIAM]: new Set<string>() },
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.ok(LIAM in out);
    assert.deepEqual(out[LIAM], []);
  });

  it("a designer with no booked-clients entry still reconciles (treated as no bookings → flags)", () => {
    const out = reconcileMeetings(
      { [LIAM]: [WORTH] },
      {}, // no bookedClients entry for Liam at all
      CLIENT_ALIAS_MAP,
      MEETING_IGNORE_LIST,
    );
    assert.equal(out[LIAM].length, 1);
  });
});
