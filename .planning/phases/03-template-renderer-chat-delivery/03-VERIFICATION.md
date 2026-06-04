---
phase: 03-template-renderer-chat-delivery
verified: 2026-06-04T12:00:00+10:00
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 3: Template Renderer & Chat Delivery — Verification Report

**Phase Goal:** A complete, shippable v1 — the deterministic studio report rendered as an on-brand Google Chat Cards v2 message, posted automatically on a weekday ~4:30pm schedule, always posting (including clean-night and degraded variants) with zero LLM and zero Calendar dependency.
**Verified:** 2026-06-04
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Test Suite & Type Check

Both were run fresh during verification:

- `npm test` → **155/155 pass, 0 fail, 47 suites** (guard tests + render tests + all prior Phase 1/2 tests)
- `npx tsc --noEmit` → **exit 0, clean** (no output)

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| SC-1 | Weekday 4:30pm Sydney cron, never weekends, manual dispatch | VERIFIED | `nightly.yml`: `cron: "30 16 * * 1-5"` + `timezone: "Australia/Sydney"` + `workflow_dispatch: {}`; `shouldSkipForWeekend` in `src/index.ts:55`; 5 guard tests green |
| SC-2 | Message structure: verdict → week rollup → designer rows → flags; names designers not PMs; tentative distinguished; deep-link button | VERIFIED | `renderMessage.ts:120-160` sections assembled in contractual order; `verdict.ts:27` nameless verdict; `rows.ts:134-142` ⚠️ tentative line; `renderMessage.ts:33-34` deep-link substitution; `two-open.json` fixture pins the full structure |
| SC-3 | Always posts — short on clean nights, fuller on busy nights | VERIFIED | `variants.ts:28` degraded variant returns complete payload; `variants.ts:39-46` `isBusy` gates rows section (MSG-05); clean fixture (`fixtures/clean.json`) has no rows section; `renderTemplate` never throws |
| SC-4 | Source unreachable → posts degraded card naming the source; failed run raises alert | VERIFIED | `variants.ts:28` `sourceErrors.length > 0` → degraded path; `renderMessage.ts:85` source name data-driven from `ctx.sourceErrors`; `index.ts:165-168` `!posted.ok` → `process.exit(1)` (REL-02); `degraded.json` fixture pins exact card text |

**Score:** 4/4 roadmap success criteria verified

---

## Per-Requirement Verdicts

### SCHED-01 — Weekday 4:30pm Sydney, never weekends

**VERIFIED.** `nightly.yml:8-9`: `cron: "30 16 * * 1-5"` with `timezone: "Australia/Sydney"` (native DST-aware field). Defence-in-depth: `src/index.ts:55-57` pure `shouldSkipForWeekend(now): boolean` (`now.weekday >= 6`) gates on the luxon weekday, not the minute, so a delayed scheduled run still fires. `src/__tests__/guard.test.ts` pins Saturday → skip, Sunday → skip, Wednesday → run, Friday → run (5 tests, all green).

### SCHED-02 — Manual trigger on demand

**VERIFIED.** `nightly.yml:12`: `workflow_dispatch: {}`. The same entrypoint (`node --import tsx src/index.ts`) runs on both schedule and manual dispatch. Confirmed in the live smoke post (commit `e29ed37` marks the checkpoint approved).

### MSG-01 — On-brand Cards v2 message (studio logo, accent colour, sections)

**VERIFIED.** `renderMessage.ts:61-68` card header: `title: "Solvd Studio Check-in"`, `imageUrl: AVATAR_PNG_URL`, `imageType: "CIRCLE"`. `config.ts:69-70` AVATAR_PNG_URL points to the committed `assets/avatar-asterisk.png` (256×256 PNG confirmed by `file` command). `config.ts:93-99` five-colour BRAND_COLORS palette matches UI-SPEC exactly (`#d93025`, `#188038`, `#b06000`, `#5f6368`, `#c9ccd1`). All card JSON targets `cardsV2` (not deprecated cards v1). `two-open.json` fixture pins the full card shape against `assert.deepStrictEqual`.

