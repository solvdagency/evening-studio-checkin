# Requirements: Evening Studio Check-in

**Defined:** 2026-06-02
**Core Value:** Every evening the team gets one clear, trustworthy heads-up of exactly what needs fixing before tomorrow — so the three designers start the day with full, briefed workloads instead of chasing the work themselves.

## v1 Requirements

Requirements for the initial release. Each maps to roadmap phases.

### Schedule & Runtime

- [ ] **SCHED-01**: The check runs automatically every weekday at ~4:30pm studio time, and not on weekends
- [ ] **SCHED-02**: The check can be triggered manually on demand for testing (without waiting for the schedule)
- [ ] **SCHED-03**: The "next working day" window targets the following weekday; on a Friday it targets Monday
- [ ] **SCHED-04**: All working-day and window logic is computed from the studio timezone in code (not from the scheduler's clock), and is DST-safe

### Capacity & Bookings

- [ ] **CAP-01**: For each of the three designers, the check computes available hours for the target day (7.5h minus any Productive time-off / absence)
- [ ] **CAP-02**: For each designer, the check computes booked hours for the target day from confirmed bookings
- [ ] **CAP-03**: A designer booked below their available hours for the target day is flagged as underbooked, naming the designer and the open hours
- [ ] **CAP-04**: Tentative (draft) bookings are counted toward hours but shown distinctly as shaky/unconfirmed
- [ ] **CAP-05**: The check computes a studio "rest of this week" rollup — open hours vs total studio hours across the remaining working days

### Briefs

- [ ] **BRIEF-01**: For each booking on the target day, the check verifies a task is linked
- [ ] **BRIEF-02**: For each booking, the check verifies the task is marked "briefed" per the studio's actual Productive convention (mapping discovered against live data, not assumed)
- [ ] **BRIEF-03**: Bookings missing a linked task or not marked briefed are flagged by job/task (never by PM), as an existence check only — no brief-quality analysis

### Meetings

- [ ] **MEET-01**: The check reads the target day's events from the three designers' Google calendars
- [ ] **MEET-02**: Known recurring overhead meetings (the daily WIP and the creative-team meeting) are excluded from reconciliation
- [ ] **MEET-03**: Ad-hoc/client meetings are reconciled against that designer's bookings; clearly-covered meetings are not flagged
- [ ] **MEET-04**: Meetings that appear unaccounted for are surfaced as "worth a look" rather than asserted as definite conflicts (bias against false positives)
- [ ] **MEET-05**: Declined, all-day, and out-of-office events are excluded from reconciliation

### Message & Delivery

- [ ] **MSG-01**: The check posts an on-brand Google Chat message using Cards v2 (studio logo, accent colour, sections)
- [ ] **MSG-02**: The message leads with a verdict line, then the studio week rollup, then per-designer rows, then grouped flags
- [ ] **MSG-03**: The message names the designer with open time and refers to thin jobs/briefs — never the responsible PM
- [ ] **MSG-04**: The check always posts, including a short positive note on nights when everything is sorted
- [ ] **MSG-05**: Message length scales with severity — short on good nights, fuller on busy nights
- [ ] **MSG-06**: The message includes deep-links back to the relevant Productive bookings and Calendar events
- [ ] **MSG-07**: Tentative bookings and "worth a look" meetings are visually distinguished in the message

### Reliability

- [ ] **REL-01**: If a data source is unreachable, the check posts a degraded message naming what it couldn't reach, rather than skipping the night
- [ ] **REL-02**: A failed run surfaces a human-visible alert (never fails silently)
- [ ] **REL-03**: The check avoids duplicate posts for the same evening (idempotency)

### Intelligence Layer

- [ ] **LLM-01**: The message renderer is swappable behind one interface, with a deterministic templated renderer as the always-available default
- [ ] **LLM-02**: An optional LLM renderer (via an Anthropic API key — a personal $5-credit key for development/testing, the org-sanctioned key for production) produces the message prose and adjudicates fuzzy meeting reconciliation, receiving only pre-computed facts (never doing arithmetic), and falls back to the templated renderer on any failure

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Delivery

- **GMAIL-01**: Optionally also send the evening check-in via Gmail as a secondary channel

### Brief Quality

- **BQ-01**: Analyse whether a brief actually contains the context/assets a designer needs (quality, not just existence)

### Analytics

- **HIST-01**: Track resourcing health over time (trends, history, a dashboard)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Brief *quality* analysis | A separate future tool; v1 only checks a brief exists and is marked briefed |
| Historical tracking / dashboards | The value is the nightly nudge, not analytics |
| Strict 7.5h tracking of Head of Creative/Strategy & Creative Director | Their time is fluid and booked in larger, irregular chunks |
| Weekend runs | The studio doesn't work weekends |
| @-mentioning / blaming PMs by name | Collective-nudge tone; finger-pointing kills adoption |
| Per-designer DMs / escalation / repeat sends | One well-timed post; avoids alert fatigue |
| Interactive Chat buttons / Chat app | Incoming webhooks can't action button clicks; webhook keeps the no-server constraint |
| LLM on the Pro/Max subscription via unattended OAuth | Anthropic ToS breach (enforced) + metered from 15 Jun 2026 — use a sanctioned API key instead |
| Configurable-everything UI | Config lives in a committed file; no settings UI needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHED-01 | Phase 3 | Pending |
| SCHED-02 | Phase 3 | Pending |
| SCHED-03 | Phase 1 | Pending |
| SCHED-04 | Phase 1 | Pending |
| CAP-01 | Phase 1 | Pending |
| CAP-02 | Phase 1 | Pending |
| CAP-03 | Phase 1 | Pending |
| CAP-04 | Phase 1 | Pending |
| CAP-05 | Phase 1 | Pending |
| BRIEF-01 | Phase 2 | Pending |
| BRIEF-02 | Phase 2 | Pending |
| BRIEF-03 | Phase 2 | Pending |
| MEET-01 | Phase 4 | Pending |
| MEET-02 | Phase 4 | Pending |
| MEET-03 | Phase 4 | Pending |
| MEET-04 | Phase 4 | Pending |
| MEET-05 | Phase 4 | Pending |
| MSG-01 | Phase 3 | Pending |
| MSG-02 | Phase 3 | Pending |
| MSG-03 | Phase 3 | Pending |
| MSG-04 | Phase 3 | Pending |
| MSG-05 | Phase 3 | Pending |
| MSG-06 | Phase 3 | Pending |
| MSG-07 | Phase 3 | Pending |
| REL-01 | Phase 3 | Pending |
| REL-02 | Phase 3 | Pending |
| REL-03 | Phase 6 | Pending |
| LLM-01 | Phase 5 | Pending |
| LLM-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-02*
*Last updated: 2026-06-02 after roadmap creation (traceability populated, 25/25 mapped)*
