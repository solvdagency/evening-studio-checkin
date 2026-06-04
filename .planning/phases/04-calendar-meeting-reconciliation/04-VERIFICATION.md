---
phase: 04-calendar-meeting-reconciliation
verified: 2026-06-04T04:34:41Z
status: passed
live_run_completed: 2026-06-04 — real Google Calendar + Productive + Chat post exercised twice (happy path + broken-credential degrade); both posted correctly to the test space. Closes the two human_needed checks below. A latent availability period-selection fragility surfaced during this run was fixed separately (commit 52bec02).
prior_status: human_needed
score: 12/12
overrides_applied: 0
human_verification:
  - test: "Run the nightly script live (GOOGLE_SA_KEY + Productive secrets set) on a weekday and observe the Chat card to confirm at least one 📅 line appears for a genuine unaccounted-for meeting, or confirm the card posts cleanly with no 📅 line when all meetings are covered."
    expected: "Card posts successfully. If a designer has a counting meeting not matched in Productive that day, a 📅 sub-line appears under their row with a deep-linked title and 'worth a look' voice. No 'conflict' language. Degrade card posts on Calendar outage."
    why_human: "The calendar reads are gated on GOOGLE_SA_KEY in the live environment. No integration test exercises runNightly end-to-end with real data. The degrade path is structurally covered (cal.sourceErrors merged into g.sourceErrors) and the degraded-card render is unit-tested, but the live POST path for the calendar-augmented card has not been exercised against the real webhook."
  - test: "Manually trigger a run with GOOGLE_SA_KEY deliberately broken (e.g. set to '{}') and confirm the card still posts, with a note naming the Calendar as the degraded source."
    expected: "Card posts (exit 0). The 🤖 degraded card includes 'Calendar' in the source-error text. No 📅 lines appear. Process does not exit 1."
    why_human: "The degrade path is unit-tested at the pure-render level, but the full runNightly live integration path (gatherCalendar degrading → sourceErrors concat → 🤖 card → postToChat) has never been exercised with a real failing credential."
---

# Phase 4: Calendar & Meeting Reconciliation — Verification Report

**Phase Goal:** Read the three designers' Google Calendars unattended, filter to "counting" meetings, reconcile each against same-day same-client Productive bookings, and surface unaccounted client meetings as a 📅 "worth a look" sub-line in the nightly Chat card — biased hard against false positives, degrading gracefully if Calendar fails.

