---
phase: quick-260604-kig
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/index.ts
  - src/calendar/__tests__/reconcile-render.e2e.test.ts
  - src/__tests__/runNightly.test.ts
autonomous: true
requirements: [MEET-04, REL-01, REL-02]
must_haves:
  truths:
    - "An unaccounted client meeting drives reconcileMeetings → renderTemplate and surfaces a 📅 deep-linked worth-a-look sub-line under the right designer in the Cards v2 payload"
    - "A same-day same-client COVERED meeting produces NO 📅 line"
    - "runNightly accepts an optional deps object and the no-deps entrypoint path is unchanged"
    - "runNightly happy path: all sources succeed, an unaccounted meeting reaches the posted payload as a 📅 line, returns 0"
    - "runNightly degrade path: a calendar sourceError still posts the 🤖 degraded card and returns 0 (REL-01)"
    - "runNightly post-failure path: postToChat { ok:false } returns 1 (REL-02)"
    - "The integration test touches no network, no Google, no Productive, no process.env, and injects a fixed weekday now"
    - "npm test is fully green (was 215 passing)"
  artifacts:
    - path: "src/calendar/__tests__/reconcile-render.e2e.test.ts"
      provides: "End-to-end reconcile→render test (worth-a-look line present + covered line absent)"
    - path: "src/__tests__/runNightly.test.ts"
      provides: "runNightly orchestration integration test (happy / degrade / post-fail)"
    - path: "src/index.ts"
      provides: "runNightly(now, deps?) DI seam — sole production change"
      contains: "runNightly"
  key_links:
    - from: "src/__tests__/runNightly.test.ts"
      to: "runNightly"
      via: "injected stubbed deps { gather, gatherCalendar, postToChat, webhookUrl }"
      pattern: "runNightly\\("
    - from: "src/calendar/__tests__/reconcile-render.e2e.test.ts"
      to: "reconcileMeetings + renderTemplate"
      via: "golden labelled-events.json fixtures + real CLIENT_ALIAS_MAP"
      pattern: "reconcileMeetings|renderTemplate"
---

<objective>
Add the two tests Liam selected after the Phase 04 verification, with one small, surgical
dependency-injection seam in `src/index.ts` to make `runNightly` testable.

Purpose: close the two coverage gaps verification flagged — (1) no test drives a real
unaccounted meeting all the way through reconcile→render to prove the 📅 worth-a-look line
appears (and that a covered meeting stays silent), and (2) no test exercises `runNightly`'s
three orchestration paths (happy / degrade-and-still-post / post-failure), the REL-01/REL-02
two-path reliability rule that the whole nightly run depends on.

Output:
- `src/calendar/__tests__/reconcile-render.e2e.test.ts` (new test, no production change)
- `src/index.ts` (DI seam — the ONLY production file touched)
- `src/__tests__/runNightly.test.ts` (new integration test)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

# Production files under test (read before touching)
@src/index.ts
@src/calendar/reconcile.ts
@src/calendar/gather.ts
@src/render/cards.ts

# Test conventions to MIRROR exactly (node:test + node:assert/strict, offline, golden fixtures)
@src/calendar/__tests__/reconcile.test.ts
@src/render/__tests__/renderMessage.test.ts

# Golden fixtures + config the e2e test reads
@src/calendar/__fixtures__/labelled-events.json
@src/config.ts

<interfaces>
<!-- Contracts extracted from the codebase. Executor uses these directly — no exploration needed. -->

src/calendar/reconcile.ts:
  export interface WorthALookItem { title: string; start: string; link: string }
  export function matchTitleToClient(title: string, aliasMap: readonly ClientAlias[]): ClientAlias | null
  export function reconcileMeetings(
    eventsByDesigner: Record<DesignerId, FilteredEvent[]>,
    bookedClientsByDesignerDay: Record<DesignerId, Set<string>>,
    aliasMap: readonly ClientAlias[],
    _ignoreList: readonly string[],
  ): Record<DesignerId, WorthALookItem[]>

src/calendar/gather.ts:
  export interface FilteredEvent { id; summary; htmlLink; startLabel; startDateTime?; startDate?; eventType?; responseStatusSelf?; attendeeCount }
  export interface CalendarResult { eventsByDesigner: Record<DesignerId, FilteredEvent[]>; sourceErrors: string[] }
  export async function gatherCalendar(deps: { now: DateTime; fetchEvents?: ... }): Promise<CalendarResult>