### MSG-02 — Verdict → week rollup → per-designer rows → grouped flags (in order)

**VERIFIED.** `renderMessage.ts:121-160` assembles sections in contractual order:
1. Verdict section (`textParagraph` with `<b>` verdict)
2. Per-designer rows section (busy only, each `decoratedText` with `<br>`-separated flag lines)
3. Button section (`buttonList`)
4. Week-bar footer section (with `header: "Remaining studio time this week"`)

Sections 3 and 4 use the `Section.header` field correctly; `two-open.json` fixture pins the exact output.

### MSG-03 — Names the designer, never the PM

**VERIFIED.** `verdict.ts:27-68` verdict never contains a name (reads only counts: `underbooked`, `overbooked`, `briefCount`). `rows.ts:110` names come from `ctx.designerNames[d.designerId]` (config, not API). `config.ts:36-40` `DESIGNER_NAMES` keyed by person ID. No PM reference exists anywhere in the render layer.

### MSG-04 — Always posts, including clean-night positive note

**VERIFIED.** `renderTemplate` (all paths) returns a complete `CardsV2Payload` and never throws. The degraded, holiday, and closure variants short-circuit before any figures, each producing a postable card. The clean-night path posts the "All sorted for tomorrow." verdict + `CLEAN_STATUS_LINE` ("Three designers fully booked. Nothing to action.") via `renderMessage.ts:127-130`. `clean.json` fixture pins this. `renderDegraded` never throws (`renderMessage.ts:84-93`).

### MSG-05 — Length scales with severity

**VERIFIED.** `variants.ts:39-46` `isBusy`: true when any designer is underbooked/overbooked OR brief flags exist OR missing designers. `renderMessage.ts:137-151` rows section only rendered when `isBusy` is true. Clean night → header + verdict + status line + button + week bar (no rows). Busy night → full rows. Pinned by `clean.json` (no rows section) vs `two-open.json` (rows section present).

### MSG-06 — Deep-links to relevant Productive bookings

**VERIFIED.** `config.ts:79-80` `PRODUCTIVE_DEEPLINK_TEMPLATE` with `{DATE}` and the design-team filter (`NzQ5NTY2` = base64 of `749566`, verified live). `renderMessage.ts:33-34` substitutes `report.targetDay` for `{DATE}`. `renderMessage.ts:44` button `openLink.url` uses `deepLink(ctx.header.targetDate)`. `two-open.json:51` pins the exact URL for the 2026-06-04 target day.

### MSG-07 — Tentative bookings visually distinguished

**VERIFIED.** `rows.ts:134-142`: ⚠️ tentative line rendered inside `decoratedText.text` at body size (in `text` field, never `topLabel`/`bottomLabel`). The line format is `⚠️ {X.X}h tentative (on top)[ · {client}]` — the `(on top)` suffix is mandatory (D-15) and present in code. `two-open.json:22` pins it. Live fix (commit `2517dae`): tentative hours now surfaced from `report.designers[].tentativeMin` in `index.ts:94-101` so a tentative-only designer is not misread as fully open. Regression test confirms hours render without client when client detail is absent (`renderMessage.test.ts:130-157`).

**Deferred (not a defect):** Per-designer tentative CLIENT NAME is not surfaced by the current Productive pull. Only tentative hours show; the `client` field in `TentativeNote` is optional. This is consistent with 03-04 SUMMARY.md "Known Flags" and rows.ts:135 comment. The phase plans explicitly deferred per-designer client detail. The ⚠️ line still appears and the hours are correct.

### REL-01 — Source unreachable → degraded card still posts, names what it couldn't reach

**VERIFIED.** `gather.ts` accumulates source failures into `sourceErrors` (never throws). `variants.ts:28`: `if (ctx.sourceErrors.length > 0) return "degraded"`. `renderMessage.ts:84-93` `renderDegraded`: uses `escapeHtml(ctx.sourceErrors.join(" and "))` as the source name — data-driven, not hardcoded. Returns a complete `CardsV2Payload`. `degraded.json` fixture pins exact copy "🤖 Couldn't reach Productive tonight." and the follow-up body. Post path continues after degraded render — there is no short-circuit before `postToChat`. Live-verified: invalid `PRODUCTIVE_AUTH_TOKEN` produced the degraded card in the smoke post.

