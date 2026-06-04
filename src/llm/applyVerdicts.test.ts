/**
 * Structural tests for `applyVerdicts` (Slice 2, LLM-02; AI-SPEC §4 verdict
 * semantics + §6 invent/harden suppression). Pure, network-free, no key.
 *
 * `applyVerdicts(worthALook, verdicts)` adjudicates the reconciler's bias-to-silence
 * "worth a look" list with the model's keep/soften/drop verdicts, keyed by the SAME
 * stable flattened index `buildFacts` assigns. The function can ONLY shrink or
 * reword the list — never grow it:
 *   - no verdict / "keep"   → item unchanged.
 *   - "soften"              → item kept, its title replaced by the model's `line`.
 *   - "drop"                → item removed.
 *   - a verdict for an id that is not a current index → ignored (no-op). The model
 *     can never invent a flag (AI-SPEC §6 / threat T-05-05).
 *
 * Escaping note: `applyVerdicts` carries the RAW model `line` into `title`. The
 * card's single escaping boundary is `rows.ts` (`escapeHtml(m.title)`), so escaping
 * happens exactly once downstream — pre-escaping here would double-escape the card.
 *
 * Run: node --import tsx --test "src/llm/applyVerdicts.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WorthALookItem } from "../calendar/reconcile.ts";
import type { LlmOutput } from "./schema.ts";
import { applyVerdicts } from "./applyVerdicts.ts";

type Verdicts = LlmOutput["meetingVerdicts"];

/** A representative flattened worth-a-look list (the buildFacts indexing order). */
function sample(): WorthALookItem[] {
  return [
    { title: "FDC IPO Launch Check-In", durationMinutes: 60 },
    { title: "Stevedores x Solvd - Logo refresh briefing", durationMinutes: 30 },
    { title: "Mystery meeting" }, // no durationMinutes
  ];
}

describe("applyVerdicts — toggle-OFF / no verdicts (Slice-1 byte identity)", () => {
  it("an EMPTY verdict list returns the worth-a-look list deep-equal to the input", () => {
    const input = sample();
    const out = applyVerdicts(input, []);
    assert.deepStrictEqual(out, sample(), "no verdicts → identical list (Slice-1 behaviour)");
  });

  it("does not mutate the input array or its items", () => {
    const input = sample();
    applyVerdicts(input, [{ id: 0, verdict: "drop", line: "x" }]);
    assert.deepStrictEqual(input, sample(), "input array/items left untouched (pure)");
  });
});

describe("applyVerdicts — keep / soften / drop", () => {
  it("KEEP for id N leaves item N exactly as the reconciler raised it", () => {
    const verdicts: Verdicts = [{ id: 0, verdict: "keep", line: "ignored on keep" }];
    const out = applyVerdicts(sample(), verdicts);
    assert.deepStrictEqual(out[0], {
      title: "FDC IPO Launch Check-In",
      durationMinutes: 60,
    });
    assert.strictEqual(out.length, 3, "keep removes nothing");
  });

  it("SOFTEN for id N keeps the item but replaces its title with the model line (raw, duration intact)", () => {
    const verdicts: Verdicts = [
      { id: 1, verdict: "soften", line: "A quick internal sync — probably fine." },
    ];
    const out = applyVerdicts(sample(), verdicts);
    assert.strictEqual(out.length, 3, "soften keeps the item in the list");
    assert.strictEqual(
      out[1]!.title,
      "A quick internal sync — probably fine.",
      "title replaced with the RAW model line (rows.ts escapes once downstream)",
    );
    assert.strictEqual(out[1]!.durationMinutes, 30, "duration still sourced from the item, not the model");
  });

  it("DROP for id N removes item N from the list", () => {
    const verdicts: Verdicts = [{ id: 0, verdict: "drop", line: "" }];
    const out = applyVerdicts(sample(), verdicts);
    assert.strictEqual(out.length, 2, "drop shrinks the list by one");
    assert.deepStrictEqual(
      out.map((m) => m.title),
      ["Stevedores x Solvd - Logo refresh briefing", "Mystery meeting"],
      "the dropped item is gone; the rest keep their order",
    );
  });

  it("applies multiple verdicts together (drop + soften) by stable index", () => {
    const verdicts: Verdicts = [
      { id: 0, verdict: "drop", line: "" },
      { id: 2, verdict: "soften", line: "Could be nothing." },
    ];
    const out = applyVerdicts(sample(), verdicts);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0]!.title, "Stevedores x Solvd - Logo refresh briefing", "id 1 kept");
    assert.strictEqual(out[1]!.title, "Could be nothing.", "id 2 softened");
  });
});

describe("applyVerdicts — invent / harden suppression (AI-SPEC §6 / T-05-05)", () => {
  it("INVENT no-op: a verdict for an id the reconciler never raised adds nothing", () => {
    const verdicts: Verdicts = [{ id: 999, verdict: "keep", line: "invented" }];
    const out = applyVerdicts(sample(), verdicts);
    assert.deepStrictEqual(out, sample(), "unknown id is ignored — the list cannot grow");
  });

  it("DROP-UNKNOWN no-op: a drop for an out-of-range id changes nothing", () => {
    const verdicts: Verdicts = [{ id: 42, verdict: "drop", line: "" }];
    const out = applyVerdicts(sample(), verdicts);
    assert.deepStrictEqual(out, sample(), "dropping an id not in the set is a no-op");
  });

  it("a SOFTEN for an unknown id never appends a new item", () => {
    const verdicts: Verdicts = [{ id: 7, verdict: "soften", line: "phantom" }];
    const out = applyVerdicts(sample(), verdicts);
    assert.strictEqual(out.length, 3, "list length is bounded by the input — never grows");
    assert.ok(
      !out.some((m) => m.title === "phantom"),
      "the phantom line never enters the list",
    );
  });

  it("the output is always a (possibly reworded) SUBSET of the input — never larger", () => {
    const verdicts: Verdicts = [
      { id: 0, verdict: "soften", line: "a" },
      { id: 1, verdict: "keep", line: "b" },
      { id: 2, verdict: "drop", line: "c" },
      { id: 50, verdict: "keep", line: "invented" },
      { id: 51, verdict: "soften", line: "invented2" },
    ];
    const out = applyVerdicts(sample(), verdicts);
    assert.ok(out.length <= sample().length, "applyVerdicts can only shrink or reword, never grow");
  });
});
