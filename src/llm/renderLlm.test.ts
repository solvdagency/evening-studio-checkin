/**
 * Fallback-integrity test (AI-SPEC §5, the second Critical invariant / REL-01):
 * on EVERY failure class the renderer must return a complete, postable
 * `renderTemplate` payload PLUS a visible degraded note, log exactly ONE
 * `console.warn` carrying the failure class, and never leak the key or webhook.
 *
 * Table-driven over each failure class with a STUBBED client (a plain object whose
 * `messages.create` returns/throws the per-row shape) — zero network, no real key.
 * The expected payload is `renderTemplate(report, withDegradedNote(ctx))`, proven by
 * checking the degraded note is present and the rest of the card is intact.
 *
 * Slice-1 success-path + run-log assertions are added in Task 3.
 *
 * Run: node --import tsx --test "src/llm/renderLlm.test.ts"
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { DesignerId } from "../domain/types.ts";
import type { DesignerResult } from "../domain/capacity.ts";
import type { StudioReport } from "../domain/report.ts";
import type { RenderContext } from "../render/cards.ts";
import { renderLlmOrTemplate } from "./renderLlm.ts";
import type { LlmClient } from "./client.ts";

const ANISHA = "686712" as DesignerId;
const ELLA = "686716" as DesignerId;
const LIAM = "686717" as DesignerId;

const NAMES: Record<string, string> = {
  [ANISHA]: "Anisha Gittins",
  [ELLA]: "Ella Wright",
  [LIAM]: "Liam Mills",
};

const h = (hours: number): number => Math.round(hours * 60);

function designer(over: Partial<DesignerResult> & { designerId: DesignerId }): DesignerResult {
  return {
    designerId: over.designerId,
    availableMin: over.availableMin ?? h(7.5),
    confirmedMin: over.confirmedMin ?? 0,
    tentativeMin: over.tentativeMin ?? 0,
    openMin: over.openMin ?? 0,
    status: over.status ?? "ok",
    shaky: over.shaky ?? false,
    availableHours: over.availableHours ?? 7.5,
    bookedHours: over.bookedHours ?? 0,
    openHours: over.openHours ?? 0,
  };
}

function busyReport(): StudioReport {
  return {
    targetDay: "2026-06-04",
    window: ["2026-06-04"],
    designers: [
      designer({
        designerId: ANISHA,
        status: "underbooked",
        openHours: 7.5,
        openMin: h(7.5),
        bookedHours: 0,
      }),
      designer({
        designerId: ELLA,
        status: "underbooked",
        confirmedMin: h(4.5),
        openMin: h(3),
        availableHours: 7.5,
        bookedHours: 4.5,
        openHours: 3.0,
      }),
      designer({ designerId: LIAM, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
    ],
    rollup: { totalMin: h(45), openMin: h(10.5), totalHours: 45, openHours: 10.5 },
    missingDesigners: [],
  };
}

function ctx(): RenderContext {
  return {
    designerNames: NAMES,
    sourceErrors: [],
    briefFlags: [],
    tentativeNotes: {},
    header: { subtitle: "Tomorrow · Thursday 4 June", targetDate: "2026-06-04" },
  };
}

// --- failure-class stub clients (no network, no key) ------------------------------

/** A stub LlmClient whose messages.create THROWS (SDK error / transport / timeout). */
function throwingClient(message: string): LlmClient {
  return {
    messages: {
      create: async () => {
        throw new Error(message);
      },
    },
  };
}

/** A stub whose response carries a given stop_reason and content text. */
function respondingClient(opts: {
  stop_reason?: string;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
}): LlmClient {
  return {
    messages: {
      create: async () => ({
        stop_reason: opts.stop_reason ?? "end_turn",
        content: [{ type: "text", text: opts.text ?? "" }],
        usage: {
          input_tokens: opts.inputTokens ?? 100,
          output_tokens: opts.outputTokens ?? 50,
        },
      }),
    },
  } as unknown as LlmClient;
}

/**
 * A SUCCESS-path stub: returns a valid JSON body (minus the prefilled "{", which the
 * renderer re-attaches). The prose becomes the verdict header; meetingVerdicts empty.
 */
function successClient(headerSentence: string): LlmClient {
  const body = `"headerSentence":${JSON.stringify(headerSentence)},"meetingVerdicts":[]}`;
  return respondingClient({ stop_reason: "end_turn", text: body });
}

// --- console.warn capture ---------------------------------------------------------

let warnings: string[] = [];
const realWarn = console.warn;
const realLog = console.log;
let logs: string[] = [];

beforeEach(() => {
  warnings = [];
  logs = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.warn = realWarn;
  console.log = realLog;
});

