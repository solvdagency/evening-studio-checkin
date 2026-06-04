---
phase: 05-llm-renderer-optional
plan: 01
status: complete
requirements: [LLM-01]
date: 2026-06-04
---

# Summary — 05-01: Prose-only LLM renderer (Slice 1)

## What was built
An opt-in LLM renderer (`src/llm/`) that produces the card's on-brand header sentence via a
single Anthropic Messages call, while EVERY number, row, week-bar dot and deep-link stays
deterministic. It drops in behind the existing `RenderMessage` contract through the
`RunNightlyDeps` seam, opt-in via `USE_LLM_RENDERER`, and falls back to the always-available
`renderTemplate` + a visible degraded note on any failure (REL-01). With the flag off, behaviour
is byte-identical to today.

## Key files
**Created**
- `src/llm/schema.ts` — zod `LlmOutput` contract (`headerSentence` + `meetingVerdicts`)
- `src/llm/client.ts` — Anthropic singleton (timeout 20_000, maxRetries 2, injectable for tests)
- `src/llm/prompt.ts` — cached `SYSTEM_PROMPT` + `buildFacts(report, ctx)` → number-free display facts
- `src/llm/assemble.ts` — `assembleCardsV2(report, ctx, out)`: deterministic; numbers from report/ctx only, model prose `escapeHtml`-escaped
- `src/llm/renderLlm.ts` — `renderLlmOrTemplate`: async call + zod parse in try/catch → fallback to `renderTemplate` + degraded note + one structured run-log line
- `src/llm/numberFidelity.test.ts` — property test: hostile `LlmOutput` cannot alter any figure vs `renderTemplate` baseline
- `src/llm/renderLlm.test.ts` — table-driven fallback-integrity across every failure class (stubbed client, no network) + run-log/secret-leak assertions
- `scripts/try-llm-render.ts` — live-render helper used for the tone checkpoint

**Modified**
- `package.json` — pinned `@anthropic-ai/sdk@^0.100.1` (verified official; checkpoint 0a)
- `src/index.ts` — `renderMessage` added to `RunNightlyDeps`; defaults to `renderLlmOrTemplate` when `USE_LLM_RENDERER === "true"`, else `renderTemplate`
- `src/__tests__/runNightly.test.ts` — flag-OFF byte-identity guard

## Verification
- `npm test` → 263 pass / 0 fail (Phase 1–4 untouched + 23 new LLM/integration assertions)
- `npx tsc --noEmit` → clean
- TDD RED confirmed before implementation; GREEN after.
- **Live render (checkpoint, approved):** LLM path produced an on-brand header sentence
  (cost $0.00141, 1.5s); bad-key run degraded cleanly to template with the visible degraded note
  and a single failure-class warn — no key leaked.

## Trust rule enforced in code
The LLM contributes prose only. `numberFidelity.test.ts` proves no model output (including hostile
fake hours / injected HTML) can change any numeric field, row, dot or link. T-05-01…T-05-SC from the
threat model are mitigated and asserted.

## Deviations (both minor, within scope discipline)
1. **Degraded note via post-processing, not a RenderContext field.** `cards.ts`/`renderMessage.ts`
   are not in this plan's `files_modified`; per CLAUDE.md scope discipline, `withDegradedNote` clones
   the `renderTemplate` payload and appends the muted note inside `renderLlm.ts` — same visible result,
   no changes to the render layer.
2. **Flag-OFF byte-identity test placed in `src/__tests__/runNightly.test.ts`** (the real runNightly
   integration test) rather than the plan-named `src/index.test.ts`, which does not exist.

## Follow-up / notes
- Production wiring: add the org-sanctioned `ANTHROPIC_API_KEY` as a GitHub Actions repository secret
  before the unattended cron uses the LLM path (until then it's opt-in via `USE_LLM_RENDERER`; CI never
  calls the model).
- The flag-OFF byte-identity test is a structural-equivalence proof (default path == injected
  `renderTemplate` over identical inputs). A committed golden-JSON fixture could make it stricter if ever wanted.
- Slice 2 (05-02): the `meetingVerdicts` seam in `assemble.ts` is left clearly commented and not yet applied.

## Self-Check: PASSED