src/render/renderMessage.ts:
  export const renderTemplate: RenderMessage   // (report: StudioReport, ctx: RenderContext) => CardsV2Payload

src/render/cards.ts:
  ctx.worthALook?: Record<string, Array<{ title; start; link }>>  // → 📅 sub-line, deep-linked, HTML-escaped
  // Rows live in sections[1]; divider-separated: widget[0]=designer0, [1]=divider, [2]=designer1, [3]=divider, [4]=designer2

src/productive/gather.ts:
  export interface GatherResult { bookings; absences; briefFlags; holidays; assessedDesigners; sourceErrors; bookedClientsByDesignerDay: Record<DesignerId, Set<string>> }
  export async function gather(deps: { now: DateTime; ... }): Promise<GatherResult>

src/chat/postToChat.ts:
  export async function postToChat(payload, webhookUrl, fetchImpl?): Promise<Result<void>>
  // Result<void> = { ok: true; value } | { ok: false; error }

src/productive/client.ts:
  export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

src/index.ts (CURRENT — what changes):
  export async function runNightly(now: DateTime): Promise<number>
  // calls gather({now}), gatherCalendar({now}), postToChat(payload, process.env.GCHAT_WEBHOOK_URL ?? "")
  // import.meta.main entrypoint calls runNightly(DateTime.now().setZone(STUDIO_ZONE))

