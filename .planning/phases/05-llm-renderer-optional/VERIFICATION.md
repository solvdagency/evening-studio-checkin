---
phase: 05-llm-renderer-optional
verified: 2026-06-04T09:50:25Z
status: passed
score: 3/3
overrides_applied: 0
---

# Phase 5: LLM Renderer (optional) — Verification Report

**Phase Goal:** An optional LLM renderer produces the message prose and adjudicates fuzzy meeting reconciliation behind a swappable interface — receiving only pre-computed facts, never doing arithmetic — and falls back to the always-available template renderer on any failure.
**Verified:** 2026-06-04T09:50:25Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The renderer is swappable behind one interface; deterministic template is the always-available default; the system produces a correct, complete message with the LLM layer entirely disabled | VERIFIED | `RenderMessage` type at `src/render/cards.ts:205`; `RunNightlyDeps.renderMessage` seam at `src/index.ts:201-204`; default wiring at `src/index.ts:228-230` — `renderTemplate` when `USE_LLM_RENDERER` is unset; byte-identity test at `src/__tests__/runNightly.test.ts:231-270` passes |
| 2 | The optional LLM renderer writes prose and adjudicates fuzzy meeting reconciliation from pre-computed facts only; numbers in its output match the deterministic computed numbers exactly before anything is posted | VERIFIED | `buildFacts` sends only plain-English state words (no raw minutes/hours) at `src/llm/prompt.ts:113-146`; `assembleCardsV2` takes every figure from `report`/`ctx` at `src/llm/assemble.ts:116`; property tests across 4 hostile inputs in `src/llm/numberFidelity.test.ts` all pass (36 LLM tests green); meeting judgment applied via pure `applyVerdicts` at `src/llm/applyVerdicts.ts` before rendering |
| 3 | Any LLM failure (auth, timeout, schema, validation mismatch) falls back to the template renderer and posts, with a loud alert noting the LLM was skipped | VERIFIED | Try/catch in `renderLlmOrTemplate` at `src/llm/renderLlm.ts:160-175` catches every failure class; `withDegradedNote` appends visible muted note at `src/llm/renderLlm.ts:60-73`; table-driven fallback-integrity tests in `src/llm/renderLlm.test.ts:157-213` cover transport, max_tokens, refusal, non-JSON, and zod-invalid — all pass |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/llm/schema.ts` | Zod `LlmOutput` contract | VERIFIED | Exports `LlmOutput` schema + type; `headerSentence` bounded `.min(1).max(200)`, `meetingVerdicts` typed with enum + `.max(20)` |
| `src/llm/client.ts` | Anthropic singleton, injectable seam | VERIFIED | `LlmClient` interface for test injection; `defaultClient()` lazy singleton with `timeout: 20_000`, `maxRetries: 2` |
| `src/llm/prompt.ts` | Cached `SYSTEM_PROMPT` + `buildFacts` | VERIFIED | `SYSTEM_PROMPT` constant (number-free voice + rules + few-shots); `buildFacts` returns `Facts` with state words only — no raw minutes |
| `src/llm/assemble.ts` | Deterministic card assembly; numbers from report/ctx only | VERIFIED | `assembleCardsV2` clones `renderTemplate` output, swaps only the header prose; `adjudicateWorthALook` applies verdicts via `applyVerdicts` before rendering; `escapeHtml` on all model prose |
| `src/llm/renderLlm.ts` | Async renderer with total fallback | VERIFIED | `renderLlmOrTemplate` is the full pipeline: facts → create → parse → assemble, with try/catch → `withDegradedNote`; run-log emitted on both paths |
| `src/llm/applyVerdicts.ts` | Pure keep/soften/drop; unknown ids no-op; never grows | VERIFIED | Slice-2 implementation; verdict keyed by stable index; `drop` removes, `soften` rewords title (raw — escaping happens once in `rows.ts`), unknown id is no-op |
| `src/llm/numberFidelity.test.ts` | Property test: hostile LlmOutput cannot alter figures | VERIFIED | 4 hostile inputs tested; all sections except verdict-section header widget 0 are `deepStrictEqual` to `renderTemplate` baseline |
| `src/llm/renderLlm.test.ts` | Table-driven fallback-integrity across all failure classes | VERIFIED | 5 failure classes + success path + run-log assertions; 13 assertions all pass |
| `src/llm/applyVerdicts.test.ts` | Toggle-OFF identity, keep/soften/drop, invent/drop-unknown no-ops | VERIFIED | All cases covered; never-grows invariant asserted |
| `src/llm/flagFairness.test.ts` | Structural never-drop over the labelled genuine set | VERIFIED | Loads `labelled-events.json`; asserts `FDC IPO Launch Check-In` is present and survives no-verdict + keep paths |
| `src/config.ts` | `USE_LLM_MEETING_JUDGMENT` constant, default OFF | VERIFIED | Exported at `src/config.ts:274`; `process.env.USE_LLM_MEETING_JUDGMENT === "true"` with default `false` |
| `src/index.ts` | `renderMessage` in `RunNightlyDeps`; LLM-01 swap seam wired | VERIFIED | `RunNightlyDeps.renderMessage` at line 201; default resolves to `renderLlmOrTemplate` or `renderTemplate` based on `USE_LLM_RENDERER` at line 228-230 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` RunNightlyDeps | `src/llm/renderLlm.ts` renderLlmOrTemplate | `USE_LLM_RENDERER === "true"` env flag | WIRED | `src/index.ts:230` — conditional assignment on flag; import at line 47 |
| `src/index.ts` RunNightlyDeps | `src/render/renderMessage.ts` renderTemplate | default (flag off) | WIRED | `src/index.ts:230` — else branch; import at line 45 |
| `renderLlmOrTemplate` | `renderTemplate` + `withDegradedNote` | try/catch on any error | WIRED | `src/llm/renderLlm.ts:160-174` — catch block calls `withDegradedNote(report, ctx)` |
| `assembleCardsV2` | `applyVerdicts` | `USE_LLM_MEETING_JUDGMENT` toggle | WIRED | `src/llm/assemble.ts:113` — conditional `adjudicateWorthALook`; `applyVerdicts` imported at line 33 |
| `buildFacts` | `ctx.worthALook` flattened index | stable per-designer order | WIRED | `src/llm/prompt.ts:127-140`; `assembleCardsV2` uses identical order at `src/llm/assemble.ts:50-56` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `assembleCardsV2` | `headerSentence` | `out.headerSentence` from model, escaped via `escapeHtml` | Yes — inserted as prose only into header widget text | FLOWING (prose only — no number path) |
| `assembleCardsV2` | Designer rows, figures, week-bar | `report` / `ctx` passed from `runNightly` | Yes — deterministic domain values | FLOWING |
| `applyVerdicts` | `worthALook` titles | `verdict.line` (soften) or original `item` (keep/no verdict) | Yes — durations always from `item.durationMinutes`, never from model | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npm test` | 319 pass / 0 fail | PASS |
| TypeScript types | `npx tsc --noEmit` | clean (no output) | PASS |
| LLM-specific tests only | `node --import tsx --test "src/llm/*.test.ts"` | 36 pass / 0 fail | PASS |
| Fallback integrity — all 5 failure classes | table in renderLlm.test.ts | All produce complete card + degraded note + exactly one warn | PASS |
| Number fidelity — hostile LlmOutput | property tests in numberFidelity.test.ts | All non-header elements byte-equal to renderTemplate | PASS |
| Flag-fairness — genuine flags never vanish | flagFairness.test.ts | FDC IPO Launch Check-In survives no-verdict and keep paths | PASS |

---

### Probe Execution

No probe scripts defined for this phase. Step 7c: SKIPPED (no `scripts/tests/probe-*.sh` found for Phase 5).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LLM-01 | 05-01-PLAN.md | Renderer swappable behind one interface; deterministic template as always-available default | SATISFIED | `RenderMessage` type at `src/render/cards.ts:205`; `RunNightlyDeps.renderMessage` seam; default resolves to `renderTemplate` when flag off; byte-identity test passes. REQUIREMENTS.md still shows `[ ]` (unchecked) — this is a tracking artifact in the requirements file, not a code gap. The implementation satisfies the requirement. |
| LLM-02 | 05-02-PLAN.md | Optional LLM renderer; prose + meeting judgment from pre-computed facts; never arithmetic; falls back on failure | SATISFIED | Full pipeline implemented and tested: `buildFacts` number-free, `assembleCardsV2` deterministic, `applyVerdicts` pure, fallback-integrity 5-class test passes. REQUIREMENTS.md shows `[x]`. |

**Note on LLM-01 checkbox state:** REQUIREMENTS.md line 58 shows `- [ ] **LLM-01**` (unchecked) while the traceability table at line 127 shows `| LLM-01 | Phase 5 | Pending |`. This is a bookkeeping gap in the requirements file — the code fully delivers the requirement. The checkbox was not updated after Phase 5 completed. This is a documentation inconsistency, not a code failure.

---

### Anti-Patterns Found

No `TODO`, `FIXME`, or `XXX` markers found in any Phase 5 source files (`src/llm/*.ts`, `src/index.ts`, `src/config.ts`). No stub patterns (empty returns, placeholder text) found. No hardcoded empty data passed to rendering.

The `withDegradedNote` signature takes `(report, ctx)` — the summary claims it takes only `(ctx)`, a minor inaccuracy in the summary, but the actual code at `src/llm/renderLlm.ts:60` is correct and the tests verify the behavior.

---

### Human Verification Required

None. All critical behaviors are verified deterministically through code-level property tests and fallback-integrity tests. The one subjective dimension — on-brand prose voice — was exercised offline by the operator via `scripts/eval-llm-renderer.ts` with the real model (haiku-4-5, dev key), confirmed PASS in the 05-02 human-verify checkpoint. No new human verification items remain.

---

### Gaps Summary

No gaps. All three success criteria are fully implemented and verified:

1. The swappable-renderer + default-template path is wired through `RunNightlyDeps.renderMessage` and tested with a byte-identity guard.
2. The number-fidelity invariant is enforced by construction (`assembleCardsV2` clones template output, swaps only prose) and proven by property tests over hostile inputs.
3. The total-fallback contract is proven across all five failure classes in table-driven tests with stubbed clients.

LLM-01 remains unchecked in REQUIREMENTS.md — this is a tracking file inconsistency to fix manually, not a code gap.

---

_Verified: 2026-06-04T09:50:25Z_
_Verifier: Claude (gsd-verifier)_
