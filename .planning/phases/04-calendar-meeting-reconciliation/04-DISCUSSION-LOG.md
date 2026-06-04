# Phase 4: Calendar & Meeting Reconciliation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 04-calendar-meeting-reconciliation
**Areas discussed:** Matching rule, Ignore list, How it ships, Coverage window, Labelling spike, Calendar read + counts signals, Card surfacing, The other two designers

---

## Matching rule — core coverage signal

| Option | Description | Selected |
|--------|-------------|----------|
| Capacity-based | Only flag if designer has open/underbooked time | |
| Booking-exists | Flag only designers with zero bookings | |
| Meeting-vs-open hours | Flag when meeting minutes consume open time | |

**User's choice:** Free-text — rejected all three. Real model: a meeting is covered if it maps to
a client you're **booked on that day** (FDC meeting + FDC booking → covered); worth a look if it's
a client/work meeting with **no matching booking that day**. Overhead ceremonies never count.
**Notes:** Grounded in real examples (26 May FDC IPO check-in, Problem/SOLVD). The split is
"does it eat into the trackable 7.5h?", NOT client-vs-internal — 1:1s and training count too.

## Matching rule — resolution approach

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — with a labelling spike | Lock rule; build classifier + client-map + fixtures via live-data spike Liam labels | ✓ |
| Yes — but simpler, no client-match | Surface all countable unaccounted meetings, no client matching | |
| Let me adjust it | Rule not right yet | |

**User's choice:** Yes — with a labelling spike.
**Notes:** Mirrors the Phase 2 "briefed" live-discovery precedent.

## Ignore list — title matching

| Option | Description | Selected |
|--------|-------------|----------|
| Specific phrases | "Weekly WIP", "Creative WIP", "Daily Stand-up", "Creative team" | ✓ |
| Loose keywords | "WIP", "Stand-up", "Creative" — risks swallowing client meetings | |
| Exact titles only | Most precise, breaks on rename | |

**User's choice:** Specific phrases.
**Notes:** Avoids accidentally ignoring a future "FDC WIP" client meeting.

## How it ships — pilot gate

| Option | Description | Selected |
|--------|-------------|----------|
| Shadow mode | Runs nightly, flags to Liam only, flip a switch to go live | |
| Live with "still testing" label | Flags in team message immediately, marked beta | |
| Manual-only for now | Doesn't run on cron until validated | |

**User's choice:** Free-text — ship it **live from day one**, no shadow gate.
**Notes:** Reasoning: it's a soft nudge to get people to look, not a source of truth, so a wrong
flag costs little — as long as it's easy to go back and tune. Wants to test examples and call
things out during the build. Consciously relaxes the literal ROADMAP MEET-04 pilot wording
(owner decision).

## Coverage window — how close must the booking be?

| Option | Description | Selected |
|--------|-------------|----------|
| Same day only | Covered only if booked on that client on the meeting day | ✓ |
| Within a day or two | Covered if booked ±1 day | |
| Anywhere that week | Covered if booked on that client anywhere in the week | |

**User's choice:** Free-text confirming **same day only** — "if I didn't have anything productive
[on FDC that day], it should have been flagged, even though I was on it the day before."
**Notes:** Validated live: 26 May FDC meeting had no same-day FDC booking (booking was the 25th) →
worth a look. 3 Jun FDC catch-up had a 6h same-day FDC booking → covered.

## Labelling spike — sample & method

| Option | Description | Selected |
|--------|-------------|----------|
| ~3-4 weeks, all 3, in chat | Pull 3-4 weeks all designers; Liam labels in a table here | ✓ |
| ~2 weeks, just me first | Smaller, Liam-only first | |
| Bigger — 6-8 weeks, all 3 | Wider net for rare meeting types | |

**User's choice:** ~3-4 weeks, all 3, in chat.

## Calendar read — work-hours window

| Option | Description | Selected |
|--------|-------------|----------|
| 9:00–17:00 | Standard 9-to-5 | |
| 8:30–17:30 | Slightly wider to catch genuine early/late work meetings | ✓ |
| Don't use a time window | Lean on labelling/ignore-list instead | |

**User's choice:** 8:30–17:30.
**Notes:** Other exclusions (declined / all-day / OOO / solo / recurring-expansion) treated as
settled defaults.

## Card surfacing — where flags appear

| Option | Description | Selected |
|--------|-------------|----------|
| Nested under the designer | 🔍 sub-line under the designer row (like tentative/brief lines) | ✓ |
| Separate "Worth a look" section | Dedicated grouped section after the rows | |

**User's choice:** Nested under the designer — **with a calendar icon (📅)** instead of 🔍.
**Notes:** Line links to the Calendar event. 📅 distinct from 📄 brief and ⚠️ tentative.

## The other two designers

| Option | Description | Selected |
|--------|-------------|----------|
| Same as me | One shared rule set, spike just confirms | |
| Mostly same, spike will tell | Treat same; spike surfaces per-designer quirks | ✓ |
| They differ — let me explain | Something specific differs | |

**User's choice:** Mostly same, spike will tell.

---

## Claude's Discretion

- `googleapis` JWT + DWD subject-impersonation wiring; the new `src/calendar/` source layer; how a
  calendar-read failure threads into the existing degrade-don't-throw / 🤖 path.
- The fuzzy title→client matching algorithm details (pinned by the spike).

## Deferred Ideas

- LLM fuzzy-meeting adjudication → Phase 5.
- Idempotency + run logging for the calendar source → Phase 6.
- A formal shadow/pilot toggle → declined, revisit only if live false positives prove noisy.
- Time-of-day/booked-block matching → impossible (bookings are day-granular); same-day client
  matching is the deliberate substitute.