### REL-02 — Failed run surfaces alert (never fails silently)

**VERIFIED.** `index.ts:165-168`: when `!posted.ok`, logs `nightly post failed: ${posted.error}` (redacted error, never the URL) and `return 1`. `index.ts:187`: `if (exitCode !== 0) process.exit(1)`. A non-zero exit causes GitHub Actions to mark the run failed, triggering GitHub's built-in failed-run email to repo owners (D-25). The two-path rule is visually confirmed: source failure takes the degrade-and-post path (returns 0); post failure takes the exit-1 path. They share no catch block. `postToChat.ts` returns `{ ok: false }` on any failure rather than throwing, making the exit-1 path grep-verifiable.

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/render/cards.ts` | VERIFIED | `CardsV2Payload`, `RenderMessage` interface, `RenderContext` shape — exports confirmed |
| `src/render/renderMessage.ts` | VERIFIED | `renderTemplate: RenderMessage` — 4-variant cascade, pure, never throws |
| `src/render/verdict.ts` | VERIFIED | `buildVerdict` nameless; `CLEAN_STATUS_LINE` verbatim lock |
| `src/render/rows.ts` | VERIFIED | `buildRow` — decoratedText with `<br>` separators; status emoji set; D-09 hard rule honoured (no topLabel/bottomLabel) |
| `src/render/weekBar.ts` | VERIFIED | `buildWeekBar` — 10-dot proportional gauge; caption from `*Hours` fields; dot count from `*Min` (documented exception) |
| `src/render/variants.ts` | VERIFIED | `selectVariant` cascade and `isBusy` |
| `src/chat/postToChat.ts` | VERIFIED | Non-throwing `Result<void>`; 32 KB guard; URL redaction in both error paths |
| `src/index.ts` | VERIFIED | Composition root; single `DateTime.now()` call; two-path reliability; `shouldSkipForWeekend` pure predicate |
| `src/__tests__/guard.test.ts` | VERIFIED | 5 tests, all green |
| `.github/workflows/nightly.yml` | VERIFIED | `cron: "30 16 * * 1-5"` + `timezone: "Australia/Sydney"` + `workflow_dispatch` + `node --import tsx src/index.ts` |
| `assets/avatar-asterisk.png` | VERIFIED | 256×256 PNG (confirmed by `file` command); white asterisk on black `#0A0A0A` circle; `imageType: CIRCLE` in cardHeader |
| `src/render/__tests__/fixtures/` (9 fixtures) | VERIFIED | two-open, clean, overbooked, degraded, couldnt-read-one, holiday, closure, on-leave, half-day-leave — each pinned via `assert.deepStrictEqual` |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `index.ts` | `gather` → `computeStudioReport` → `renderTemplate` → `postToChat` | Direct imports + sequential calls at lines 138, 150, 155, 160 | WIRED |
| `nightly.yml` | `src/index.ts` | `node --import tsx src/index.ts` at line 23 | WIRED |
| `index.ts` | `process.env.GCHAT_WEBHOOK_URL` | Read at line 160, passed into `postToChat`, never logged | WIRED |
| `gather.ts` `sourceErrors` | `renderDegraded` | `ctx.sourceErrors` → `selectVariant` → `renderDegraded` path | WIRED |
| `postToChat` `{ ok: false }` | `process.exit(1)` | `index.ts:165-168` → `return 1` → `index.ts:187` `process.exit(1)` | WIRED |
| `nightly.yml` secrets | `src/index.ts` env vars | `env: GCHAT_WEBHOOK_URL/PRODUCTIVE_AUTH_TOKEN/PRODUCTIVE_ORG_ID` from `secrets.*` | WIRED |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| `renderMessage.ts` | `report.designers[].bookedHours` | `computeStudioReport` (Phase 1, deterministic from Productive bookings) | Yes — live Productive pull confirmed via smoke post | FLOWING |
| `renderMessage.ts` | `report.rollup.totalMin / openMin` | `computeStudioReport` rollup (deterministic) | Yes | FLOWING |
| `index.ts` | `g.tentativeMin` → `tentativeNotes` | `gather` → `computeStudioReport.designers[].tentativeMin` | Yes — post-fix `2517dae` surfaces from report | FLOWING |
| `renderDegraded` | `ctx.sourceErrors` | `gather.sourceErrors` accumulated from failed API calls | Yes — live-tested with invalid token | FLOWING |

