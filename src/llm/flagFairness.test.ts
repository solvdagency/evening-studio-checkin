/**
 * Flag-fairness — the never-drop-a-genuine-flag invariant, structural half
 * (AI-SPEC §5 "Flag fairness" rubric + §1b; threat T-05-06).
 *
 * The PM-labelled reference set (`src/calendar/__fixtures__/labelled-events.json`)
 * tags each real meeting. The entries labelled "worth-a-look" are genuine client
 * work the reconciler rightly raised and the studio should have booked — the
 * PROTECTED set. The cardinal rule: the LLM must NEVER cause such a flag to vanish.
 *
 * Two halves enforce this rule:
 *   - STRUCTURAL (here, network-free): a genuine-labelled flag with NO verdict (the
 *     toggle-OFF / model-silent case) is ALWAYS kept. applyVerdicts can only remove
 *     a flag via an explicit, index-matched "drop" — silence/keep/unknown-id never
 *     drops a genuine flag.
 *   - BEHAVIOURAL (Task 3, scripts/eval-llm-renderer.ts, dev key, NOT in CI): the
 *     offline harness runs the REAL prompt over this same set and hard-fails if the
 *     MODEL ever EMITS a "drop" for a genuine-labelled meeting.
 *
 * This file owns the structural half. It asserts the protected set is non-empty
 * (so the test can't silently pass against an empty fixture) and that those flags
 * survive both the no-verdict path and a keep verdict.
 *
 * Run: node --import tsx --test "src/llm/flagFairness.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { WorthALookItem } from "../calendar/reconcile.ts";
import type { LlmOutput } from "./schema.ts";
import { applyVerdicts } from "./applyVerdicts.ts";

interface LabelledEvent {
  _label?: string;
  summary: string;
}

/** Load the Phase-4 PM-labelled golden set. */
function loadLabelled(): LabelledEvent[] {
  const url = new URL("../calendar/__fixtures__/labelled-events.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as LabelledEvent[];
}

/**
 * The PROTECTED set: meetings the PM labelled "worth-a-look" — genuine client work
 * the reconciler rightly raised. These are exactly the flags the LLM must never
 * drop. (Case B in the golden set is the pinned canonical example.)
 */
function genuineFlags(): WorthALookItem[] {
  return loadLabelled()
    .filter((e) => (e._label ?? "").includes("worth-a-look"))
    .map((e) => ({ title: e.summary } satisfies WorthALookItem));
}

describe("flag fairness — genuine client-work flags are protected (structural)", () => {
  it("the labelled reference set contains at least one genuine worth-a-look flag", () => {
    const protectedSet = genuineFlags();
    assert.ok(
      protectedSet.length >= 1,
      "the PM-labelled golden set must include a genuine worth-a-look flag (Case B)",
    );
    assert.ok(
      protectedSet.some((m) => m.title === "FDC IPO Launch Check-In"),
      "the pinned golden Case B (FDC IPO Launch Check-In) is in the protected set",
    );
  });

  it("NO verdict (toggle-OFF / model-silent) keeps EVERY genuine flag", () => {
    const protectedSet = genuineFlags();
    const out = applyVerdicts(protectedSet, []);
    assert.deepStrictEqual(
      out.map((m) => m.title),
      protectedSet.map((m) => m.title),
      "with no verdicts, every genuine-labelled flag survives unchanged",
    );
  });

  it("a KEEP verdict keeps every genuine flag", () => {
    const protectedSet = genuineFlags();
    const verdicts: LlmOutput["meetingVerdicts"] = protectedSet.map((_m, id) => ({
      id,
      verdict: "keep" as const,
      line: "",
    }));
    const out = applyVerdicts(protectedSet, verdicts);
    assert.strictEqual(out.length, protectedSet.length, "keep removes no genuine flag");
  });

  it("ONLY an explicit, index-matched drop can remove a genuine flag (an unknown-id drop cannot)", () => {
    const protectedSet = genuineFlags();
    // A drop aimed at an id that is NOT a current index must be a no-op — a genuine
    // flag can never vanish by accident, only by an explicit matched drop the
    // behavioural eval (Task 3) is responsible for ensuring the model never emits.
    const unmatched: LlmOutput["meetingVerdicts"] = [{ id: 9999, verdict: "drop", line: "" }];
    const survived = applyVerdicts(protectedSet, unmatched);
    assert.strictEqual(
      survived.length,
      protectedSet.length,
      "an unknown-id drop leaves every genuine flag in place",
    );
  });
});
