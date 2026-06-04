/**
 * marker / run-log module (plan 07-01 — REL-03 idempotency + structured run log).
 *
 * One committed JSON file at `.runs/<studio-local-date>.json` serves BOTH roles
 * (D-01): its EXISTENCE is the idempotency marker ("did we already post for this
 * evening?"), and its CONTENTS are the structured run log (sources reached, flags
 * raised, renderer used, post outcome). One artifact satisfies both criteria — no
 * second mechanism (D-02).
 *
 * Trust boundaries this module preserves:
 *   - SINGLE CLOCK (D-03): the marker date key derives ONLY from the injected
 *     `now`, converted to the studio zone. There is NO live system-clock read in
 *     this file — the date a run marks is the same studio-local date the report uses,
 *     never a fresh read of the runner's UTC clock.
 *   - NEVER-THROW WRITE (D-07-fail): writeMarker is Result-shaped. A failing fs
 *     surfaces as { ok:false } rather than throwing, so the caller (Plan 02) can
 *     log-loudly-and-exit-0 when a marker write fails AFTER a successful post —
 *     a failed marker-persist must not masquerade as a failed run.
 *   - REDACTION (D-08): the RunLog carries only counts, booleans, a date string,
 *     an enum, and an already-redacted postOutcome reason. No webhook URL, no
 *     service-account key, no token may ever reach the serialised file (which is
 *     committed to the repo). buildRunLog never receives or echoes a secret of
 *     its own — the caller passes a pre-redacted reason string.
 *
 * The fs seam (MarkerFs) mirrors the RunNightlyDeps default-to-real injection
 * style in src/index.ts: readMarker/writeMarker take an optional fs that defaults
 * to a thin node:fs implementation, so unit tests inject an in-memory stub and
 * touch no real disk.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DateTime } from "luxon";
import { STUDIO_ZONE } from "../domain/types.ts";

/** The committed run-log directory (relative to the repo root / process cwd). */
const RUNS_DIR = ".runs";

/**
 * The structured run log. This is the on-disk shape of `.runs/<date>.json`.
 *
 * Every field is a count, boolean, date string, or enum — nothing here can carry
 * a secret. `postOutcome` is "ok" on success or an ALREADY-REDACTED reason string
 * on failure (the caller redacts; this type never holds a raw error/URL).
 */
export interface RunLog {
  /** Studio-local "yyyy-MM-dd" date this run marks (= markerDateKey(now)). */
  date: string;
  /** True once a post (normal or degraded) succeeded. */
  posted: boolean;
  /** True when the posted card was the degraded 🤖 variant. */
  degraded: boolean;
  /** Which data sources the run successfully reached. */
  sourcesReached: {
    productive: boolean;
    calendar: boolean;
  };
  /** Summary counts of the flags the run raised. */
  flagsRaised: {
    notFullyBooked: number;
    missingBrief: number;
    worthALook: number;
  };
  /** Which renderer produced the card. */
  rendererUsed: "template" | "llm";
  /** "ok" on a successful post, else an already-redacted reason string. */
  postOutcome: "ok" | string;
}

/**
 * The filesystem seam. readMarker/writeMarker depend on this interface, not on
 * node:fs directly, so tests inject an in-memory stub (mirroring how runNightly
 * injects gather/postToChat). `exists` answers the idempotency question; `write`
 * persists the run log.
 */
export interface MarkerFs {
  exists(path: string): boolean;
  write(path: string, contents: string): void;
}

/**
 * The real fs implementation (the default). `write` ensures the `.runs` directory
 * exists (recursive mkdir) before writing — the first marker of the project must
 * not fail on a missing directory.
 */
const realFs: MarkerFs = {
  exists(path: string): boolean {
    return existsSync(path);
  },
  write(path: string, contents: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  },
};

/**
 * The marker date key: the studio-local calendar date of the injected `now`.
 *
 * This is the ONLY way the date is derived (D-03). It re-zones the passed `now`
 * to STUDIO_ZONE and formats the calendar date — it does NOT read the live
 * system clock. A UTC-zoned `now` late on one day correctly resolves to the next
 * studio-local day, which is why we must convert rather than read the runner clock.
 */
export function markerDateKey(now: DateTime): string {
  return now.setZone(STUDIO_ZONE).toFormat("yyyy-MM-dd");
}

/** The committed marker/run-log path for a given date key: `.runs/<date>.json`. */
export function markerPath(dateKey: string): string {
  return join(RUNS_DIR, `${dateKey}.json`);
}

/**
 * Read whether today's marker exists. EXISTENCE is the only idempotency signal —
 * the file's contents are deliberately NOT parsed here (a malformed or partial
 * log must still count as "already posted" so a re-run never double-posts).
 */
export function readMarker(dateKey: string, fs: MarkerFs = realFs): { exists: boolean } {
  return { exists: fs.exists(markerPath(dateKey)) };
}

/**
 * Persist the run log to its dated marker path as pretty (2-space) JSON.
 *
 * Result-shaped and NEVER throws (D-07-fail): any fs error is caught and returned
 * as { ok:false, error }, so a post-success marker-write failure upstream can be
 * logged loudly and exit 0 rather than firing a misleading "run failed" alert.
 */
export function writeMarker(
  runLog: RunLog,
  fs: MarkerFs = realFs,
): { ok: true } | { ok: false; error: string } {
  try {
    fs.write(markerPath(runLog.date), JSON.stringify(runLog, null, 2));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Assemble a RunLog from already-computed counts/booleans and an already-redacted
 * postOutcome. buildRunLog does NOT receive or echo any secret — the caller is
 * responsible for redacting the reason string before passing it as `postOutcome`
 * (D-08). This function only shapes the object; it adds no new fields and no I/O.
 */
export function buildRunLog(args: RunLog): RunLog {
  return {
    date: args.date,
    posted: args.posted,
    degraded: args.degraded,
    sourcesReached: {
      productive: args.sourcesReached.productive,
      calendar: args.sourcesReached.calendar,
    },
    flagsRaised: {
      notFullyBooked: args.flagsRaised.notFullyBooked,
      missingBrief: args.flagsRaised.missingBrief,
      worthALook: args.flagsRaised.worthALook,
    },
    rendererUsed: args.rendererUsed,
    postOutcome: args.postOutcome,
  };
}