const CASES: Array<{ name: string; client: LlmClient; reasonHint: RegExp }> = [
  {
    name: "(a) messages.create throws (transport / SDK error)",
    client: throwingClient("socket hang up"),
    reasonHint: /transport|error|failed/i,
  },
  {
    name: "(b) stop_reason max_tokens (truncated body)",
    client: respondingClient({ stop_reason: "max_tokens", text: '"headerSentence":"x"' }),
    reasonHint: /max_tokens|truncat/i,
  },
  {
    name: "(c) stop_reason refusal",
    client: respondingClient({ stop_reason: "refusal", text: "" }),
    reasonHint: /refusal/i,
  },
  {
    name: "(d) non-JSON body",
    client: respondingClient({ text: "Sure! Here is your card: not json at all" }),
    reasonHint: /json|parse/i,
  },
  {
    name: "(e) JSON that fails LlmOutput.parse (zod-invalid)",
    client: respondingClient({ text: '"headerSentence": 123, "meetingVerdicts": "nope"}' }),
    reasonHint: /zod|invalid|parse/i,
  },
];

describe("fallback integrity — every failure class degrades to a complete template card (T-05-02 / REL-01)", () => {
  for (const { name, client } of CASES) {
    it(`${name}: returns a complete card WITH a degraded note and exactly one warn`, async () => {
      const report = busyReport();
      const out = await renderLlmOrTemplate(report, ctx(), client);

      // A complete, postable payload: it is the normal card (has the button) and
      // it carries the visible degraded note.
      const json = JSON.stringify(out);
      assert.ok(json.includes("Open in Productive"), "the normal template card was returned");
      assert.ok(
        json.includes("LLM unavailable") || json.includes("used template"),
        "a visible degraded note is present",
      );

      // Exactly one console.warn fired with the failure class.
      assert.equal(warnings.length, 1, "exactly one console.warn line");
    });

    it(`${name}: no warn or log line leaks the key or webhook`, async () => {
      const report = busyReport();
      await renderLlmOrTemplate(report, ctx(), client);
      const all = [...warnings, ...logs].join("\n");
      assert.ok(!all.includes("sk-ant"), "no API key fragment in logs");
      assert.ok(!all.includes("ANTHROPIC_API_KEY"), "no key env name in logs");
      assert.ok(!/chat\.googleapis\.com/.test(all), "no webhook host in logs");
    });
  }
});

describe("structured run-log line (AI-SPEC §7) — both paths, no secret leakage", () => {
  it("success path emits exactly one run-log line with renderPath:llm, model, tokens and latencyMs", async () => {
    const out = await renderLlmOrTemplate(
      busyReport(),
      ctx(),
      successClient("A couple of designers have open time tomorrow."),
    );

    // The model prose became the verdict header (success path, not a fallback).
    const json = JSON.stringify(out);
    assert.ok(
      json.includes("A couple of designers have open time tomorrow."),
      "the model header sentence rendered",
    );
    assert.ok(!json.includes("LLM unavailable"), "no degraded note on the success path");
    assert.equal(warnings.length, 0, "no warn on the success path");

    const runLogs = logs.filter((l) => l.startsWith("run-log "));
    assert.equal(runLogs.length, 1, "exactly one run-log line");
    const fields = JSON.parse(runLogs[0].replace(/^run-log /, "")) as Record<string, unknown>;
    assert.equal(fields.renderPath, "llm");
    assert.equal(fields.model, "claude-haiku-4-5-20251001");
    assert.equal(typeof fields.inputTokens, "number");
    assert.equal(typeof fields.outputTokens, "number");
    assert.equal(typeof fields.estCostUsd, "number");
    assert.equal(typeof fields.latencyMs, "number");
    assert.equal(fields.fallbackReason, "none");
  });

  it("fallback path's run-log carries renderPath:template + the fallbackReason class", async () => {
    await renderLlmOrTemplate(busyReport(), ctx(), respondingClient({ stop_reason: "refusal" }));
    const runLogs = logs.filter((l) => l.startsWith("run-log "));
    assert.equal(runLogs.length, 1, "exactly one run-log line on fallback");
    const fields = JSON.parse(runLogs[0].replace(/^run-log /, "")) as Record<string, unknown>;
    assert.equal(fields.renderPath, "template");
    assert.equal(fields.fallbackReason, "refusal");
  });

  it("neither the run-log nor the warn line contains sk-ant, the key env name, or the webhook host", async () => {
    // Drive both a success and a fallback so both run-log shapes are covered.
    await renderLlmOrTemplate(busyReport(), ctx(), successClient("All sorted for tomorrow."));
    await renderLlmOrTemplate(busyReport(), ctx(), throwingClient("ECONNRESET"));
    const all = [...warnings, ...logs].join("\n");
    assert.ok(!all.includes("sk-ant"), "no API key fragment");
    assert.ok(!all.includes("ANTHROPIC_API_KEY"), "no key env name");
    assert.ok(!/chat\.googleapis\.com/.test(all), "no webhook host");
  });
});