Golden fixture labels in labelled-events.json:
  "counts/FDC · covered"        → summary "Quick FDC catch up"      (covered case → NO 📅 line)
  "counts/FDC · worth-a-look"   → summary "FDC IPO Launch Check-In" (worth-a-look → 📅 line)
  FDC companyId = "1333899"; designers: ANISHA 686712, ELLA 686716, LIAM 686717
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: End-to-end reconcile→render worth-a-look test (no production change)</name>
  <files>src/calendar/__tests__/reconcile-render.e2e.test.ts</files>
  <behavior>
    - Drive the WORTH-A-LOOK golden event ("FDC IPO Launch Check-In") through reconcileMeetings
      (real CLIENT_ALIAS_MAP + MEETING_IGNORE_LIST, FDC NOT in the designer's booked set) → feed
      the resulting worthALook map into renderTemplate via RenderContext → assert the rendered
      Cards v2 payload contains a 📅 sub-line for that designer with the deep-linked title
      (an <a href="…">FDC IPO Launch Check-In</a>) and the soft "worth a look" voice; assert it
      never says "conflict".
    - Drive the COVERED golden event ("Quick FDC catch up") through reconcileMeetings with FDC IN
      the designer's booked set → worthALook for that designer is empty → assert the rendered
      payload has NO 📅 line for that designer.
  </behavior>
  <action>
    Create a NEW test file mirroring the conventions in reconcile.test.ts AND renderMessage.test.ts
    (describe/it from node:test, assert from node:assert/strict, fixtures loaded via
    fileURLToPath(new URL("../__fixtures__/labelled-events.json", import.meta.url))). Reuse the
    SAME toFilteredEvent/loadFixtures helper shape as reconcile.test.ts to turn the two golden raw
    fixtures into FilteredEvent. Build a minimal busy StudioReport with the three designers (copy
    the designer()/ctx() helper pattern from renderMessage.test.ts so the rows section renders).

    WORTH case: pick the designer the WORTH event belongs to (use LIAM 686717, matching the
    existing worth-a-look render fixture). Call reconcileMeetings({ [LIAM]: [WORTH] },
    { [LIAM]: new Set<string>() }, CLIENT_ALIAS_MAP, MEETING_IGNORE_LIST) — assert it returns one
    item first (RED-style guard). Map that WorthALookItem[] into ctx.worthALook = { [LIAM]: [...] }
    and render. Locate Liam's row in sections[1] (divider-separated widgets — see the interfaces
    note) and assert decoratedText.text matches /📅/, matches the deep-linked title via
    /<a href="[^"]*">FDC IPO Launch Check-In<\/a>/, matches /worth a look/, and that the whole
    JSON.stringify(out) does NOT match /conflict/i.

    COVERED case: reconcileMeetings({ [LIAM]: [COVERED] }, { [LIAM]: new Set(["1333899"]) },
    CLIENT_ALIAS_MAP, MEETING_IGNORE_LIST) returns []. Render with ctx.worthALook = the (empty)
    reconcile output and assert Liam's row decoratedText.text does NOT match /📅/.

    Do NOT add a new fixture — the two golden cases already exist in labelled-events.json. Do NOT
    modify any production file. Do NOT do any hour arithmetic in the test report builder beyond the
    literal display fields the existing renderMessage.test.ts helpers already set (copy them as-is).
  </action>
  <verify>
    <automated>cd "/Users/liammills/Documents/CLAUDE/evening design team check" && node --import tsx --test "src/calendar/__tests__/reconcile-render.e2e.test.ts"</automated>
  </verify>
  <done>The e2e test file passes: WORTH golden event renders a 📅 deep-linked "worth a look" line under the right designer; COVERED golden event renders no 📅 line; no "conflict" wording; no production file changed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: runNightly DI seam in src/index.ts + orchestration integration test</name>
  <files>src/index.ts, src/__tests__/runNightly.test.ts</files>
  <behavior>
    - runNightly(now, deps?) accepts an OPTIONAL deps object { gather, gatherCalendar, postToChat,
      webhookUrl }, each defaulting to the current real implementation / process.env.GCHAT_WEBHOOK_URL.
      The no-deps call runNightly(now) behaves exactly as today; the import.meta.main entrypoint is
      unchanged.
    - Happy path: stubbed gather + gatherCalendar succeed, an unaccounted meeting surfaces; the
      payload captured by the stubbed postToChat contains a 📅 line; runNightly returns 0.
    - Degrade path: stubbed gatherCalendar returns a non-empty sourceErrors (calendar outage); the
      stubbed postToChat is still called (the 🤖 degraded card posts) and runNightly returns 0 (REL-01).
    - Post-failure path: stubbed postToChat returns { ok:false }; runNightly returns 1 (REL-02).
  </behavior>
  <action>
    PRODUCTION CHANGE (the only one in this plan) — src/index.ts:
    Add an optional second parameter to runNightly: a RunNightlyDeps interface with
    { gather, gatherCalendar, postToChat, webhookUrl } where the types match the real exports
    (gather: typeof gather, gatherCalendar: typeof gatherCalendar, postToChat: typeof postToChat,
    webhookUrl: string). Default it at the top of the function body, e.g. resolve each field from
    the deps argument falling back to the imported real function and to
    process.env.GCHAT_WEBHOOK_URL ?? "" for the webhook. Replace the three direct call sites:
    gather({ now }) → resolvedDeps.gather({ now }); gatherCalendar({ now }) →
    resolvedDeps.gatherCalendar({ now }); postToChat(payload, process.env.GCHAT_WEBHOOK_URL ?? "")
    → resolvedDeps.postToChat(payload, resolvedDeps.webhookUrl).

    HARD CONSTRAINTS on the seam:
    - The DI seam MUST NOT introduce a second system-clock read. `now` stays the single injected
      clock; deps carries NO clock. (CLAUDE.md trust boundary: runNightly is the one clock-reading
      boundary; the import.meta.main entrypoint keeps the sole DateTime.now() call.)
    - No hour math added anywhere. The seam only swaps function references.
    - import.meta.main MUST stay calling runNightly(now) with no deps — do not pass deps there.
    - Touch ONLY runNightly's signature + its three call sites + the new RunNightlyDeps type. Do NOT
      refactor, rename, or reformat buildRenderContext, subtitleFor, shouldSkipForWeekend, the
      docblocks, or imports beyond adding the typeof-based deps type. Keep the existing comments.

    TEST — src/__tests__/runNightly.test.ts (mirror guard.test.ts + reconcile.test.ts conventions):
    import { runNightly } from "../index.ts"; import { DateTime } from "luxon". Build a fixed
    WEEKDAY now (e.g. DateTime.fromISO("2026-06-03T16:30", { zone: STUDIO_ZONE }) — a Wednesday;
    assert now.weekday <= 5 in a guard so the test fails loudly if the date ever drifts to a weekend).
    Provide fully stubbed deps so NO real gather/gatherCalendar/postToChat/network/env is touched:
      - stub gather → returns a GatherResult-shaped object: minimal bookings/absences/briefFlags=[],
        a holidays set (use buildHolidaySet or an empty Set is fine since nextWorkingDay handling is
        inside gather which is stubbed — the report still needs g.holidays; pass new Set<string>()),
        assessedDesigners = the three ids, sourceErrors = [], bookedClientsByDesignerDay so the
        unaccounted-meeting designer's set does NOT contain the meeting's companyId.
      - stub gatherCalendar → returns { eventsByDesigner: { [designer]: [the unaccounted counting
        meeting as a FilteredEvent] }, sourceErrors: [] }. Use a counting meeting whose title the
        real CLIENT_ALIAS_MAP resolves (e.g. "FDC IPO Launch Check-In") so reconcileMeetings (real,
        not stubbed — it runs inside runNightly) surfaces it.
      - stub postToChat → a capturing stub: record the payload arg, return { ok: true, value:
        undefined } for happy/degrade and { ok: false, error: "stub fail" } for the post-failure case.
      - webhookUrl: "https://stub.invalid/webhook" (never used by the stub; proves env is not read).

    Three it() cases:
      (a) happy — assert returned code === 0 AND the captured payload JSON.stringify includes "📅"
          (the unaccounted meeting surfaced through the full real reconcile→render).
      (b) degrade — same stubs but gatherCalendar.sourceErrors = ["Couldn't reach Calendar for X"];
          assert postToChat WAS called (capture flag true) and code === 0 (REL-01, never skip a night).
          The degraded 🤖 card flows through the existing concatenated sourceErrors path.
      (c) post-fail — postToChat stub returns { ok:false, error:"stub fail" }; assert code === 1 (REL-02).

    The test must reference the real reconcileMeetings/renderTemplate behaviour implicitly (they run
    unstubbed inside runNightly) — do NOT stub them. Do NOT read process.env. Do NOT hit the network.
  </action>
  <verify>
    <automated>cd "/Users/liammills/Documents/CLAUDE/evening design team check" && node --import tsx --test "src/__tests__/runNightly.test.ts" && npm test</automated>
  </verify>
  <done>src/index.ts exposes runNightly(now, deps?) with real-implementation defaults and an unchanged import.meta.main; the integration test passes all three paths (happy returns 0 with a 📅 in the posted payload, degrade still posts and returns 0, post-fail returns 1); no second clock read introduced; full `npm test` is green (≥ 217 tests, no regressions from 215).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| runNightly → external sources (Productive, Google, Chat) | The DI seam swaps these for stubs in tests; in production they remain the real implementations. The seam must not become a new injection point for a system clock. |
