# Evening Studio Check-in

## What This Is

A nightly automation for a design/marketing agency's creative studio. Every weekday around 4:30pm it reads the design team's resourcing from Productive.io and the designers' meetings from Google Calendar, then posts an on-brand "evening check-in" to Google Chat (Gmail optional) that flags what needs sorting before the next working day — designer hours that aren't fully booked, bookings missing a finished brief, and meetings that aren't accounted for in Productive. It's a collective nudge — really aimed at the project managers — so designers walk in to a full, ready day instead of chasing work.

## Core Value

Every evening the team gets one clear, trustworthy heads-up of exactly what needs fixing before tomorrow — so the three designers start the day with full, briefed workloads instead of chasing the work themselves.

## Current State

**Shipped: v1.0 (MVP) — 2026-06-04.** All 7 phases complete (22 plans, 25/25 requirements, full suite 334 green, `tsc` clean). The nightly automation is feature-complete: deterministic capacity/brief math, live Productive pull with the discovered "briefed" mapping, per-designer working-day availability, Google Calendar meeting reconciliation, an on-brand Cards v2 message with scheduled weekday posting + degraded mode, an optional default-OFF LLM prose/fuzzy-meeting layer, and idempotency + structured run logging. Milestone audit: `tech_debt` (no blockers). See [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md) and [`v1.0-MILESTONE-AUDIT.md`](v1.0-MILESTONE-AUDIT.md).

**Carried-forward tech debt (none blocking):** Phase 4 live-run validation; Phase 5 eval-fixture expansion before enabling the meeting-judgment toggle in prod; Phase 6 D-06 degrade-path refinement.

## Next Milestone Goals

None defined yet. Likely candidates from the v2 backlog: Gmail as a secondary delivery channel (GMAIL-01), brief-*quality* analysis (BQ-01), resourcing-health history/trends (HIST-01). Run `/gsd:new-milestone` to define fresh requirements and a roadmap (phase numbering continues from 8).

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Runs automatically on a nightly schedule, weekdays only, around 4:30pm
- [ ] Pulls design-team resourcing from Productive.io: bookings, their linked tasks + "briefed" status, and time-off
- [ ] Pulls the three designers' Google Calendar events for the target window
- [ ] Computes per-designer available hours (7.5h minus time-off) vs booked hours for the next working day (Friday looks ahead to Monday)
- [ ] Computes a studio "rest of this week" view (e.g. "10 of 40 studio hours still unfilled")
- [ ] Flags designers who are underbooked against their available hours that day
- [ ] Counts tentative bookings toward hours but flags them distinctly as shaky
- [ ] Flags bookings that have no task or aren't marked "briefed" (existence check only, not a quality scan)
- [ ] Reconciles ad-hoc/client meetings against bookings with enough nuance to avoid false flags; ignores the daily WIP and the creative-team meeting (known overhead)
- [ ] Produces a clear, engaging, on-brand message; names the designer with open time and refers to thin jobs/briefs (not the PMs)
- [ ] Always posts — including a short positive note on nights when everything is sorted
- [ ] Posts a degraded message naming what it couldn't reach if a data source fails (never silently skips a night)
- [ ] Delivers to Google Chat (primary); Gmail optional
- [ ] Uses an LLM via a sanctioned Anthropic API key (pay-per-use, ~pennies/night) for the meeting-reconciliation judgment and message writing, with a deterministic templated fallback; the LLM layer is gated on org approval of the key and is cuttable

### Out of Scope

- Brief *quality* analysis (checking a brief has all the context/assets) — deliberately deferred to a separate future tool; v1 only checks a brief exists and is marked briefed
- Historical tracking, trends, or a dashboard — the value is the nightly nudge, not analytics
- Strict 7.5h tracking of the Head of Creative/Strategy and the Creative Director — their time is fluid and booked in larger, irregular chunks
- Weekend runs — the studio doesn't work weekends
- LLM on the Pro/Max subscription via unattended OAuth — prohibited by Anthropic's terms (enforced) and metered from 15 Jun 2026; rejected in favour of a sanctioned API key

## Context

- The studio belongs to a marketing/design agency; all resourcing is managed in Productive.io's resourcing tab.
- The design team is five people: **three monitored designers** booked to a 7.5h/day target, plus a **Head of Creative/Strategy** and a **Creative Director** whose time is more fluid and not strictly tracked.
- Designers depend on project managers to write briefs and make bookings. When briefs aren't in, bookings aren't full, or meetings aren't reflected, designers arrive with gaps and have to chase work — which they can't find the way PMs can.
- In Productive, work flows: resourcing assigns a designer to a project → the project has a task → a booking is made and a task attached → the booking can be marked "briefed". Bookings can also be "tentative" when a PM expects time but client details are still in flux.
- Known recurring meeting overhead that designers absorb *around* their 7.5h (not reconciled): a daily 15-minute WIP and a creative-team meeting three days a week. Only ad-hoc/client meetings need reconciling.
- Built by Liam — a graphic designer/creative, strong in visual/brand design, learning the code side.

## Constraints

- **Tech stack**: Node.js 22 + TypeScript; GitHub Actions cron for scheduling; Google Chat incoming webhook with Cards v2.
- **LLM access**: LLM runs via a sanctioned Anthropic API key (pay-per-use). The unattended Pro/Max-subscription OAuth route is prohibited by Anthropic's terms and metered from 15 Jun 2026, so it is not used.
- **Hosting**: Runs unattended on a nightly schedule with no always-on server (GitHub Actions cron).
- **Trust**: All hour/capacity arithmetic is done in deterministic code, never by the LLM — the numbers must be exact or the team stops reading the message.
- **Dependencies**: Productive.io API; Google Calendar API via service account + domain-wide delegation (needs a Google Workspace admin to authorise); Google Chat incoming webhook; org-provisioned Anthropic API key (for the LLM phase only).
- **Cost**: Near-zero ongoing cost — free scheduled hosting; LLM is a few cents per night on the sanctioned API key.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deterministic code for all arithmetic; LLM only for judgment + writing | Hours must be trustworthy; LLM doing maths is a risk | — Pending |
| LLM runs via a sanctioned Anthropic API key (org-approved) | Pro-subscription unattended route is a ToS breach + metered from 15 Jun 2026; API key is permitted and ~pennies/night | — Pending (org to provision key) |
| GitHub Actions cron for scheduling | Free, no server to maintain, secrets built in | — Pending |
| Productive time-off is the source of truth for availability | Keeps capacity logic in one system | — Pending |
| Intelligence/render layer is swappable (templated fallback) | Ships even if the LLM-on-Pro route proves unworkable | — Pending |
| Track only the 3 designers against 7.5h | The other two creatives are fluid by nature | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-03 — Phase 1 (Core Math & Clock) complete: pure, fully unit-tested capacity + working-day arithmetic exists as the trust boundary. No requirements moved to Validated yet — these validate on ship (Phase 3+).*
