# Phase 4: Calendar & Meeting Reconciliation - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Read the three designers' Google calendars for the target working day, expand recurring
events, drop the ones that don't represent trackable work (declined / all-day / out-of-office /
solo blocks / after-hours / known overhead ceremonies), then reconcile the remaining
"counting" meetings against each designer's confirmed Productive bookings for that **same day**.
Meetings whose time is **not accounted for in Productive** are surfaced as a soft "worth a look"
nudge in the existing nightly Chat card — biased hard against false positives.

**In scope:** unattended multi-calendar read (service account + DWD, already live-validated);
recurring expansion; mechanical event filtering; the overhead ignore-list; per-day,
per-client meeting↔booking matching; a live-data labelling spike to build the classifier +
client-alias map + golden fixtures; the 📅 "worth a look" card line behind a soft voice.

**Out of scope (later/never):** any LLM adjudication of fuzzy meetings (Phase 5 — this phase is
deterministic rules only); idempotency / run-logging (Phase 6); changing the booking/capacity
arithmetic (Phases 1–2 are the trust boundary and stay untouched); brief-quality analysis;
blaming/【@-mentioning】 PMs.

**Pilot-gate note (deviation from ROADMAP MEET-04, owner-approved):** The roadmap framed
reconciliation as gated behind a real-evening pilot *before* it drives daily posting. Liam, as
owner, chose to ship it **live from day one** instead — rationale: it is a soft nudge to get
people to *look*, not a source of truth, so a wrong flag costs little. The "validation against
real evenings" is satisfied by (a) the labelling spike before launch and (b) the ignore-list /
classifier living in committed config so any misfire is trivial to tune. See D-12.
</domain>

<decisions>
## Implementation Decisions

### Matching rule — what gets flagged (the core)
- **D-01:** A meeting is **"worth a look"** when it is a *counting* meeting (see D-05/D-06) **AND**
  the designer has **no confirmed Productive booking for that meeting's client on the same target
  day**. Otherwise it is **covered** and never shown.
- **D-02:** **"Covered" is same-day only.** Being booked on the client the day before (or after)
  does **not** cover the meeting — the meeting consumes time *on that day*, so that day's bookings
  must account for it. (Live-validated against Liam's 26 May FDC case — see Specifics; Liam
  explicitly chose strict same-day over a ±1-day or whole-week window.)
- **D-03:** Matching key is the **client/company**, not the specific job. A meeting maps to a client
  by fuzzy-matching its **title** against the names/codes of the companies the designer is booked
  on that day. Productive bookings carry `company_id` (and `project_id`), so the designer's set of
  booked client companies for a given day is directly resolvable; their names/codes are matched
  against the meeting title via the client-alias map (D-09).
- **D-04:** **Bias against false positives is the prime directive.** When matching is uncertain,
  **stay quiet** (treat as covered). Surfaced items always use the soft "worth a look" voice —
  never "conflict" or any assertion of a definite problem (MEET-04).

### What "counts" vs overhead vs not-work
- **D-05:** **Overhead ceremonies never count and are never reconciled.** These are the recurring
  internal team meetings the studio explicitly does *not* count against the 7.5h day: Daily
  Stand-up, (Team) Weekly WIP, Creative team review, Creative WIP. Excluded via the ignore-list
  (D-07).
