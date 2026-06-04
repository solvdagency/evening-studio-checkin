/**
 * The Anthropic client singleton + the injectable `LlmClient` seam (AI-SPEC §3,
 * pitfall 6).
 *
 * ONE client per process — never `new Anthropic()` per nightly call. It carries
 * the hard ceilings that keep an unattended cron safe: `timeout: 20_000` (a slow
 * call fails fast into the deterministic fallback, never hangs the job, REL-01)
 * and `maxRetries: 2` (the SDK default — auto-retries transient 429/5xx/network
 * with backoff; exhaustion throws → fallback).
 *
 * SECURITY (threat T-05-02): the `apiKey` is read from `process.env.ANTHROPIC_API_KEY`
 * (the org-sanctioned key — GitHub Actions secret in CI, gitignored `.env` locally)
 * and is held ONLY inside the SDK client. It is never logged and never returned.
 *
 * The `LlmClient` interface is the narrow shape `renderLlm.ts` actually uses, so
 * `node:test` can inject a plain stub object with zero network and no key. We
 * deliberately do NOT widen it to the full SDK surface — the seam is the one call.
 */

import Anthropic from "@anthropic-ai/sdk";

/**
 * The minimal response shape the renderer reads back from a Messages call. A
 * non-streaming `Message` is a superset of this; typing it narrowly keeps the
 * stub trivial and documents exactly what we depend on.
 */
export interface LlmResponse {
  /** Why generation stopped — we treat "max_tokens"/"refusal" as hard failures. */
  stop_reason?: string | null;
  /** Content blocks; we read the first text block. */
  content: Array<{ type: string; text?: string }>;
  /** Token accounting for the run-log cost field (optional — absent on stubs). */
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** The narrow create-params we pass — a structural subset of the SDK's params. */
export interface LlmCreateParams {
  model: string;
  max_tokens: number;
  system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * The injectable client seam: just the `messages.create` shape the renderer uses.
 * The real `defaultClient` satisfies it; tests pass a stub that returns/throws the
 * per-failure-class shape with no network.
 */
export interface LlmClient {
  messages: {
    create(params: LlmCreateParams): Promise<LlmResponse>;
  };
}

/**
 * The process-wide Anthropic singleton. Constructed lazily on first use so merely
 * importing this module (e.g. in a test) never requires the key to be set — the key
 * is only needed when the LLM path actually runs.
 */
let cached: Anthropic | undefined;

export function defaultClient(): LlmClient {
  if (!cached) {
    cached = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 2,
      timeout: 20_000,
    });
  }
  // The SDK's messages.create is a structural superset of LlmClient; the renderer
  // only ever reads the fields declared in LlmResponse.
  return cached as unknown as LlmClient;
}
