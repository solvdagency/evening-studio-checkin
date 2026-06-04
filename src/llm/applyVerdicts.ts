/**
 * `applyVerdicts` — Slice 2 (LLM-02): apply the model's keep/soften/drop verdicts
 * to the reconciler's "worth a look" list, by DETERMINISTIC code, BEFORE rendering.
 *
 * The reconciler (src/calendar/reconcile.ts) already biases HARD to silence (D-04):
 * it only raises a flag it is fairly confident about. The LLM is precision-focused
 * and biased to silence on top of that — it may SOFTEN borderline wording or DROP a
 * clearly-overhead flag, but it can do only two things to the list and nothing more:
 * shrink it or reword an entry. It can NEVER invent a flag (AI-SPEC §6 / threat
 * T-05-05): a verdict for an id the reconciler never raised — or a drop of an item
 * not in the set — is a NO-OP. The function's output is always a (possibly reworded)
 * SUBSET of its input.
 *
 * Indexing (the trust contract): verdicts are keyed by the SAME stable, zero-based,
 * flattened index `buildFacts` (src/llm/prompt.ts) assigns when it flattens
 * `ctx.worthALook` across designers. The caller in assemble.ts flattens in the
 * identical order, applies these verdicts, then re-groups — so a verdict `id` maps
 * to exactly one meeting.
 *
 * Escaping (no double-escape): a "soften" carries the RAW model `line` into the
 * item's `title`. The single escaping boundary for the card is `rows.ts`
 * (`escapeHtml(m.title)` — threat T-05-07), which runs once downstream. Escaping
 * here as well would double-escape the visible text, so we deliberately do not.
 *
 * Pure: identical inputs yield a deep-equal new array; the input array and its items
 * are never mutated. Never throws.
 */

import type { WorthALookItem } from "../calendar/reconcile.ts";
import type { LlmOutput } from "./schema.ts";

/**
 * Adjudicate the worth-a-look list with the model's verdicts.
 *
 * For each item at index `i`:
 *   - no verdict for `i`, or verdict "keep" → the item is kept unchanged.
 *   - verdict "soften" → the item is kept, but its `title` is replaced by the
 *     model's raw `line` (the duration still comes from the item, never the model).
 *   - verdict "drop" → the item is omitted.
 * A verdict whose `id` is not a current index is ignored (no-op) — the list can
 * never grow (AI-SPEC §6 invent/harden suppression).
 */
export function applyVerdicts(
  worthALook: WorthALookItem[],
  verdicts: LlmOutput["meetingVerdicts"],
): WorthALookItem[] {
  // Index the verdicts by id for O(1) lookup. A later duplicate id (the model
  // should not emit one, but zod allows it) overwrites an earlier one — last-wins.
  const byId = new Map<number, LlmOutput["meetingVerdicts"][number]>();
  for (const v of verdicts) {
    byId.set(v.id, v);
  }

  const out: WorthALookItem[] = [];
  worthALook.forEach((item, i) => {
    const v = byId.get(i);

    // No verdict for this index → keep as the reconciler raised it (the toggle-OFF /
    // model-silent path, and the default for any flag the model didn't speak to).
    if (v === undefined || v.verdict === "keep") {
      out.push({ ...item });
      return;
    }

    if (v.verdict === "drop") {
      // Suppress this flag — the model judged it not worth surfacing.
      return;
    }

    // "soften": keep the flag, replace its wording with the model's RAW line; the
    // duration stays sourced from the item (numbers never come from the model). The
    // renderer escapes the title exactly once (rows.ts), so we pass it raw here.
    const softened: WorthALookItem = { ...item, title: v.line };
    out.push(softened);
  });

  return out;
}
