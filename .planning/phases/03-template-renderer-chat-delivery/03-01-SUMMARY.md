---
phase: 03-template-renderer-chat-delivery
plan: 01
subsystem: ui
tags: [google-chat, cards-v2, renderer, typescript, node-test, tdd]

# Dependency graph
requires:
  - phase: 01-core-math-clock
    provides: StudioReport + DesignerResult + StudioRollup display-only *Hours fields (capacity.ts, report.ts)
  - phase: 02-productive-pull-briefed-discovery
    provides: BriefFlag (reason no-task/not-briefed/blank-brief) for the 📄 brief lines
provides:
  - "CardsV2Payload + GoogleCard widget type contract (cards.ts) — the Cards v2 shape the whole render/delivery layer targets"
  - "RenderMessage interface (the LLM-01 swappable contract) — Phase 5's LLM renderer drops in behind the identical signature"
  - "RenderContext shape (designerNames, sourceErrors, briefFlags, tentativeNotes, holiday/closure, header)"
  - "renderTemplate: pure (report, ctx) -> CardsV2Payload for the busy/clean/overbooked card variant"
  - "config tokens: AVATAR_PNG_URL, PRODUCTIVE_DEEPLINK_TEMPLATE (D-24), BRAND_COLORS (D-11/D-23)"
  - "three committed expected-JSON fixtures pinning the locked mockup (two-open, clean, overbooked)"
