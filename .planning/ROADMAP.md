# Roadmap: Evening Studio Check-in

## Overview

The build goes inside-out, deterministic-first. We start at the trust boundary — pure, fully-tested capacity arithmetic and working-day math with zero external dependencies — then layer real Productive data (including a mandatory discovery spike to learn what "briefed" actually means in this org). With trusted numbers in hand we ship a complete, scheduled, on-brand Google Chat product using a deterministic template renderer and no LLM, no Calendar. From that shippable base we add Google Calendar meeting reconciliation behind a pilot gate, then an optional, cuttable LLM renderer that only writes prose and adjudicates fuzzy meetings (never arithmetic). A final hardening pass adds idempotency and run logging. Every milestone after Phase 3 is additive — the studio keeps getting a trustworthy nightly nudge even if later phases are cut.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Math & Clock** - Pure, unit-tested capacity arithmetic and working-day logic with no external dependencies
- [ ] **Phase 2: Productive Pull & Briefed Discovery** - Live Productive data into typed objects; discover and confirm the real "briefed" mapping
- [ ] **Phase 3: Template Renderer & Chat Delivery** - Shippable v1: on-brand Cards v2 message, scheduled weekday posting, always-post and degraded mode (no LLM, no Calendar)
- [ ] **Phase 4: Calendar & Meeting Reconciliation** - Read designer calendars and reconcile ad-hoc meetings against bookings, behind a real-evening pilot gate
- [ ] **Phase 5: LLM Renderer (optional)** - Swappable LLM renderer for prose and fuzzy meeting judgment, with templated fallback; cuttable
- [ ] **Phase 6: Hardening** - Idempotency and structured run logging so a stable, unattended automation stays trustworthy

## Phase Details

