/**
 * marker / run-log module contract (plan 07-01 — REL-03 idempotency + structured
 * run log). RED-first: this file is written BEFORE src/run/marker.ts exists, so
 * the suite must FAIL on the missing module/exports until Task 2 implements it.
 *
 * What this proves (the trust-critical primitives Plan 02 will wire into runNightly):
 *   - markerDateKey derives the studio-local calendar date from the INJECTED `now`
 *     (Australia/Sydney) — NEVER a fresh clock read (D-03, single-clock boundary).
 *   - markerPath yields the `.runs/<date>.json` shape (D-01: one file = marker + log).
 *   - readMarker reports existence ONLY (the file's existence is the idempotency
 *     signal; its contents are not parsed for the guard).
 *   - writeMarker serialises the RunLog as pretty JSON via an injectable fs seam and
 *     is Result-shaped — an injected fs that throws surfaces as { ok:false }, NEVER
 *     throws (so Plan 02 can honour D-07-fail: log-and-exit-0 on a post-success
 *     marker-write failure).
 *   - buildRunLog assembles { date, posted, degraded, sourcesReached, flagsRaised,
 *     rendererUsed, postOutcome } and, on a failed post, stores ONLY the already-
 *     redacted reason string — no webhook URL, no GOOGLE_SA_KEY, no token (D-08).
 *
 * node:test + node:assert/strict, fully offline. No real fs: read/write go through
 * an in-memory stub mirroring the RunNightlyDeps default-to-real injection style.
 * Mirrors runNightly.test.ts's fixed-weekday Sydney `now`.
 *
 * Run: node --import tsx --test "src/run/__tests__/marker.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { STUDIO_ZONE } from "../../domain/types.ts";
import {
  markerDateKey,
  markerPath,
  readMarker,
  writeMarker,
  buildRunLog,
  type RunLog,
  type MarkerFs,
} from "../marker.ts";

// A fixed Sydney weekday now: Wed 3 Jun 2026 16:30 Australia/Sydney (mirrors
// runNightly.test.ts's NOW). The studio-local calendar date is 2026-06-03.
const NOW = DateTime.fromISO("2026-06-03T16:30", { zone: STUDIO_ZONE });

/**
 * An in-memory MarkerFs stub: records every write and answers exists() from a
 * configurable set. No real disk is touched. `throwOnWrite` simulates a failing
 * fs so the writeMarker Result-shape (never-throws) path can be asserted.
 */
function makeFsStub(opts?: { existing?: Set<string>; throwOnWrite?: boolean }): MarkerFs & {
  writes: { path: string; contents: string }[];
} {
  const existing = opts?.existing ?? new Set<string>();
  const writes: { path: string; contents: string }[] = [];
  return {
    writes,
    exists(path: string): boolean {
      return existing.has(path);
    },
    write(path: string, contents: string): void {
      if (opts?.throwOnWrite) throw new Error("ENOSPC: simulated disk failure");
      writes.push({ path, contents });
    },
  };
}

function sampleRunLog(overrides?: Partial<RunLog>): RunLog {
  return {
    date: "2026-06-03",
    posted: true,
    degraded: false,
    sourcesReached: { productive: true, calendar: true },
    flagsRaised: { notFullyBooked: 1, missingBrief: 0, worthALook: 2 },
    rendererUsed: "template",
    postOutcome: "ok",
    ...overrides,
  };
}

describe("markerDateKey — studio-local date of the injected now (D-03)", () => {
  it("returns the studio-local calendar date for a Sydney-zoned now", () => {
    assert.equal(markerDateKey(NOW), "2026-06-03");
  });

  it("uses STUDIO_ZONE, not the runner clock: a UTC now late on 3 Jun is already 4 Jun in Sydney", () => {
    // 2026-06-03T23:30 UTC is 2026-06-04T09:30 Australia/Sydney (UTC+10) — so the
    // studio-local date key must be the NEXT day, proving the zone conversion.
    const utcLate = DateTime.fromISO("2026-06-03T23:30", { zone: "utc" });
    assert.equal(markerDateKey(utcLate), "2026-06-04");
  });
});