affects: [03-02-variants-degraded-holiday-closure, 03-03-chat-delivery, 03-04-avatar-workflow, 05-llm-renderer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure render module + injected ctx + trust docblock (mirrors domain report.ts/capacity.ts)"
    - "Display-only reads: renderer reads *Hours only; the single *Min exception is weekBar dot-count, documented"
    - "Committed expected-JSON fixtures + assert.deepStrictEqual (NOT node:test snapshots) for trust-critical output"
    - "HTML-escape every dynamic string before insertion into card text (& first)"

key-files:
  created:
    - src/render/cards.ts
    - src/render/renderMessage.ts
    - src/render/verdict.ts
    - src/render/rows.ts
    - src/render/weekBar.ts
    - src/render/variants.ts
    - src/render/__tests__/renderMessage.test.ts
    - src/render/__tests__/fixtures/two-open.json
    - src/render/__tests__/fixtures/clean.json
    - src/render/__tests__/fixtures/overbooked.json
  modified:
    - src/config.ts

key-decisions:
  - "Tentative client + additive hours carried in RenderContext.tentativeNotes (not StudioReport) so src/domain stays untouched — mirrors the planned leaveNotes/holiday context approach"
  - "Brief line hours derived from the designer's bookedHours (BriefFlag carries no hours), keeping the renderer arithmetic-free"
  - "Week-bar caption hours: whole numbers render with no decimals (mockup '12h'), fractions show 1dp; row/status/booked hours always force 1dp ('3.0h open')"
  - "Empty-dot <font> wrapper omitted entirely when the week is fully booked (zero empty dots)"

patterns-established:
  - "RenderMessage = (report, ctx) => CardsV2Payload — the one swappable render contract"
  - "decoratedText rows build ALL text in the single text field with <br> separators (D-09), never topLabel/bottomLabel"
  - "Status conveyed by emoji + colour + words together (never colour alone) for a11y"

requirements-completed: [MSG-01, MSG-02, MSG-03, MSG-06, MSG-07]

# Metrics
duration: 18min
completed: 2026-06-04
---

# Phase 3 Plan 01: Template Renderer Core Summary

**Pure `renderTemplate(report, ctx)` producing the locked Google Chat Cards v2 card — header avatar, nameless verdict, per-designer rows with nested ⚠️ tentative / 📄 brief lines, Open-in-Productive deep-link, and a 10-dot week-bar footer — pinned to three committed JSON fixtures via deepStrictEqual.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-04
- **Completed:** 2026-06-04
- **Tasks:** 2 (Task 2 was TDD: RED → GREEN)
- **Files created:** 10
- **Files modified:** 1

## Accomplishments
- The Cards v2 type contract (`cards.ts`) and the `RenderMessage` interface — the LLM-01 swappable contract Phase 5 plugs into unchanged.
- `renderTemplate` assembling the contractual order: header → verdict → (rows, busy only) → button → week bar.
- Nameless scenario-adaptive verdict (D-12/D-13); per-designer rows with locked emoji/colour, tentative "(on top)" and brief lines, all HTML-escaped (T-03-01).
- All three locked fixtures (two-open, clean, overbooked) pass `assert.deepStrictEqual`; full suite green (132 tests).

## Task Commits

1. **Task 1: Render contract — cards.ts + RenderContext/RenderMessage + config tokens** — `08f5cf8` (feat)
2. **Task 2 (RED): failing fixtures + test** — `aa925c7` (test)
3. **Task 2 (GREEN): pure render primitives + renderTemplate** — `2420741` (feat)

_Task 2 followed the TDD RED→GREEN cycle; no REFACTOR commit was needed (implementation was clean on first GREEN)._

## Files Created/Modified
- `src/render/cards.ts` — CardsV2Payload + widget union + RenderContext + TentativeNote + RenderMessage type
- `src/render/renderMessage.ts` — `renderTemplate` composition root (the "card" variant)
- `src/render/verdict.ts` — nameless verdict cascade + locked clean status line
- `src/render/rows.ts` — one DesignerResult → one decoratedText; HTML-escape; emoji/colour/tentative/brief
- `src/render/weekBar.ts` — 10-dot fuel-gauge footer + caption (the one documented *Min display-only read)
- `src/render/variants.ts` — ordered variant cascade + clean/busy severity
- `src/render/__tests__/renderMessage.test.ts` — per-scenario deepStrictEqual + HTML-escape behavior
- `src/render/__tests__/fixtures/{two-open,clean,overbooked}.json` — locked expected card JSON
- `src/config.ts` — AVATAR_PNG_URL, PRODUCTIVE_DEEPLINK_TEMPLATE, BRAND_COLORS

## Decisions Made
- **Tentative detail in RenderContext, not the domain report.** `BriefFlag` and `StudioReport` carry no per-designer tentative client/hours, so the ⚠️ "(on top)" line reads from a new `RenderContext.tentativeNotes` map (pre-rounded `tentativeHours` + escaped `client`). Keeps `src/domain` untouched — the same approach the research planned for leaveNotes/holiday.
- **Brief-line hours = designer's `bookedHours`.** `BriefFlag` has no hours field; the brief line is nested under its designer, so the booked-hours figure is reused — no new arithmetic.
- **Two hour formatters.** Row/status/booked/tentative hours force one decimal ("3.0h open", matching the mockup); the week-bar caption trims whole numbers ("12h booked"), shows 1dp only for fractions.
- **Empty-dot wrapper omitted when fully booked** — a 10-filled bar emits no `<font color="#c9ccd1">` run (verified by the overbooked fixture).

## Deviations from Plan

None - plan executed exactly as written. (One plan-grep nuance handled: the Task 2 trust-grep's comment-exclusion filter does not apply to `grep -rn` prefixed output, so an explanatory `tentativeMin` mention in a `cards.ts` docblock would have surfaced as a false positive — the comment was reworded to reference "any exact-minute field" instead. No code behaviour changed; the intent of the gate (no production-code *Min reads outside weekBar) is fully satisfied.)

## Issues Encountered
- `verbatimModuleSyntax: true` in tsconfig requires `import type` for all type-only imports — followed throughout; tsc clean.

## Known Stubs

| Stub | File | Reason / Resolution |
|------|------|--------------------|
| `AVATAR_PNG_URL` placeholder raw URL | `src/config.ts` | Intentional, plan-tracked. The Task 1 action explicitly specifies a documented placeholder public raw URL; the real hosted PNG is exported, committed, and its public reachability confirmed in **plan 03-04**. The card still posts without a reachable avatar (degraded brand fidelity, not a failure). |

## User Setup Required
None - no external service configuration required for this plan. (The Chat webhook secret + hosted avatar are set up in later plans 03-03/03-04.)

## Next Phase Readiness
- The `RenderMessage` contract and `RenderContext` shape are stable and exported — plan 03-02 implements the holiday/closure/degraded/per-miss variants behind `selectVariant` (already stubbed to `throw "handled in plan 03-02"`), and plan 05 plugs in the LLM renderer behind the same signature.
- `renderTemplate` is pure and network-free; plan 03-03 (`postToChat`) and the `src/index.ts` composition root consume its output.
- Trust gate holds: the renderer reads only `*Hours` display fields (the single documented `rollup.*Min` exception is the weekBar dot-count).

## Self-Check: PASSED
- All 10 created files + 1 modified file verified present on disk.
- All three task commits (`08f5cf8`, `aa925c7`, `2420741`) verified in git log.
- `npx tsc --noEmit` clean; `npm test` green (132 tests, 0 fail).

---
*Phase: 03-template-renderer-chat-delivery*
*Completed: 2026-06-04*
