/**
 * The LLM output contract — zod is the single source of truth (AI-SPEC §3/§4b).
 *
 * The model is TOLD this shape in the prompt, but we NEVER trust its schema
 * adherence: every nightly call's JSON body is `LlmOutput.parse`d at the boundary
 * and any deviation throws into the deterministic `renderTemplate` fallback
 * (REL-01). The model contributes PROSE ONLY — `headerSentence` (and, in a later
 * slice, per-meeting `line` text). It never emits a number that reaches a figure
 * field: every hour/row/dot/link in the assembled card comes from `report`/`ctx`
 * in deterministic TypeScript (the project's cardinal trust rule).
 *
 * Bounds are guardrails, not niceties: `headerSentence` is length-capped so a
 * runaway body is a failure (→ fallback), and `meetingVerdicts` is `.max(20)` so
 * a degenerate list can't balloon the card. Verdicts are keyed by the stable
 * numeric `id` we send in (NOT free-text title) so the assembler can match them
 * back without parsing prose. Slice 1 does not yet APPLY the verdicts to rows —
 * they are validated here but ignored by the assembler (the Slice-2 seam).
 */

import { z } from "zod";

/** The validated model output. Locked per AI-SPEC §3/§4b — do not re-decide. */
export const LlmOutput = z.object({
  /** On-brand prose for the verdict-section header. No numbers (numbers come from TS). */
  headerSentence: z.string().min(1).max(200),
  /** One keep/soften/drop verdict per worth-a-look meeting, keyed by the id we sent in. */
  meetingVerdicts: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        verdict: z.enum(["keep", "soften", "drop"]),
        line: z.string().max(160),
      }),
    )
    .max(20),
});

export type LlmOutput = z.infer<typeof LlmOutput>;