### Phase 1: Core Math & Clock
**Goal**: All capacity and working-day arithmetic exists as pure, deterministic, fully unit-tested functions — the trust boundary — with no network or external dependencies.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SCHED-03, SCHED-04, CAP-01, CAP-02, CAP-03, CAP-04, CAP-05
**Success Criteria** (what must be TRUE):
  1. Given typed booking and time-off inputs, the core computes each designer's available hours (7.5h minus time-off) and booked hours for the target day, and a studio rest-of-week rollup, with results verifiable by hand against the inputs
  2. A designer booked below their available hours is returned as underbooked with the designer named and the open hours stated; tentative bookings are counted toward hours but carried as a distinct "shaky" flag
  3. The clock derives the correct target day from the studio timezone (not the scheduler's clock), and a Friday run targets Monday — proven by passing tests for the Friday-to-Monday case, a holiday-eve case, and a DST-boundary case
  4. The same inputs always produce the same outputs (no randomness, no I/O), and partial/empty inputs degrade gracefully rather than throwing
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold + working-day clock (next working day, Fri→Mon, holiday/DST-safe)
- [x] 01-02-PLAN.md — Per-designer capacity + classification (available/booked/open, off/underbooked/overbooked/shaky, 0.25h rounding)
- [ ] 01-03-PLAN.md — Studio rest-of-week rollup + roster-gap detection + StudioReport assembly

### Phase 2: Productive Pull & Briefed Discovery
**Goal**: Real Productive data flows into trusted typed domain objects, and the studio's actual "briefed" convention is discovered and confirmed against live data so brief flags are correct from night one.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: BRIEF-01, BRIEF-02, BRIEF-03
**Success Criteria** (what must be TRUE):
  1. The Productive client pulls the three designers' bookings (including tentative/`draft`) and time-off (absence bookings) for the target window into validated, typed objects, paginating fully and never throwing across the boundary
  2. A documented, named mapping for "briefed" (custom field / task status / linked-task presence) is confirmed against what PMs see in the live Productive UI for real bookings — not assumed
  3. For each target-day booking the system reports whether a task is linked and whether it is briefed per that confirmed mapping, and surfaces missing-task / not-briefed bookings by job/task (never by PM) as an existence check only
  4. Running the gather-plus-analyze pipeline against real Productive data produces capacity numbers and brief flags that a hand-check against the Productive UI agrees with
**Plans**: TBD
**Dependencies (external)**: Productive.io API access with `X-Auth-Token` + `X-Organization-Id` (the Productive integration is available to run the discovery spike).

### Phase 3: Template Renderer & Chat Delivery
**Goal**: A complete, shippable v1 — the deterministic studio report rendered as an on-brand Google Chat Cards v2 message, posted automatically on a weekday ~4:30pm schedule, always posting (including clean-night and degraded variants) with zero LLM and zero Calendar dependency.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SCHED-01, SCHED-02, MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, MSG-07, REL-01, REL-02
**Success Criteria** (what must be TRUE):
  1. On a weekday at ~4:30pm studio time (and never on weekends) the automation runs unattended and posts a single Cards v2 message with studio logo and accent colour; it can also be triggered manually on demand for testing
  2. The message leads with a verdict line, then the studio week rollup, then per-designer rows, then grouped flags; it names the designer with open time and refers to thin jobs/briefs, never a PM; tentative bookings and shaky items are visually distinguished; rows deep-link back to the relevant Productive bookings
  3. The check always posts — a short positive note on clean nights and a fuller message on busy nights (length scales with severity)
  4. When a data source is unreachable the posted message names what it couldn't reach rather than skipping the night, and a failed run raises a human-visible alert
**Plans**: TBD
**UI hint**: yes

### Phase 4: Calendar & Meeting Reconciliation
**Goal**: The three designers' calendars feed rule-based meeting reconciliation that surfaces genuinely unaccounted ad-hoc meetings without false positives, validated against real evenings before it drives daily posting.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: MEET-01, MEET-02, MEET-03, MEET-04, MEET-05
**Success Criteria** (what must be TRUE):
  1. The system reads the target day's events from the three designers' Google calendars (recurring events expanded), excluding declined, all-day, and out-of-office events
  2. The known recurring overhead meetings (daily WIP and the creative-team meeting) are hard-excluded, and ad-hoc/client meetings that are clearly covered by a booking are not flagged
  3. Meetings that appear unaccounted for are surfaced as "worth a look" (visually distinguished), biased against false positives rather than asserted as definite conflicts
  4. In a real-evening pilot the team agrees with every flag the reconciliation raises before it is wired into daily posting
**Plans**: TBD
**Dependencies (external)**: Google Calendar via service account + domain-wide delegation with `calendar.readonly` — requires a Google Workspace admin to authorise the service account's client ID before this phase can complete. Surface and confirm this dependency at phase start.

### Phase 5: LLM Renderer (optional)
**Goal**: An optional LLM renderer produces the message prose and adjudicates fuzzy meeting reconciliation behind a swappable interface — receiving only pre-computed facts, never doing arithmetic — and falls back to the always-available template renderer on any failure.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: LLM-01, LLM-02
**Success Criteria** (what must be TRUE):
  1. The renderer is swappable behind one interface, with the deterministic template renderer as the always-available default; the system produces a correct, complete message with the LLM layer entirely disabled
  2. The optional LLM renderer writes the message prose and adjudicates fuzzy meeting reconciliation from pre-computed facts only, and the numbers in its output match the deterministic computed numbers exactly before anything is posted
  3. Any LLM failure (auth, timeout, schema, validation mismatch) falls back to the template renderer and posts, with a loud alert noting the LLM was skipped
**Plans**: TBD
**Dependencies (external)**: Anthropic API key — a personal $5-credit key for development/testing, and an org-sanctioned key for production. Production cutover is gated on org approval of the sanctioned key; the Pro/Max subscription OAuth route is prohibited and must not be used. This entire phase is cuttable without affecting the shipped product.

### Phase 6: Hardening
**Goal**: The unattended automation is durable over time — it never double-posts and every run leaves a structured, inspectable trace — so a stable repo keeps delivering a trustworthy nightly nudge.
**Mode:** mvp
**Depends on**: Phase 3 (independent of Phases 4 and 5)
**Requirements**: REL-03
**Success Criteria** (what must be TRUE):
  1. Re-running the check for the same evening does not produce a duplicate post (idempotency via a dated marker)
  2. Each run leaves a structured log of what it did (sources reached, flags raised, renderer used, post outcome) that a human can inspect after the fact
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Math & Clock | 2/3 | In Progress|  |
| 2. Productive Pull & Briefed Discovery | 0/TBD | Not started | - |
| 3. Template Renderer & Chat Delivery | 0/TBD | Not started | - |
| 4. Calendar & Meeting Reconciliation | 0/TBD | Not started | - |
| 5. LLM Renderer (optional) | 0/TBD | Not started | - |
| 6. Hardening | 0/TBD | Not started | - |