---

## Trust Constraint: Deterministic Arithmetic

All hour/capacity arithmetic is confirmed deterministic:

- `rows.ts:10-12`: docblock explicitly states "reads only the display-only `*Hours` fields … NEVER reads `*Min` and never recomputes a figure"
- `weekBar.ts:7-9`: the single documented exception — dot-count uses `*Min` ratio for display-only proportional gauge, confirmed as pure display formatting
- `verdict.ts` counts `underbooked`/`overbooked` from `d.status` (pre-computed in Phase 1 domain), not from re-calculating hours
- `renderMessage.ts` header: "It does NO I/O, reads ONLY the display-only `*Hours` fields … NEVER recomputes a number"
- `index.ts`: `minutesToHours` + `roundToQuarterHour` used only for the tentative display hours (presentation-only rounding from `round.ts`, not a trust-critical figure)

---

## Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| `shouldSkipForWeekend` returns true for Saturday | `guard.test.ts` test 1 — green | PASS |
| `shouldSkipForWeekend` returns false for Wednesday | `guard.test.ts` test 3 — green | PASS |
| Degraded variant renders complete postable card | `renderMessage.test.ts` degraded test + `degraded.json` fixture — green | PASS |
| Two-open card matches locked mockup JSON | `renderMessage.test.ts` + `two-open.json` `assert.deepStrictEqual` — green | PASS |
| Clean card has no rows section | `renderMessage.test.ts` + `clean.json` `assert.deepStrictEqual` — green | PASS |
| Live card posts to test Chat space | Smoke post committed as approved (commit `e29ed37`, user-approved checkpoint) | PASS |
| `npx tsc --noEmit` | exit 0 | PASS |
| Full test suite | 155/155 pass | PASS |

---

## Anti-Patterns

No debt markers (`TBD`, `FIXME`, `XXX`) found in any phase-modified file. No unreferenced `TODO`s in runtime code paths. No stub patterns (empty returns, placeholders) in the delivered files. The SUMMARY.md and code both document the tentative client name as an explicit, planned deferral — not a hidden stub.

---

## Known Deferral (Not a Gap)

**Per-designer tentative CLIENT NAME** — `rows.ts:135` and `index.ts:75`: the client/job name on the ⚠️ tentative line is not surfaced because the current Productive pull does not return per-designer tentative client detail. Only the tentative HOURS are shown. This is explicitly documented in the code and SUMMARYs as deferred, not a defect. The ⚠️ hours line still renders correctly (live-fixed in `2517dae`). The `client` field on `TentativeNote` is typed optional exactly to support this case.

No later roadmap phase explicitly claims to add this detail; it is implementation-internal to Phase 4 or a follow-on task within the existing codebase — not a gap against Phase 3's requirements.

---

## Human Verification Required

None. The one human-verify checkpoint (Task 3 of plan 03-04 — live smoke post) was executed by the user and approved. Evidence: commit `e29ed37` ("docs(phase-03): mark 03-04 complete after approved smoke-post checkpoint"), authored by Liam Mills on 2026-06-04, marks the ROADMAP entry complete.

---

## Overall Verdict

**GOAL ACHIEVED.**

All 11 requirements this phase owns (SCHED-01, SCHED-02, MSG-01 through MSG-07, REL-01, REL-02) have codebase evidence at the file:line level. The test suite is 155/155 green. The type check is clean. The live smoke post was approved by the user. Three live bugs found and fixed during the smoke post have regression tests and are green. The deferred tentative client name is consistent with plan decisions and does not block the phase goal.

---

_Verified: 2026-06-04_
_Verifier: Claude (gsd-verifier)_