describe("markerPath — the .runs/<date>.json shape (D-01)", () => {
  it("ends with .runs/<dateKey>.json", () => {
    const p = markerPath("2026-06-03");
    assert.ok(p.endsWith(".runs/2026-06-03.json"), `expected .runs/2026-06-03.json suffix, got ${p}`);
  });
});

describe("readMarker — existence is the only idempotency signal", () => {
  it("reports exists:false when the marker file is absent", () => {
    const fs = makeFsStub();
    assert.deepEqual(readMarker("2026-06-03", fs), { exists: false });
  });

  it("reports exists:true when the marker file is present (contents never parsed)", () => {
    const fs = makeFsStub({ existing: new Set([markerPath("2026-06-03")]) });
    assert.deepEqual(readMarker("2026-06-03", fs), { exists: true });
  });
});

describe("writeMarker — Result-shaped, pretty JSON, never throws", () => {
  it("serialises the RunLog as pretty JSON to markerPath(dateKey) and reports success", () => {
    const fs = makeFsStub();
    const log = sampleRunLog();
    const result = writeMarker(log, fs);

    assert.deepEqual(result, { ok: true });
    assert.equal(fs.writes.length, 1, "exactly one write");
    assert.equal(fs.writes[0].path, markerPath(log.date), "wrote to the dated marker path");
    // Pretty (2-space) JSON round-trips back to the same object.
    assert.ok(fs.writes[0].contents.includes("\n  "), "contents are pretty-printed (2-space indent)");
    assert.deepEqual(JSON.parse(fs.writes[0].contents), log, "contents round-trip to the RunLog");
  });

  it("surfaces an fs write failure as { ok:false } and NEVER throws (D-07-fail)", () => {
    const fs = makeFsStub({ throwOnWrite: true });
    let result: ReturnType<typeof writeMarker>;
    assert.doesNotThrow(() => {
      result = writeMarker(sampleRunLog(), fs);
    }, "writeMarker must not throw even when the fs write throws");
    assert.equal(result!.ok, false, "a failing fs surfaces as { ok:false }");
    if (!result!.ok) {
      assert.equal(typeof result!.error, "string", "the failure carries an error string");
    }
  });
});

describe("buildRunLog — exact field shape + redaction (D-07 / D-08)", () => {
  it("produces exactly { date, posted, degraded, sourcesReached, flagsRaised, rendererUsed, postOutcome }", () => {
    const log = buildRunLog({
      date: "2026-06-03",
      posted: true,
      degraded: false,
      sourcesReached: { productive: true, calendar: true },
      flagsRaised: { notFullyBooked: 1, missingBrief: 0, worthALook: 2 },
      rendererUsed: "template",
      postOutcome: "ok",
    });

    assert.deepEqual(
      Object.keys(log).sort(),
      [
        "date",
        "degraded",
        "flagsRaised",
        "posted",
        "postOutcome",
        "rendererUsed",
        "sourcesReached",
      ].sort(),
    );
    assert.equal(log.postOutcome, "ok");
  });

  it("stores ONLY the (already-redacted) reason string on a failed post — no secret survives JSON.stringify (D-08)", () => {
    // The caller passes an ALREADY-redacted reason. buildRunLog must not echo any
    // secret of its own; the serialised log must contain none of these substrings.
    const redactedReason = "failed: HTTP 500 from chat endpoint";
    const log = buildRunLog({
      date: "2026-06-03",
      posted: false,
      degraded: true,
      sourcesReached: { productive: true, calendar: false },
      flagsRaised: { notFullyBooked: 0, missingBrief: 0, worthALook: 0 },
      rendererUsed: "template",
      postOutcome: redactedReason,
    });

    const json = JSON.stringify(log);
    assert.ok(!json.includes("chat.googleapis.com"), "no webhook URL fragment in the log");
    assert.ok(!json.includes("GOOGLE_SA_KEY"), "no GOOGLE_SA_KEY substring in the log");
    assert.ok(!json.includes("sk-ant-"), "no token-like sk-ant- substring in the log");
    assert.equal(log.postOutcome, redactedReason, "the redacted reason is preserved verbatim");
  });
});
