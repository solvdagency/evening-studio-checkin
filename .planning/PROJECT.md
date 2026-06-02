# Evening Studio Check-in

## What This Is

A nightly automation for a design/marketing agency's creative studio. Every weekday around 4:30pm it reads the design team's resourcing from Productive.io and the designers' meetings from Google Calendar, then posts an on-brand "evening check-in" to Google Chat (Gmail optional) that flags what needs sorting before the next working day — designer hours that aren't fully booked, bookings missing a finished brief, and meetings that aren't accounted for in Productive. It's a collective nudge — really aimed at the project managers — so designers walk in to a full, ready day instead of chasing work.

## Core Value

Every evening the team gets one clear, trustworthy heads-up of exactly what needs fixing before tomorrow — so the three designers start the day with full, briefed workloads instead of chasing the work themselves.

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
- [ ] Uses an LLM (via the existing Pro subscription, not the paid API) for the meeting-reconciliation judgment and message writing, with a deterministic templated fallback

### Out of Scope

- Brief *quality* analysis (checking a brief has all the context/assets) — deliberately deferred to a separate future tool; v1 only checks a brief exists and is marked briefed
- Historical tracking, trends, or a dashboard — the value is the nightly nudge, not analytics
- Strict 7.5h tracking of the Head of Creative/Strategy and the Creative Director — their time is fluid and booked in larger, irregular chunks
- Weekend runs — the studio doesn't work weekends
- Pay-per-use Claude API — the org blocks API-key creation, so the LLM must run on the existing Pro subscription

## Context

- The studio belongs to a marketing/design agency; all resourcing is managed in Productive.io's resourcing tab.
- The design team is five people: **three monitored designers** booked to a 7.5h/day target, plus a **Head of Creative/Strategy** and a **Creative Director** whose time is more fluid and not strictly tracked.
- Designers depend on project managers to write briefs and make bookings. When briefs aren't in, bookings aren't full, or meetings aren't reflected, designers arrive with gaps and have to chase work — which they can't find the way PMs can.
- In Productive, work flows: resourcing assigns a designer to a project → the project has a task → a booking is made and a task attached → the booking can be marked "briefed". Bookings can also be "tentative" when a PM expects time but client details are still in flux.
- Known recurring meeting overhead that designers absorb *around* their 7.5h (not reconciled): a daily 15-minute WIP and a creative-team meeting three days a week. Only ad-hoc/client meetings need reconciling.
- Built by Liam — a graphic designer/creative, strong in visual/brand design, learning the code side.

## Constraints

- **Tech stack**: LLM must run on the existing Claude Pro subscription, not the pay-per-use API — the org locks API-key creation. Exact unattended auth route is a research item.
- **Hosting**: Runs unattended on a nightly schedule with no always-on server (GitHub Actions cron is the leading candidate).
- **Trust**: All hour/capacity arithmetic is done in deterministic code, never by the LLM — the numbers must be exact or the team stops reading the message.
- **Dependencies**: Productive.io API, Google Calendar API (three calendars), and a Google Chat delivery mechanism (webhook vs Chat app — TBD in research).
- **Cost**: Effectively zero ongoing cost — free scheduled hosting plus the existing subscription; no new per-use billing.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deterministic code for all arithmetic; LLM only for judgment + writing | Hours must be trustworthy; LLM doing maths is a risk | — Pending |
| LLM runs on the existing Pro subscription, not the paid API | Org blocks API-key creation; avoid new per-use cost | — Pending (research to validate unattended auth) |
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
*Last updated: 2026-06-02 after initialization*
