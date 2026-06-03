/**
 * The Google Chat delivery transport (Phase 3, plan 03-03).
 *
 * Trust posture: this is the ONE side-effecting POST and the network boundary on
 * the delivery side — the exact twin of `src/productive/client.ts::getJson`.
 * Every failure — a non-ok HTTP response, a thrown fetch, or an oversized
 * payload — becomes a `Result` VALUE, never an exception (threat T-03-07 /
 * 03-RESEARCH Pitfall 1): a dead webhook must surface as `{ ok: false }` so the
 * composition root (plan 04) exits non-zero and GitHub fires the failure email
 * (REL-02) — it must NOT swallow-and-continue and silently skip the night.
 *
 * SECURITY (threat T-03-06 / 03-RESEARCH V7): the webhook URL carries the
 * `key`/`token` auth and is a secret. It is used ONLY as the fetch target and is
 * NEVER interpolated into any returned error or logged — failures carry only the
 * HTTP status and a truncated response body (mirrors client.ts security note).
 * The URL comes from `process.env.GCHAT_WEBHOOK_URL`; the composition root reads
 * it and passes it in, keeping this function pure-input and testable.
 *
 * Mirrors RESEARCH Pattern 5 and reuses the `Result` shape from client.ts
 * (Pattern 1) rather than inventing a third result convention.
 */

import type { Result } from "../productive/client.ts";
import type { CardsV2Payload } from "../render/cards.ts";

/**
 * Cards v2 hard platform limit: a message payload may not exceed 32 KB. We guard
 * this BEFORE the POST so an oversized card fails locally instead of wasting a
 * round-trip and being rejected by Chat (threat T-03-08).
 */
const MAX_PAYLOAD_BYTES = 32 * 1024;

/**
 * Spec-correct content type for a Cards v2 webhook POST (03-RESEARCH Pattern 5).
 */
const CHAT_CONTENT_TYPE = "application/json; charset=UTF-8";

/** Keep failure bodies short — never dump the whole upstream response into a log. */
const MAX_ERROR_BODY_CHARS = 300;

/**
 * The injectable fetch shape — global `fetch` satisfies it. Injected so tests can
 * stub the network (mirrors the stubbed-dependency test pattern in gather.test.ts).
 */
type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * POST the Cards v2 payload to the Google Chat incoming webhook and return a
 * non-throwing `Result`. Success (HTTP 2xx) → `{ ok: true }`; a non-ok status or
 * a thrown fetch → `{ ok: false, error }` carrying only the status + a truncated
 * body. An oversized payload is rejected before the POST. NEVER throws across
 * this boundary, and NEVER puts the webhook URL into the error.
 *
 * @param payload    the Cards v2 message body to deliver.
 * @param webhookUrl the secret Google Chat webhook URL (from GCHAT_WEBHOOK_URL).
 * @param fetchImpl  injectable fetch (defaults to global `fetch`); tests stub it.
 */
export async function postToChat(
  payload: CardsV2Payload,
  webhookUrl: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<Result<void>> {
  const body = JSON.stringify(payload);

  // Size guard — short-circuit before the network (no fetch call) on oversize.
  if (body.length > MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: `card payload exceeds 32 KB (${body.length} bytes)`,
    };
  }

  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": CHAT_CONTENT_TYPE },
      body,
    });

    if (!res.ok) {
      // Read a short slice of the body for diagnostics — status + body only,
      // NEVER the webhook URL (T-03-06). text() is best-effort. The upstream
      // body could itself echo the full URL, so we REDACT it before returning.
      let detail = "";
      try {
        detail = (await res.text())
          .split(webhookUrl)
          .join("[webhook]")
          .slice(0, MAX_ERROR_BODY_CHARS);
      } catch {
        detail = "<no body>";
      }
      return { ok: false, error: `chat post ${res.status}: ${detail}` };
    }

    return { ok: true, value: undefined };
  } catch (e) {
    // A thrown fetch (network/DNS down) degrades to a Result — never rejects.
    // A thrown message can itself echo the full URL (e.g. "connect to <url>
    // failed"), so we REDACT the webhook URL out of the message before returning
    // it — the secret key/token must not leak via the exception (T-03-06).
    const raw = e instanceof Error ? e.message : String(e);
    const safe = raw.split(webhookUrl).join("[webhook]");
    return { ok: false, error: `chat post threw: ${safe}` };
  }
}
