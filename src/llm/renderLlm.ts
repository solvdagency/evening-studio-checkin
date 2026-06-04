/**
 * `renderLlmOrTemplate` — the prose-only LLM renderer behind a total fallback
 * (AI-SPEC §3 Entry Point Pattern, §4 Core Pattern, §6 guardrails; REL-01).
 *
 * Sequence (single shot, no content-retry loop):
 *   1. buildFacts(report, ctx) — the number-free, display-only user message.
 *   2. one messages.create: cached system block + facts + assistant prefill "{".
 *   3. stop_reason guard (max_tokens / refusal → hard failure), re-attach "{",
 *      JSON.parse, then LlmOutput.parse (zod is the boundary).
 *   4. assembleCardsV2 — deterministic; numbers stay in TS, prose escaped.
 * Any failure (transport-exhausted, timeout, max_tokens, refusal, non-JSON,
 * zod-invalid) is caught → ONE console.warn with the failure CLASS (never the key
 * or webhook) → renderTemplate + a visible muted degraded note. The night always
 * posts; a dead LLM is noticed by the absence of on-brand prose, never by silence.
 *
 * One structured run-log line per run records renderPath / model / tokens /
 * estCostUsd / latencyMs / fallbackReason (AI-SPEC §7) — and carries no secret.
 *
 * SECURITY (T-05-02): the warn + run-log lines carry only a failure-class STRING
 * and counters. The key (sk-ant…, ANTHROPIC_API_KEY) and the webhook URL never
 * appear in any console call here.
 */

import type { CardsV2Payload, RenderContext, Widget } from "../render/cards.ts";
import type { StudioReport } from "../domain/report.ts";
import { renderTemplate } from "../render/renderMessage.ts";
import { BRAND_COLORS, USE_LLM_MEETING_JUDGMENT } from "../config.ts";
import { LlmOutput } from "./schema.ts";
import { buildFacts, SYSTEM_PROMPT } from "./prompt.ts";
import { assembleCardsV2 } from "./assemble.ts";
import { defaultClient } from "./client.ts";
import type { LlmClient } from "./client.ts";

/** The pinned model id (AI-SPEC §4). Dated by intent so a silent swap is visible. */
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

/** Per-MTok prices for the cost estimate (AI-SPEC §4b, Haiku 4.5; order-of-magnitude). */
const INPUT_USD_PER_MTOK = 1;
const OUTPUT_USD_PER_MTOK = 5;

/** The failure classes surfaced in the warn + run-log fallbackReason (never the key). */
type FailureReason = "transport" | "max_tokens" | "refusal" | "json" | "zod" | "none";

/** A typed sentinel so a stop_reason failure carries its class through the catch. */
class LlmFailure extends Error {
  constructor(public reason: FailureReason, message: string) {
    super(message);
    this.name = "LlmFailure";
  }
}

/**
 * Add the visible muted degraded note to a deterministic template payload, WITHOUT
 * mutating renderTemplate's output. Mirrors the calendarUnavailable muted-note
 * pattern (a grey note alongside the verdict) — not a new top-level variant. For the
 * short fixed-copy variants (holiday / closure / degraded) there is no verdict
 * section to annotate, so the card is returned unchanged.
 */
export function withDegradedNote(report: StudioReport, ctx: RenderContext): CardsV2Payload {
  const base = renderTemplate(report, ctx);
  if (ctx.holidayTomorrow || ctx.closureTomorrow || ctx.sourceErrors.length > 0) {
    return base;
  }
  const payload: CardsV2Payload = structuredClone(base);
  const note: Widget = {
    textParagraph: {
      text: `<font color="${BRAND_COLORS.muted}">LLM unavailable tonight — used template wording</font>`,
    },
  };
  payload.cardsV2[0]?.card.sections[0]?.widgets.push(note);
  return payload;
}

/** Round to a sane number of dp for the run-log cost field. */
function estCost(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens * INPUT_USD_PER_MTOK + outputTokens * OUTPUT_USD_PER_MTOK) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Emit the ONE structured run-log line (AI-SPEC §7). No secret ever appears here. */
function logRun(fields: {
  renderPath: "llm" | "template";
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  latencyMs: number;
  fallbackReason: FailureReason;
}): void {
  console.log(`run-log ${JSON.stringify(fields)}`);
}

/**
 * Render the card via a single Anthropic call, falling back to the deterministic
 * template + degraded note on ANY failure. `client` is injectable for tests; it
 * defaults to the process-wide singleton.
 */
export async function renderLlmOrTemplate(
  report: StudioReport,
  ctx: RenderContext,
  client: LlmClient = defaultClient(),
): Promise<CardsV2Payload> {
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const facts = buildFacts(report, ctx);

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // No temperature (deprecated on newer models; omit for forward-compat).
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: JSON.stringify(facts) },
        { role: "assistant", content: "{" }, // prefill: force a bare JSON object
      ],
    });

    inputTokens = msg.usage?.input_tokens ?? 0;
    outputTokens = msg.usage?.output_tokens ?? 0;

    if (msg.stop_reason === "max_tokens") {
      throw new LlmFailure("max_tokens", "response truncated");
    }
    if (msg.stop_reason === "refusal") {
      throw new LlmFailure("refusal", "model refused");
    }

    const block = msg.content[0];
    const text = block && block.type === "text" ? (block.text ?? "") : "";
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse("{" + text); // re-attach the prefilled "{"
    } catch {
      throw new LlmFailure("json", "response was not valid JSON");
    }

    const validated = LlmOutput.safeParse(parsedJson);
    if (!validated.success) {
      throw new LlmFailure("zod", "response failed schema validation");
    }

    // Slice-2 (LLM-02): apply the model's keep/soften/drop meeting verdicts to the
    // worth-a-look lines ONLY when the judgment toggle is on (default OFF → byte-
    // identical to Slice 1). The header prose is substituted regardless.
    const payload = assembleCardsV2(report, ctx, validated.data, USE_LLM_MEETING_JUDGMENT);
    logRun({
      renderPath: "llm",
      model: MODEL,
      inputTokens,
      outputTokens,
      estCostUsd: estCost(inputTokens, outputTokens),
      latencyMs: Date.now() - started,
      fallbackReason: "none",
    });
    return payload;
  } catch (err) {
    // Classify the failure WITHOUT ever logging the underlying message (which could,
    // in theory, echo back request detail). Only the class string is surfaced.
    const reason: FailureReason = err instanceof LlmFailure ? err.reason : "transport";
    console.warn(`LLM render failed (${reason}) — falling back to template`);
    logRun({
      renderPath: "template",
      model: MODEL,
      inputTokens,
      outputTokens,
      estCostUsd: estCost(inputTokens, outputTokens),
      latencyMs: Date.now() - started,
      fallbackReason: reason,
    });
    return withDegradedNote(report, ctx);
  }
}