| LLM/code split (CLAUDE.md) | All hour/capacity arithmetic stays in deterministic code. No task adds arithmetic; tests assert display strings, not computed numbers. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-Q-01 | Tampering | DI seam in runNightly | mitigate | deps carries no clock; `now` stays the single injected clock — entrypoint keeps the sole DateTime.now(). Verified by the test injecting a fixed weekday now. |
| T-Q-02 | Information disclosure | webhook URL in test | accept | Test uses a fake "https://stub.invalid/webhook"; the stub never sends it and never logs it. No real secret in test code. |
| T-Q-03 | Repudiation | REL-02 exit code | mitigate | Post-failure path asserts return 1 so GitHub's failed-run email fires — preserved by the test. |
</threat_model>

<verification>
- `node --import tsx --test "src/calendar/__tests__/reconcile-render.e2e.test.ts"` passes.
- `node --import tsx --test "src/__tests__/runNightly.test.ts"` passes (3 cases).
- `npm test` is fully green with no regressions (was 215; now ≥ 217).
- `git diff --stat` shows ONLY src/index.ts modified among production files; the two test files are new.
- src/index.ts entrypoint block (import.meta.main) is byte-identical except for nothing — it still calls runNightly(now) with no deps.
</verification>

<success_criteria>
- Task 1: an unaccounted client meeting renders a 📅 deep-linked "worth a look" line for the right designer; a same-day covered meeting renders none. No production change.
- Task 2: runNightly(now, deps?) DI seam added to src/index.ts ONLY; three orchestration paths (happy=0+📅, degrade=0+still-posts, post-fail=1) proven offline with no env/network access; single clock-read boundary intact.
- `npm test` green end-to-end.
</success_criteria>

<output>
Create `.planning/quick/260604-kig-add-end-to-end-calendar-render-runnightl/260604-kig-SUMMARY.md` when done.
</output>