**Verified:** 2026-06-04T04:34:41Z
**Status:** human_needed — all automated checks pass; two live-run integration checks required
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Both golden cases resolve correctly: "Quick FDC catch up" (3 Jun, FDC booked) not flagged; "FDC IPO Launch Check-In" (26 May, no FDC booking) flagged | VERIFIED | `reconcile.test.ts` lines 121–143 assert both outcomes exactly against the real golden fixtures. npm test 215/215 green. |
| 2 | Bias-against-false-positives (D-04): unmatched title → silent; double-match → silent; Streem ≠ Stream Hill | VERIFIED | `reconcile.test.ts` lines 93–117 assert null on unmatched, null on double-match, correct distinct company on Streem vs Stream Hill. |
| 3 | Ignore-list applied BEFORE alias match ("travel time, stevedores" excluded, never resolves to Stevedores client) | VERIFIED | `reconcile.test.ts` lines 169–179 assert `travel time, stevedores` produces empty worthALook. `filter.ts` isCountingMeeting applies isOverhead (via MEETING_IGNORE_LIST) before reconcileMeetings calls matchTitleToClient. |
| 4 | Declined / all-day / out-of-office / solo / after-hours events excluded from reconciliation (MEET-02, MEET-05) | VERIFIED | `filter.test.ts` 25 tests cover all six predicates including hand-built OOO, all-day, declined-self fixtures. `filter.ts` isCountingMeeting composes all exclusions. |
| 5 | Overhead ignore-list excludes ceremonies but NOT a client "FDC WIP" (D-07) | VERIFIED | `filter.test.ts` line 199–202: `isOverhead("Team Weekly WIP")` true, `isOverhead("FDC WIP")` false. |
| 6 | Trust boundary: filter.ts and reconcile.ts do NOT recompute hours, read the clock, or hit the network | VERIFIED | grep confirms no import of domain/clock or capacity in either file. Only pure type imports from domain/types.ts (DesignerId, STUDIO_ZONE — same as sibling gather.ts). No network call, no `new Date()`, no `process.env` read in either file. |
| 7 | Graceful degrade: a Calendar failure → sourceErrors string → existing 🤖 card still posts (REL-01) | VERIFIED (structurally) | `index.ts` line 185: `[...g.sourceErrors, ...cal.sourceErrors]` merged before buildRenderContext. `gatherCalendar` never throws (per-designer degrade loop tested in gather.test.ts). The degraded-card render path is unit-tested. Live integration path: human verification required. |
| 8 | The 📅 line deep-links the meeting title and uses "worth a look" voice, never "conflict" | VERIFIED | `rows.ts` line 160 emits `<a href="...">title</a>`. `renderMessage.test.ts` line 440 asserts no "conflict" in output. grep confirms no "conflict" in rows.ts rendered text. |
| 9 | Every dynamic string in the 📅 line is HTML-escaped (T-04-11) | VERIFIED | `renderMessage.test.ts` lines 443–453: asserts a `<script>` title is escaped to `&lt;script&gt;` and `&` is escaped. `escapeHtml` applied to title, link, and start before insertion in rows.ts lines 159–160. |
| 10 | Calendar read never logs the SA key (T-04-01) | VERIFIED | grep finds zero `console.*` calls in auth.ts, client.ts, gather.ts. Error strings in auth.ts return generic messages only ("not valid JSON", "missing client_email/private_key"). |
| 11 | gatherCalendar and reconcileMeetings are wired into runNightly; calendar sourceErrors concatenated before render | VERIFIED | `index.ts` lines 40–41 import both. Line 170 calls `gatherCalendar({ now })`. Line 185 concatenates `cal.sourceErrors`. `buildRenderContext` receives worthALook and sets `ctx.worthALook`. |
| 12 | GOOGLE_SA_KEY read only in auth.ts; spike.ts not in nightly path | VERIFIED | grep of `GOOGLE_SA_KEY` finds reads only in auth.ts (and docblock in config.ts). grep of calendar/spike imports in nightly-path files returns nothing. |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/calendar/auth.ts` | buildCalendarClient(saKey, subject) + loadSaKey() via google.auth.JWT | VERIFIED | Implements JWT with calendar.readonly scope. loadSaKey() degrades on missing/malformed key. No console.* logging of key material. |
| `src/calendar/schemas.ts` | CalendarEventResource zod schema, tolerant, safeParse-only | VERIFIED | .loose(), id required, all else optional, no .parse wrapper exported. |
| `src/calendar/client.ts` | listDayEvents non-throwing Result wrapper | VERIFIED | try/catch returns { ok: false, error } on client throw. singleEvents: true present. Imports Result from ../productive/client.ts (no redefinition). |
| `src/calendar/gather.ts` | gatherCalendar → CalendarResult { eventsByDesigner, sourceErrors } | VERIFIED | Degrade-per-designer loop, never throws. FilteredEvent clean output type. nextWorkingDay derivation matches productive/gather. |
| `src/productive/gather.ts` | bookedClientsByDesignerDay on GatherResult | VERIFIED | Field present, populated from already-fetched included data (task→project→company), no second Productive call. |
| `src/config.ts` | MEETING_IGNORE_LIST (5 phrases), CLIENT_ALIAS_MAP (8 companies), DESIGNER_CALENDAR_EMAILS, WORK_DAY_START/END | VERIFIED | All constants present. FDC entry with "IPO Launch" alias. Streem/Stream Hill as distinct entries with narrow aliases. No bare Solvd/Thirdi. A1/A2 findings docblock present. |
| `src/calendar/spike.ts` | Standalone labelling script, NOT in nightly path | VERIFIED | Imports buildCalendarClient + fetchAllPages. No postToChat/chat.googleapis import. Not imported by any nightly-path file. |
| `src/calendar/__fixtures__/labelled-events.json` | 8 zod-valid golden fixtures including both FDC golden cases | VERIFIED | 8 entries: 5 real (2 golden FDC cases, solo, after-hours, overhead) + 3 hand-built (declined-self, all-day, OOO). All CalendarEventResource.safeParse valid. |
| `src/calendar/filter.ts` | Pure predicates: isDeclined, isAllDay, isOutOfOffice, isSolo, isAfterHours, isOverhead, isCountingMeeting | VERIFIED | All 7 exported. Pure: no network, no clock read (parses event's own startDateTime), no domain-logic import. STUDIO_ZONE type import is pure constant. |
| `src/calendar/reconcile.ts` | reconcileMeetings + matchTitleToClient + WorthALookItem | VERIFIED | matchTitleToClient: longest-alias-first, double-match→null. reconcileMeetings: isCountingMeeting applied first, null→silent, covered→silent. |
| `src/render/cards.ts` | RenderContext.worthALook field | VERIFIED | Optional field `worthALook?: Record<string, Array<{ title, start, link }>>` present with D-14/MEET-04 docblock. |
| `src/render/rows.ts` | 📅 sub-line after 📄 brief loop | VERIFIED | Lines 158–161: loop over worthALook entries, emits `📅 <a href="...">title</a> · muted(start) · muted("worth a look")`. After 📄 loop. Early-return for missingDesigners precedes this block. |
| `src/render/renderMessage.ts` | worthALook threaded into buildRow call | VERIFIED | worthALook passed into buildRow alongside tentativeNotes/leaveNotes. |
| `src/index.ts` | gatherCalendar + reconcileMeetings wired; cal.sourceErrors merged | VERIFIED | Both imported and called. cal.sourceErrors spread into g.sourceErrors before buildRenderContext. |
| `src/render/__tests__/fixtures/worth-a-look.json` | Render fixture for 📅 test | VERIFIED | File exists at the actual path (not the plan frontmatter's __fixtures__ path — resolved per summary decision). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` | `src/calendar/gather.ts` + `src/calendar/reconcile.ts` | gatherCalendar({now}) → reconcileMeetings(...) → ctx.worthALook | VERIFIED | Lines 170–176 in index.ts. |
| `src/render/rows.ts` | ctx.worthALook[d.designerId] | 📅 sub-line loop after 📄 brief loop | VERIFIED | Lines 158–161 in rows.ts. |
| `src/index.ts` | g.sourceErrors + cal.sourceErrors | [...g.sourceErrors, ...cal.sourceErrors] passed to buildRenderContext | VERIFIED | Line 185 in index.ts. |
| `src/calendar/filter.ts` | MEETING_IGNORE_LIST (applied before alias resolution) | isCountingMeeting → isOverhead BEFORE reconcileMeetings calls matchTitleToClient | VERIFIED | isCountingMeeting is called as the first gate inside reconcileMeetings loop (line 122 of reconcile.ts). |
| `src/calendar/gather.ts` | `src/calendar/auth.ts` (buildCalendarClient) | defaultFetchEvents (injectable, tests stub it) | VERIFIED | Lines 85–94 in gather.ts. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/calendar/gather.ts` | eventsByDesigner | defaultFetchEvents → googleapis events.list (DWD-impersonated) | Yes — live Calendar API; degraded to [] on failure | FLOWING (live path) / STATIC on degrade (by design) |
| `src/render/rows.ts` 📅 line | ctx.worthALook[d.designerId] | reconcileMeetings output ← gatherCalendar ← real Calendar events | Yes — computed from live events + Productive booked-client sets | FLOWING (wired end-to-end in index.ts) |
| `src/productive/gather.ts` bookedClientsByDesignerDay | bookedClientsByDesignerDay | included data already fetched in the same Productive call | Yes — extracted from task→project→company chain | FLOWING |

Note: the data flow is structurally correct and tested with fixtures. Live end-to-end data flow (real Calendar events → 📅 in Chat card) has not been observed in production — this is the outstanding live-run human verification.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm test suite passes | `npm test` | 215/215 pass, 0 fail | PASS |
| index.ts import is inert (import.meta.main guard) | `node --import tsx -e "import('./src/index.ts').then(()=>console.log('IMPORT OK'))"` | IMPORT OK | PASS |
| GOOGLE_SA_KEY never in non-auth files | `grep -rn "GOOGLE_SA_KEY" src/` | Only in auth.ts (reads) + config.ts (docblock comment) | PASS |
| No "conflict" voice in rendered rows | `grep -rn "conflict" src/render/rows.ts` | Zero executable matches | PASS |
| spike.ts not imported in nightly path | `grep -rn "calendar/spike" src/index.ts src/calendar/gather.ts src/calendar/filter.ts src/calendar/reconcile.ts` | No output | PASS |
| filter.ts/reconcile.ts: no clock/network/domain-logic import | `grep -rn "import.*domain/clock\|capacity" src/calendar/filter.ts src/calendar/reconcile.ts` | No output (only type imports from domain/types.ts) | PASS |

---

### Probe Execution

No probe scripts declared in PLAN.md or SUMMARY.md for Phase 4. The test suite (npm test) is the verification vehicle; it passes 215/215.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| MEET-01 | 04-01 | Read target day's events from the three designers' Google calendars | SATISFIED | gatherCalendar reads all three DESIGNER_CALENDAR_EMAILS via DWD; unit-tested with stubbed fetchEvents |
| MEET-02 | 04-02, 04-03 | Known recurring overhead meetings excluded from reconciliation | SATISFIED | MEETING_IGNORE_LIST (5 phrases) applied via isOverhead inside isCountingMeeting before alias resolution |
| MEET-03 | 04-03 | Ad-hoc/client meetings reconciled against bookings; covered meetings not flagged | SATISFIED | reconcileMeetings: matched + bookedClientsByDesignerDay.has(companyId) → skip. Golden case COVERED verified. |
| MEET-04 | 04-04 | Unaccounted meetings surfaced as "worth a look" (bias against false positives) | SATISFIED | 📅 sub-line with "worth a look" voice, deep-linked, HTML-escaped. renderMessage.test.ts asserts soft voice + no "conflict". |
| MEET-05 | 04-03 | Declined, all-day, and out-of-office events excluded | SATISFIED | isDeclined, isAllDay, isOutOfOffice in filter.ts; 25 filter tests cover all three paths plus solo and after-hours. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TBD/FIXME/XXX debt markers, no placeholder returns, no hardcoded empty data serving as production stubs. The hand-built OOO/all-day/declined fixtures (`_fixtureNote: HAND-BUILT`) are intentional synthetic test coverage (clearly marked), not production stubs.

One design note for traceability: `reconcileMeetings` accepts an `_ignoreList` parameter but isCountingMeeting reads MEETING_IGNORE_LIST from config internally. The ignore-list IS applied (the behaviour is correct and tested); the parameter is kept for signature stability. This is documented in the 04-03-SUMMARY deviations section.

---

### Human Verification Required

#### 1. Live nightly run: calendar-augmented Chat card

**Test:** On a weekday, ensure GOOGLE_SA_KEY, PRODUCTIVE_AUTH_TOKEN, PRODUCTIVE_ORG_ID, and GCHAT_WEBHOOK_URL are all set (via GitHub Actions secrets or local .env). Trigger the nightly run (`node --import tsx src/index.ts`) or let the schedule fire. Observe the posted Chat card.

**Expected:** Card posts successfully (exit 0). If any designer has a counting meeting not matched by a Productive booking for that exact day, a 📅 sub-line appears under their row with a deep-linked title and the soft "worth a look" voice. No "conflict" language anywhere. No calendar events appear on the card from the hidden set (solo / overhead / all-day / after-hours / declined).

**Why human:** No integration test exercises runNightly end-to-end with real credentials and a real Chat webhook. The GOOGLE_SA_KEY secret was provisioned (STATE.md, 2026-06-04) but the live POST path for the calendar-augmented card has never been observed. Green unit tests have previously hidden live-shape gaps in this project (MEMORY.md).

---

#### 2. Calendar failure degrade path (live)

**Test:** Deliberately break GOOGLE_SA_KEY (e.g. set to '{}' or a malformed string) while keeping all other secrets valid. Trigger the nightly run.

**Expected:** Card still posts (exit 0). The posted card is the 🤖 degraded variant. The source-error text names the Calendar (e.g. "Couldn't reach Calendar for Liam Mills: …"). Process exits 0, not 1. No 📅 lines appear.

**Why human:** The degrade path is unit-tested at the pure-render level (degraded-card render with a "Calendar" sourceError is asserted in renderMessage.test.ts). The full live path — bad GOOGLE_SA_KEY → gatherCalendar degrades → sourceErrors merged → 🤖 card → real Chat POST → exit 0 — has not been exercised with real infrastructure.

---

### Gaps Summary

No gaps. All 12 must-haves are VERIFIED by automated evidence (code inspection + 215/215 test pass). The two human verification items are live-run integration checks, not code deficiencies. The degrade path is structurally correct and unit-tested; the live-run check is standard "first post to production" validation.

---

_Verified: 2026-06-04T04:34:41Z_
_Verifier: Claude (gsd-verifier)_
