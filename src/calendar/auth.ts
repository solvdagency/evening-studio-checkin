/**
 * Google Calendar service-account auth (Phase 4) — the one new external auth
 * surface in the project.
 *
 * Trust posture (mirrors src/productive/client.ts `authHeaders`): the SA private
 * key is a SECRET read ONLY from `process.env.GOOGLE_SA_KEY` (a GitHub Actions
 * secret in CI; a gitignored `.env`/`secrets/` file locally) and `JSON.parse`d.
 * The parsed key and the minted JWT/calendar client are NEVER logged
 * (`console.*`) — threat T-04-01. A missing/malformed key degrades to a Result
 * error instead of throwing, so a credential problem becomes a `sourceErrors`
 * string and the nightly run still posts (REL-01).
 *
 * DWD: one read-only scope (`calendar.readonly`, least privilege — T-04-02) and a
 * per-designer `subject:` so the single SA impersonates each of the three
 * designers' primary calendars in turn. The googleapis client mints, caches, and
 * refreshes the access token internally — never hand-roll JWT signing.
 */

import { google } from "googleapis";
import type { Result } from "../productive/client.ts";

/** Least-privilege read-only Calendar scope (live-authorised in Admin console). */
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** The two SA-key fields the JWT constructor needs. */
export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/**
 * Read + parse `process.env.GOOGLE_SA_KEY` into a `{ client_email, private_key }`
 * Result. A missing env var or malformed JSON degrades to an error (mirrors
 * `authHeaders`' missing-secret degrade) — NEVER throws, NEVER logs the value.
 * The error string carries no key material.
 */
export function loadSaKey(): Result<ServiceAccountKey> {
  const raw = process.env.GOOGLE_SA_KEY;
  if (!raw) {
    return {
      ok: false,
      error: "missing Google credentials: set GOOGLE_SA_KEY (service-account JSON)",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Do NOT echo the raw value — only a generic message.
    return { ok: false, error: "GOOGLE_SA_KEY is not valid JSON" };
  }
  const key = parsed as Partial<ServiceAccountKey>;
  if (typeof key.client_email !== "string" || typeof key.private_key !== "string") {
    return {
      ok: false,
      error: "GOOGLE_SA_KEY missing client_email/private_key",
    };
  }
  return { ok: true, value: { client_email: key.client_email, private_key: key.private_key } };
}

/**
 * Mint a Calendar v3 client that impersonates `subject` (a designer's email) via
 * domain-wide delegation. The `google.auth.JWT` handles token minting + refresh
 * internally (RESEARCH Pattern 1). The returned client and the key are never
 * logged. Returns the googleapis calendar client (typed loosely at call sites so
 * tests can stub `events.list`).
 */
export function buildCalendarClient(saKey: ServiceAccountKey, subject: string) {
  const auth = new google.auth.JWT({
    email: saKey.client_email,
    key: saKey.private_key,
    scopes: [CALENDAR_SCOPE],
    subject, // DWD: impersonate this designer's calendar
  });
  return google.calendar({ version: "v3", auth });
}