- **D-06:** **Everything else that consumes work-day time counts and should be in Productive** —
  client meetings (e.g. FDC), 1:1s (e.g. "Liam and Sam - monthly"), training (e.g. "Emerging
  Leaders - Strategy School"), and the Problem/SOLVD Fortnightly. If a counting meeting isn't
  reflected in Productive for the day, the day is secretly fuller than it looks — that's the gap
  worth surfacing. **Problem/SOLVD is NOT overhead** (Liam: "we get time for that" but it still
  needs to be in Productive).
- **D-06b:** **Not-work events are excluded mechanically**, not labelled: solo blocks (only the
  designer invited — e.g. a webinar), and anything starting outside work hours (D-08). Lunch is
  excluded too (ignore-list / not-work).

### Ignore-list mechanism
- **D-07:** The overhead ignore-list is a **committed list of specific title phrases**,
  case-insensitive substring match (e.g. "Daily Stand-up", "Weekly WIP", "Creative WIP",
  "Creative team"). **Specific phrases, not loose keywords** — so a future client meeting like
  "FDC WIP" is NOT accidentally swallowed (chosen over loose-keyword and exact-title matching).
  Lives in committed config so it is trivial to extend when meetings are renamed.

### Calendar read + mechanical exclusions
- **D-08:** Read the **target day's** events per designer in **Australia/Sydney**, recurring events
  **expanded to real instances** (`singleEvents` semantics). Exclude, in code: **declined**
  (the designer's own response status), **all-day**, **out-of-office** (MEET-05); **solo** events
  (only the designer as attendee); and events starting **outside 08:30–17:30** studio time
  (after-hours like the 17:30 Falcon Dinner). Response status is otherwise NOT a usefulness signal
  — real work meetings sit at `needsAction` (Liam never RSVPs); only the explicit *declined* state
  is used.

### The labelling spike (de-risking — the Phase 2 "briefed" precedent)
- **D-09:** Before launch, run a **live-data labelling spike**: pull **~3–4 weeks** of **all three**
  designers' calendars + Productive bookings; Liam labels each distinct meeting in chat
  (**overhead / counts / not-work** + confirms client names). Output is committed:
  (1) the ignore-list phrases (D-07), (2) the "counts vs not-work" rules (D-05/D-06/D-08),
  (3) the **client-alias map** (calendar title token → Productive company; e.g. "FDC" →
  "FDC Construction", code "FDCC"), and (4) **golden test fixtures** (incl. the two validated
  cases in Specifics). Treat all three designers the same for now; the spike surfaces any
  per-designer quirks before going live (D-13).

### How it ships
- **D-12:** **Live from day one** — no shadow mode, no pilot gate holding flags out of the team
  message. Conditions that make this safe: soft "worth a look" voice (D-04), and ignore-list +
  classifier in committed config so misfires are tuned in seconds. (Owner decision; relaxes the
  literal ROADMAP MEET-04 wording — see Phase Boundary note.)

### Multi-designer
- **D-13:** One shared rule set for all three designers. Overhead ignore-list is studio-wide
  (Stand-up/WIP/Creative team are 15–20-attendee org meetings). Matching is naturally per-designer
  (each person's own calendar vs their own booked clients) over a shared client-alias map.

### Card surfacing
- **D-14:** A **📅 sub-line nested under the relevant designer's row** (same pattern as the Phase 3
  ⚠️ tentative and 📄 brief sub-lines — D-09/D-14/D-16 of Phase 3), NOT a separate section. Line
  format: **`📅 {Meeting title} · {start time} · worth a look`**. The meeting title **deep-links to
  the Calendar event** (MSG-06). The 📅 calendar marker is new and distinct from 📄/⚠️ (Liam's
  explicit ask).

### Claude's Discretion
- The exact `googleapis` JWT + domain-wide-delegation wiring (subject impersonation per designer),
  the new `src/calendar/` source layer, and how a calendar-read failure threads into the existing
  degrade-don't-throw path (a new entry in gather/`sourceErrors` → the existing 🤖 degraded
  treatment; calendar is an additive source, never throws). The fuzzy title→client match algorithm
  details (tokenisation, alias map shape) — to be pinned by the spike (D-09).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning
- `.planning/ROADMAP.md` §"Phase 4: Calendar & Meeting Reconciliation" — goal + success criteria.
- `.planning/REQUIREMENTS.md` — MEET-01..05 (and MSG-06/07 for the card line + deep-link, REL-01/02
  for degraded behaviour).
- `.planning/STATE.md` §Blockers/Concerns "[Phase 4]" — the live-validated service-account setup,
  confirmed impersonation emails, and the "still TODO for Phase 4 execution" list.
- `CLAUDE.md` "Item 3" — service account + DWD is the correct unattended path; `calendar.readonly`
  scope; `googleapis` Node client (`google.auth.JWT` / subject impersonation).

### Calendar / platform (Google Workspace)
- Service account: `studio-checkin-calendar@evening-studio-checkin.iam.gserviceaccount.com`
  (Client ID 114624945849863129481, project `evening-studio-checkin`); JSON key in gitignored
  `secrets/`; DWD authorised for `https://www.googleapis.com/auth/calendar.readonly`.
- Impersonation emails (live-confirmed): `liamm@solvdagency.com.au` (686717),
  `anishag@solvdagency.com.au` (686712), `ellaw@solvdagency.com.au` (686716).
- Execution TODO (from STATE.md): set the SA JSON as a GitHub secret (e.g. `GOOGLE_SA_KEY`);
  build the read via `googleapis` JWT+subject (the validation probe used a raw JWT, no dep yet).

### Prior-phase contract (reuse, don't break)
- `src/index.ts` — `runNightly` composition root: the ONLY clock/env/network boundary; threads one
  studio-zone `now`; the **two-path reliability rule** (data-source failure → degraded card & exit 0;
  POST failure → exit 1). Calendar read plugs in here as an additive source.
- `src/productive/gather.ts` — `GatherResult` { bookings, absences, briefFlags, holidays,
  assessedDesigners, sourceErrors }; non-throwing degrade pattern to mirror for calendar.
- `src/domain/report.ts` — `StudioReport` (targetDay, window, designers[], rollup, missingDesigners);
  per-designer `DesignerResult`. Reconciliation reads these figures; it must NOT recompute hours.
- `src/render/cards.ts` — `RenderContext` (designerNames, sourceErrors, briefFlags, tentativeNotes,
  leaveNotes); the meeting flags become a new per-designer `RenderContext` field.
- `src/config.ts` — committed non-secret config home (DESIGNER_PERSON_IDS/NAMES, deep-link template,
  BRAND_COLORS); the ignore-list phrases + client-alias map belong here (extensible).
- `.planning/phases/03-template-renderer-chat-delivery/03-CONTEXT.md` — the locked card design
  language the 📅 line must match; `design/chat-card-mockups.html` is the visual contract.

### Brand voice (the "worth a look" copy)
- `/Users/liammills/Documents/CLAUDE/Solvd Brand/tone-of-voice.md` — direct, human, collective,
  Australian English, sentence case; soft-nudge ethos (never accusatory).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gather()` (`src/productive/gather.ts`) — the non-throwing, degrade-via-`sourceErrors` ingestion
  twin to copy for the calendar pull. A failed calendar read → a `sourceError` string → the
  renderer's existing 🤖 degraded treatment; the night still posts (REL-01).
- `StudioReport` / `DesignerResult` (`src/domain/report.ts`) — supply the per-designer figures
  reconciliation reads. **Never recompute** these (trust boundary).
- Productive booking client resolution — bookings filter by `company_id`/`project_id` directly
  (confirmed live), so the designer's booked-client set per day is one query.

### Established Patterns
- **Boundary:** `src/domain` must not import ingestion layers. Calendar is a new `src/calendar/`
  source feeding presentation context, not the deterministic domain.
- **Determinism:** inject `now`; the meeting reconciler is pure rules over fetched events + the
  report — no LLM, no clock reads.
- **Sub-flag card lines:** brief (📄) and tentative (⚠️) lines are already nested under designer
  rows — the 📅 meeting line follows the exact same widget pattern.

### Integration Points
- New flow: `gather()` (+ new calendar read) → `computeStudioReport` → reconcile meetings vs
  bookings (new, deterministic) → `RenderContext` gets a per-designer `worthALook` field →
  `renderTemplate` emits the 📅 line → `postToChat`.
- Calendar auth: SA JSON from `process.env.GOOGLE_SA_KEY` (new GitHub secret), `googleapis`
  JWT + `subject` per designer email.
</code_context>

<specifics>
## Specific Ideas

**Golden fixtures (real, live-validated 2026-06-04 — Liam, person 686717):**
- **COVERED — "Quick FDC catch up", Tue 3 Jun:** Liam was booked **6h on FDC Construction** that
  same day → not flagged. The rule's positive case.
- **WORTH A LOOK — "FDC IPO Launch Check-In", Tue 26 May:** Liam had **no FDC booking on the 26th**
  (his FDC bookings were 25 May 4h, 2 Jun 2h, 3 Jun 6h) → flagged, even though he was on FDC the day
  before. The same-day-strictness case (D-02). Note: this contradicted Liam's initial recollection
  that he was "on FDC that day" — the live data corrected it, which is exactly why the spike labels
  against real data, not memory.

**Real overhead meetings observed (ignore-list seed, all-three calendars):** Team Daily Stand-up,
Team Weekly WIP, Creative team - review (bring a piece of work!), Creative WIP - plan the week.

**Real counting meetings observed:** FDC IPO Launch Check-In, Quick FDC catch up, Problem/SOLVD
Fortnightly Team Meeting, Liam and Sam - monthly (1:1), Emerging Leaders - Strategy School.

**Real not-work events observed (excluded):** Lunch, "The Full Stack AI Workflow…" webinar (solo),
Falcon Dinner (17:30, after-hours).

**Client-alias finding:** "FDC" resolves to company **FDC Construction** (id 1333899, code "FDCC",
legal "FDC Fitout & Refurbishment (NSW) Pty Ltd"), projects FDC-100 / FDCC-101 (IPO Launch Video).
The alias map must handle short codes ↔ company names — the spike builds it.
</specifics>

<deferred>
## Deferred Ideas

- **LLM adjudication of fuzzy meetings** — Phase 5 (LLM-02). This phase is deterministic rules only;
  the rules and fixtures here become the LLM's reference/fallback later.
- **Idempotency + run logging** for the calendar source — Phase 6 (REL-03).
- **A formal shadow/pilot mode toggle** — considered and consciously declined (D-12); could be
  revisited if live false positives prove noisier than expected.
- **Per-meeting time-of-day vs booked-time-block matching** — impossible today (Productive bookings
  are day-granular hours with no clock times); same-day client matching (D-02/D-03) is the
  deliberate substitute.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: 04-calendar-meeting-reconciliation*
*Context gathered: 2026-06-04*
