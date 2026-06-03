/**
 * Tests for the delivery transport `postToChat` (Task 1, plan 03-03).
 *
 * postToChat is the side-effecting twin of the pure renderer: one outbound POST
 * of the Cards v2 payload to the Google Chat incoming webhook, returning a
 * non-throwing `Result` value. It mirrors `src/productive/client.ts::getJson`
 * exactly. These tests STUB fetch (injected, no real network) so they are
 * deterministic and offline, and they assert the trust-critical invariants:
 *   - HTTP 2xx → { ok: true };
 *   - non-ok HTTP → { ok: false } carrying ONLY the status + a truncated body;
 *   - a thrown fetch (network down) → { ok: false } (never rejects);
 *   - a payload over the 32 KB Cards v2 limit → { ok: false } WITHOUT a POST;
 *   - the secret webhook URL appears in NONE of the returned error strings
 *     (T-03-06 information-disclosure gate).
 *
 * Run: node --import tsx --test "src/chat/__tests__/postToChat.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postToChat } from "../postToChat.ts";
import type { CardsV2Payload } from "../../render/cards.ts";

/** The secret webhook URL — its substring must never leak into any error. */
const SECRET_URL =
  "https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=AKEY&token=ATOKEN";

/** A tiny, well-formed Cards v2 payload used by the happy / failure paths. */
const PAYLOAD: CardsV2Payload = {
  cardsV2: [
    {
      cardId: "studio-checkin",
      card: {
        header: {
          title: "Solvd Studio Check-in",
          subtitle: "Tomorrow · Thursday 4 June",
          imageUrl: "https://example.com/avatar.png",
          imageType: "CIRCLE",
        },
        sections: [],
      },
    },
  ],
};

/** A fetch stub that records its calls and returns a scripted Response-like. */
function stubFetch(
  impl: (url: string, init?: unknown) => Promise<unknown>,
): { fetch: typeof fetch; calls: Array<{ url: string; init?: unknown }> } {
  const calls: Array<{ url: string; init?: unknown }> = [];
  const fetch = (async (url: string, init?: unknown) => {
    calls.push({ url, init });
    return impl(url, init);
  }) as unknown as typeof fetch;
  return { fetch, calls };
}

describe("postToChat", () => {
  it("resolves { ok: true } on an HTTP 2xx response", async () => {
    const { fetch, calls } = stubFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => "{}",
    }));

    const res = await postToChat(PAYLOAD, SECRET_URL, fetch);

    assert.deepEqual(res, { ok: true, value: undefined });
    assert.equal(calls.length, 1);
  });

  it("sends POST with JSON body and the Cards v2 content-type", async () => {
    const { fetch, calls } = stubFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => "{}",
    }));

    await postToChat(PAYLOAD, SECRET_URL, fetch);

    const init = calls[0]!.init as {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    assert.equal(calls[0]!.url, SECRET_URL);
    assert.equal(init.method, "POST");
    assert.equal(
      init.headers?.["Content-Type"],
      "application/json; charset=UTF-8",
    );
    assert.equal(init.body, JSON.stringify(PAYLOAD));
  });

  it("resolves { ok: false } on a non-ok HTTP response, carrying the status + truncated body, never the URL", async () => {
    const { fetch } = stubFetch(async () => ({
      ok: false,
      status: 500,
      text: async () => "boom",
    }));

    const res = await postToChat(PAYLOAD, SECRET_URL, fetch);

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /500/);
      assert.match(res.error, /boom/);
      assert.equal(res.error.includes(SECRET_URL), false);
      assert.equal(res.error.includes("AKEY"), false);
      assert.equal(res.error.includes("ATOKEN"), false);
    }
  });

  it("truncates a very long error body (does not dump the whole response)", async () => {
    const huge = "x".repeat(5000);
    const { fetch } = stubFetch(async () => ({
      ok: false,
      status: 400,
      text: async () => huge,
    }));

    const res = await postToChat(PAYLOAD, SECRET_URL, fetch);

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.error.length < 500, "error body should be truncated");
    }
  });

  it("resolves { ok: false } (never throws) when fetch throws", async () => {
    const { fetch } = stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    // Must NOT reject — the boundary turns the throw into a Result value.
    const res = await postToChat(PAYLOAD, SECRET_URL, fetch);

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /ECONNREFUSED/);
      assert.equal(res.error.includes(SECRET_URL), false);
    }
  });

  it("rejects a payload over 32 KB before calling fetch", async () => {
    const { fetch, calls } = stubFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => "{}",
    }));

    // Build an oversized payload: a subtitle string > 32 KB.
    const oversized: CardsV2Payload = {
      cardsV2: [
        {
          cardId: "studio-checkin",
          card: {
            header: {
              title: "Solvd Studio Check-in",
              subtitle: "x".repeat(33 * 1024),
              imageUrl: "https://example.com/avatar.png",
              imageType: "CIRCLE",
            },
            sections: [],
          },
        },
      ],
    };

    const res = await postToChat(oversized, SECRET_URL, fetch);

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /32 ?KB/i);
      assert.equal(res.error.includes(SECRET_URL), false);
    }
    assert.equal(
      calls.length,
      0,
      "fetch must NOT be called for an oversized payload",
    );
  });

  it("never leaks the webhook key/token across any failure path", async () => {
    const scenarios: Array<() => Promise<unknown>> = [
      async () => ({ ok: false, status: 403, text: async () => SECRET_URL }),
      async () => {
        throw new Error(`connect to ${SECRET_URL} failed`);
      },
    ];

    for (const impl of scenarios) {
      const { fetch } = stubFetch(impl);
      const res = await postToChat(PAYLOAD, SECRET_URL, fetch);
      assert.equal(res.ok, false);
      if (!res.ok) {
        // Even if the SERVER echoes the URL, our truncation keeps the key/token
        // out; assert the key + token never appear in our returned error.
        assert.equal(res.error.includes("AKEY"), false);
        assert.equal(res.error.includes("ATOKEN"), false);
      }
    }
  });
});
