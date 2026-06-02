# Feature Research

**Domain:** Nightly team-resourcing / capacity nudge digest bot (design studio) delivered to Google Chat
**Researched:** 2026-06-02
**Confidence:** HIGH on Google Chat formatting (official API docs verified); MEDIUM on digest/nudge design patterns (cross-source synthesis from standup-bot + alert-fatigue + PSA-resourcing literature, no direct competitor for this exact niche)

---

## Context: why the usual playbook only half-applies

The standup-bot market (Geekbot, Dailybot, Standuply, Steady) is **async status collection** — it asks humans questions and aggregates answers. This project is the inverse: it **reads systems of record (Productive + Calendar), does the thinking itself, and tells PMs what to fix.** So "table stakes" here is borrowed from two different families:

1. **Daily digest bots** — scheduled, scannable, consolidated, posts to a channel.
2. **Monitoring/alerting systems** — derive a signal, attach context, only escalate what's actionable, degrade gracefully when a data source is down.

The alert-fatigue literature is the most load-bearing input: the entire value of this bot collapses if PMs start ignoring it. Every feature decision below is filtered through "does this keep the message trusted and read?"

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the message feels broken, untrustworthy, or gets muted.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Per-designer next-day capacity (available vs booked)** | This is the core question. "Is tomorrow full?" | MEDIUM | Deterministic: 7.5h − time-off = available; sum bookings = booked. Numbers must be exact. Already in PROJECT.md. |
| **Names the underbooked designer + the gap in hours** | Vague alerts get ignored; "actionable copy" is the #1 anti-fatigue rule | LOW | "Maya has 3.5h open tomorrow" not "someone may be light." |
| **Studio rest-of-week rollup** | A single number that says "how worried should I be this week" | MEDIUM | "10 of 40 studio hours still unfilled Wed–Fri." One figure, top of message. |
| **Missing-brief flag (existence check)** | A booked-but-unbriefed slot is a hidden gap — designer arrives, can't start | LOW–MEDIUM | Existence only per PROJECT.md (has task + "briefed"). Not quality. |
| **Unaccounted-meeting flag** | Meetings that aren't in Productive silently eat capacity | HIGH | The hard one. Needs reconciliation nuance + known-overhead exclusions (WIP, creative-team mtg). LLM judgment + deterministic guardrails. |
| **Always posts (incl. positive "all clear" note)** | A bot that goes silent can't be trusted — silence is ambiguous (good night? or broken?) | LOW | Explicit PROJECT.md requirement. Silence = "did it run?" anxiety. |
| **Tentative bookings counted but visibly flagged** | A tentative hour is real-but-shaky; hiding the distinction misleads | MEDIUM | Count toward total, mark distinctly (icon / "(tentative)"). |
| **Scannable structure — headline first, detail below** | Digests are skimmed in 3 seconds in a busy channel | LOW | Inverted pyramid: verdict → per-designer → studio week. |
| **Deep-links back to Productive / Calendar** | "Rich context shortens time to resolution" — PM must act in one click | LOW–MEDIUM | Link the job/booking/calendar, not just name it. Reduces friction to fix. |
| **Refers to jobs/briefs, not PMs by name** | Collective nudge, not blame — keeps the room safe and the bot welcome | LOW | Explicit PROJECT.md requirement. Frame as "thin jobs," never "Sarah forgot." |
| **Reliable scheduled run, weekdays ~4:30pm** | A nudge that lands after people leave is useless | LOW–MEDIUM | GitHub Actions cron. Friday looks ahead to Monday. |
| **Degraded-mode message on data-source failure** | Never silently skip; say what it couldn't reach | MEDIUM | "Couldn't reach Calendar — capacity figures may miss meetings." Partial > nothing. |

### Differentiators (Competitive Advantage)

This is where the project's real edge lives — the things generic standup/resourcing tools don't do, and where Liam's on-brand instinct pays off.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **On-brand Cards v2 presentation** | Off-the-shelf bots look like robots. This looks like the studio made it — earns attention | MEDIUM | Card header w/ logo + colored section accents + icons. Verified available (see Google Chat section). The studio's actual differentiator vs. a plain Slack reminder. |
| **LLM-written, human voice (deterministic numbers)** | Reads like a thoughtful colleague, not a Jira webhook. Drives action via tone | MEDIUM–HIGH | Numbers from code, prose from LLM. The "writing" requirement in PROJECT.md. Big lever on whether it's read. |
| **Meeting reconciliation with judgment** | The genuinely hard, genuinely valuable bit — catches the gaps a human would miss | HIGH | LLM matches fuzzy calendar events to bookings, excludes known overhead, flags only real surprises. Most likely source of false positives → biggest trust risk. |
| **Quiet-good-night variant (short positive note)** | All-clear nights get one upbeat line, not a full audit — preserves signal | LOW | Not silence (anti-feature) but brevity. Length signals severity: short=good, long=needs work. |
| **Severity-graded message length/visual weight** | The shape of the message tells you how worried to be before you read a word | MEDIUM | Calm green all-clear vs. amber "two things to sort." Visual triage. |
| **Single source-of-truth framing (Productive time-off)** | One trusted number per designer, no arguing with the bot | LOW | PROJECT.md decision. Reduces "the bot's wrong" pushback. |
| **Friday→Monday look-ahead** | Respects the work rhythm; nobody wants a Saturday gap flagged | LOW | Already specified. Small touch, big "this gets us" effect. |

### Anti-Features (Commonly Requested, Often Problematic)

Documented to defend v1 focus. Several are already correctly out-of-scope in PROJECT.md; included here with the *why* so they stay out.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Brief quality analysis** | "While we're checking briefs exist, check they're good" | Massive scope jump; subjective; needs a different tool. Drags v1 into NLP-on-briefs | Existence check only (PROJECT.md). Separate future tool. |
| **Historical trends / dashboard / analytics** | "We could chart utilization over time" | Value is the nightly nudge, not BI. Builds a product nobody asked to maintain | Stay ephemeral. PROJECT.md already excludes. |
| **Interactive buttons (approve/snooze/assign-from-card)** | Cards support buttons; feels powerful | Webhooks **cannot** handle clicks — requires a full Chat app + hosted endpoint + OAuth, killing the "no server" constraint | Deep-links to Productive/Calendar instead. Action happens in the system of record. |
| **@-mentioning the responsible PM** | "Make sure the right person sees it" | Turns a collective nudge into public blame; erodes the safe tone; people game/mute it | Name the job, not the person. Collective channel post. |
| **Per-user DMs / personalized routing** | Standup tools do this | Splits the signal, hides the collective picture, more auth surface | One channel post the whole studio sees. |
| **Multiple sends / reminders / escalation chain** | "Nudge again if not fixed" | Pure fatigue engine; the literature says fewer notifications wins | One well-timed post per weekday. Trust the once. |
| **Tracking the 2 fluid creatives to 7.5h** | "Be consistent, track everyone" | Their time is irregular by design; flagging them = constant false noise | Only the 3 designers (PROJECT.md). |
| **Reconciling the daily WIP / creative-team meeting** | "All meetings eat capacity" | Known recurring overhead; flagging it every day trains people to ignore the meeting section | Hard-exclude known overhead (PROJECT.md). Only ad-hoc/client meetings. |
| **LLM doing the hour arithmetic** | "The LLM can just total it up" | One wrong sum and the team stops trusting every number forever | Deterministic code for all maths (PROJECT.md). LLM never touches figures. |
| **Weekend runs** | "Run every day for completeness" | Studio doesn't work weekends; Saturday alerts = noise | Weekdays only; Friday handles the Monday look-ahead. |
| **Configurable everything (thresholds, targets, recipients via UI)** | "Make it flexible" | Premature config for a 3-person, single-studio tool; YAGNI | Hardcode/constants in v1. Three designers, 7.5h, one channel. |

---

## Message / Content Design (Q2)

Recommended structure — **inverted pyramid, severity-graded**. PMs skim top-down and stop when satisfied.

```
┌─ HEADER ────────────────────────────────────────────┐
│  [studio logo]  Evening Studio Check-in · Tue 3 Jun   │
│  Looking at: Wednesday 4 Jun                          │  ← header / subtitle
├─ VERDICT (1 line, color-coded) ──────────────────────┤
│  🟢 All sorted for tomorrow — nice one.               │  ← or 🟡 "2 things to sort before tomorrow"
├─ STUDIO WEEK (1 figure) ─────────────────────────────┤
│  Rest of week: 10 of 40 studio hours still open       │  ← one number, the worry-gauge
├─ PER-DESIGNER (only those needing attention up top) ──┤
│  Maya      3.5h open · [open in Productive →]          │  ← decoratedText rows
│  Tom       Full ✓                                     │
│  Priya     Full, but 1 booking unbriefed [job →]       │
├─ FLAGS (grouped, only if present) ───────────────────┤
│  Briefs missing (1): "Acme rebrand" booking [→]       │
│  Unaccounted meetings (1): Tom has a 2h client call    │
│    Wed not reflected in bookings [calendar →]          │
└──────────────────────────────────────────────────────┘
```

**Ordering rationale**
1. **Verdict line** — answers "do I need to do anything?" instantly. Color carries it.
2. **Studio week number** — the single gauge for "how bad is the week."
3. **Per-designer** — surface those with open time / issues; "Full ✓" for the rest so the bot is seen to have checked them (trust).
4. **Flags grouped by type** (briefs, meetings) — not interleaved per designer, so a PM fixing all briefs does it in one pass.

**How to show each signal clearly**
- **Underbooked:** name + exact open hours + deep-link. Never "underutilized" (jargon) — say "3.5h open."
- **Rest-of-week capacity:** one fraction ("X of Y hours open"), optionally a per-day mini-breakdown only if non-trivial. Resist a table.
- **Missing brief:** name the *job/booking*, link it, state which check failed (no task vs. not marked briefed) so the PM knows the one action.
- **Unaccounted meeting:** name designer + the meeting + duration + "not in bookings," link the calendar event. Phrase as a question-flag, not an accusation — these are the LLM's judgment calls and most prone to false positives, so soften ("looks like… worth checking").
- **Tentative:** inline marker on the hours it contributes ("6.5h booked, incl. 2h tentative").

**Length = severity (a feature, not an accident).** Good night = 2–3 lines. Busy night = the full card. The shape itself communicates before anyone reads.

---

## Google Chat Presentation (Q3) — VERIFIED against official docs

**Webhook vs. Chat app — the decision that shapes the whole project:**

| Capability | Incoming Webhook | Full Chat App |
|------------|------------------|---------------|
| Post text + **`cardsV2`** | ✅ Yes (verified — webhook payload supports `text`, `cardsV2`, `accessoryWidgets`) | ✅ Yes |
| Branding (logo, colors, icons, sections) | ✅ Yes (cards work over webhooks) | ✅ Yes |
| Buttons that *do something* (clicks/dialogs) | ❌ No — webhooks aren't conversational | ✅ Yes |
| Slash commands / replies / interactions | ❌ No | ✅ Yes |
| Hosting / OAuth required | ❌ No (just a URL + secret) | ✅ Yes (endpoint + app config) |
| Rate limit | ~1 req/sec per space | Higher |
| Max message size | 32,000 bytes (both) | 32,000 bytes |

**Verdict for this project: incoming webhook is sufficient and correct.** Webhooks *can* send fully-branded Cards v2 — this is the crucial, often-misremembered fact. The only thing webhooks lose is interactive buttons, which is an anti-feature here (we deep-link instead). Webhook keeps the "no server" constraint intact. **HIGH confidence** — confirmed by the Cards v2 API reference and webhook guide.

**Formatting actually available:**

*Plain text messages* use Markdown-like syntax: `*bold*`, `_italic_`, `~strike~`, `` `mono` ``, ` ```block``` `, `* bullets`, `>quote`, links `<url|label>`, mentions `<users/ID>`.

*Card messages (Cards v2)* — the on-brand path — support:
- **Card header**: title, subtitle, image (logo) — instant branding.
- **Sections** (optionally collapsible) to group verdict / week / designers / flags.
- **decoratedText**: the workhorse row — leading/trailing icon, top-label, main text, bottom-label, optional button. Perfect for "Maya · 3.5h open · [→]".
- **Icons**: built-in material icons or custom HTTPS icon — carry status (✓ / ⚠) cheaply.
- **Columns**: max **2** columns. For more, use **Grid**. (Don't over-grid a notification.)
- **Images**: HTTPS `.png`/`.jpg` only.
- **Buttons / chips**: render fine, but clicks need a Chat app → use as **link buttons** (open URL) only.
- **Dividers** between sections.
- **Font color** inside card text via `<font color="#…">` HTML subset — enables brand accent / status color.

**Practical limits:** max **100 widgets** per card (a section that pushes past 100 — and everything after — is silently dropped; for 3 designers we're nowhere near). Max message **32,000 bytes**. Card text uses a small **HTML subset** (`<b> <i> <u> <s> <font color> <a> <ul/ol/li> <code> <pre>`), *not* Markdown — easy footgun if you mix the two.

**On-brand without noise — recommendations:**
- One header with logo + a single accent color that shifts with severity (calm/green vs. amber). Don't rainbow it.
- Icons for status, not decoration. One per row max.
- Whitespace via dividers and sections beats dense tables — a notification, not a report.
- Skip images/grids in the body; they add bytes and visual noise for no signal.
- Keep it to one card. Collapsible sections hide detail on good nights.

---

## Tone / Voice (Q4)

The bot must drive action without finger-pointing. Synthesis of alert-fatigue ("actionable copy, fewer alerts") + the project's collective-nudge mandate:

- **Address the studio, name the work.** "Wednesday's looking a bit light on the Acme job" — never "Sarah didn't book Acme."
- **Lead with the action, not the problem.** "Worth getting a brief on the Acme booking before tomorrow" beats "brief missing."
- **Calibrate warmth to severity.** Good night: genuinely warm and brief ("All sorted — see you tomorrow"). Busy night: still friendly, but crisp and itemized.
- **Soften the LLM's judgment calls.** Reconciled meetings are guesses — hedge ("looks like…", "worth checking") so a false positive costs trust-points, not credibility.
- **Specific > generic, always.** Numbers, job names, hours. Vagueness is what trains people to mute.
- **No nagging, no escalation, no guilt.** One post, said once, plainly. The literature is unanimous: fewer, richer notifications win.
- **Consistent persona.** A calm, organized studio colleague — the "evening check-in" framing. Liam's brand instinct is the asset here; lean on it.

---

## Reliability / UX Features (Q5)

| Feature | Recommendation | Rationale | Complexity |
|---------|----------------|-----------|------------|
| **Always-post vs quiet-on-good-night** | **Always post, but length=severity.** Short positive note on good nights. | Silence is ambiguous (good? or broken?). A short note confirms "ran + all clear." PROJECT.md aligned. | LOW |
| **Degraded mode** | Post a partial message naming the unreachable source + what's now uncertain. Never skip. | Partial truth > silence. "Couldn't reach Calendar — meeting checks skipped tonight; capacity below may miss meetings." | MEDIUM |
| **Deep-links** | Link every named thing — designer's resourcing view, the booking/job, the calendar event. | Cuts time-to-fix; the PM acts in one click. Replaces the interactive buttons we can't have. | LOW–MEDIUM |
| **Run timing** | Weekdays ~4:30pm; Fri targets Mon. Pick a time people are still at desks but late enough that the day's bookings are settled. | A nudge after everyone's gone is wasted. | LOW |
| **Run-confirmation / observability** | The always-post itself is the heartbeat — if no post lands, something's wrong. Consider a fail-safe alert to Liam if the job throws. | No separate monitoring needed for v1; absence of the daily post is the signal. | LOW |
| **Idempotency / no double-post** | One run per weekday; guard against cron re-fires. | A duplicate erodes the "trustworthy" feel. | LOW |
| **Templated fallback** | If LLM-on-Pro route fails, deterministic templated message ships the same data. | PROJECT.md "swappable render layer." Bot still posts numbers even if prose fails. | MEDIUM |

---

## Feature Dependencies

```
Per-designer capacity (deterministic maths)
    └──requires──> Productive data pull (bookings, tasks, briefed flag, time-off)

Studio rest-of-week rollup
    └──requires──> Per-designer capacity

Missing-brief flag
    └──requires──> Productive data pull (task + briefed status)

Unaccounted-meeting flag
    └──requires──> Google Calendar pull (3 calendars)
    └──requires──> Booking data (to reconcile against)
    └──requires──> Known-overhead exclusion list (WIP + creative mtg)
    └──enhanced-by──> LLM judgment (fuzzy match) ──fallback──> deterministic match

On-brand Cards v2 message
    └──requires──> Google Chat webhook delivery
    └──requires──> All flags + capacity computed

LLM-written prose
    └──requires──> Computed numbers (LLM never computes them)
    └──fallback──> Templated deterministic message

Always-post + degraded mode
    └──requires──> Per-source success/failure tracking in the pipeline

Deep-links ──enhances──> every named flag

Interactive buttons ──CONFLICTS──> Webhook delivery (would force a Chat app + server)
LLM arithmetic ──CONFLICTS──> Trust requirement (must be deterministic)
@-mention PMs ──CONFLICTS──> Collective-nudge tone
```

### Dependency Notes
- **Everything downstream of the Productive pull**: capacity, briefs, and meeting reconciliation all need the booking/task data first — Productive integration is the foundational phase.
- **Meeting reconciliation is the deepest stack**: needs Calendar + bookings + exclusion rules + (ideally) LLM. Highest false-positive risk → flag for deeper research at its phase.
- **Card rendering depends on everything being computed** — it's the last layer; build the data pipeline before the presentation.
- **Buttons conflict with webhook delivery** — choosing webhook (correct) rules out interactive buttons. Resolved by deep-links.

---

## MVP Definition

### Launch With (v1)
- [ ] Productive pull: bookings, linked task + "briefed" status, time-off (3 designers) — foundation for everything
- [ ] Deterministic per-designer next-day capacity (7.5h − time-off vs booked) — the core question
- [ ] Studio rest-of-week rollup (one figure) — the worry-gauge
- [ ] Tentative bookings counted + flagged — accuracy of the headline number
- [ ] Missing-brief flag (existence only) — a real hidden gap, low cost
- [ ] Calendar pull + unaccounted-meeting flag with known-overhead exclusions — the hard differentiator; degrade gracefully if it's flaky
- [ ] On-brand Cards v2 message over webhook (verdict → week → designers → flags) — the reason it gets read
- [ ] Always-post incl. short positive note + degraded-mode message — trust
- [ ] Deep-links to Productive/Calendar — turns the nudge into one-click action
- [ ] Weekday ~4:30pm scheduled run, Fri→Mon — usefulness
- [ ] Templated deterministic fallback if LLM route fails — ships regardless

### Add After Validation (v1.x)
- [ ] LLM-written prose layer — trigger: webhook+card pipeline proven and trusted; numbers solid. (Could even launch templated and add voice after.)
- [ ] Per-day rest-of-week breakdown — trigger: PMs ask "which day is light?"
- [ ] Severity-driven accent color theming polish — trigger: base card shipped and read

### Future Consideration (v2+)
- [ ] Brief *quality* analysis — defer: separate tool, big scope (PROJECT.md)
- [ ] Any historical/trend view — defer: not the value; risks product creep
- [ ] Interactive buttons / Chat app migration — defer: only if a genuine in-chat action emerges that deep-links can't serve; costs the no-server constraint

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Productive pull (bookings/tasks/briefed/time-off) | HIGH | MEDIUM | P1 |
| Per-designer next-day capacity | HIGH | MEDIUM | P1 |
| Studio rest-of-week rollup | HIGH | MEDIUM | P1 |
| Tentative counted + flagged | MEDIUM | MEDIUM | P1 |
| Missing-brief flag (existence) | HIGH | LOW–MEDIUM | P1 |
| On-brand Cards v2 over webhook | HIGH | MEDIUM | P1 |
| Always-post + positive note | HIGH | LOW | P1 |
| Degraded-mode message | HIGH | MEDIUM | P1 |
| Deep-links | HIGH | LOW–MEDIUM | P1 |
| Scheduled weekday run (Fri→Mon) | HIGH | LOW–MEDIUM | P1 |
| Templated fallback | MEDIUM | MEDIUM | P1 |
| Unaccounted-meeting flag (reconciliation) | HIGH | HIGH | P1 (highest-risk P1) |
| LLM-written prose | MEDIUM–HIGH | MEDIUM–HIGH | P2 |
| Per-day week breakdown | MEDIUM | LOW | P2 |
| Severity color theming polish | MEDIUM | LOW | P2 |
| Brief quality analysis | HIGH (later) | HIGH | P3 |
| Trends/dashboard | LOW | HIGH | P3 |
| Interactive buttons / Chat app | LOW (here) | HIGH | P3 |

**Note on the one risky P1:** unaccounted-meeting reconciliation is must-have for value but carries the highest false-positive/trust risk. It should be the most heavily researched and tested phase, and is the prime candidate to ship behind degraded-mode (skip-and-flag) if Calendar reconciliation proves unreliable.

---

## Competitor Feature Analysis

No direct competitor exists for "agency studio nightly resourcing nudge to Google Chat." Closest analogues:

| Feature | Standup bots (Geekbot/Dailybot) | PSA resourcing (Productive/Runn/Forecast) | Our Approach |
|---------|-------------------------------|------------------------------------------|--------------|
| How it gets data | Asks humans (async check-in) | Humans read dashboards/heatmaps | Reads systems of record, decides, tells | 
| Capacity signal | Not really — status, not hours | Allocation heatmaps, util % (70–85% target) | Exact next-day hours, plain language, named |
| Delivery | Channel digest, configurable | In-app dashboard + email alerts | One on-brand Google Chat card, nightly |
| Tone | Templated/neutral | Corporate/jargon ("utilization") | Friendly studio voice, collective nudge |
| Actionability | Links to thread | Click into planner | Deep-links to the exact booking/job/event |
| Noise control | Often over-notifies | Real-time alerts can spam | One post/weekday, length=severity, always-post |

Our edge = **decides for the PM (not asks)** + **plain hours not util%** + **on-brand voice** + **one well-timed post**.

---

## Sources

- Google Chat — Format messages (text Markdown vs. card HTML subset): https://developers.google.com/workspace/chat/format-messages — HIGH
- Google Chat — Cards v2 API reference (widgets, sections, decoratedText, columns max 2, grid, 100-widget limit): https://developers.google.com/workspace/chat/api/reference/rest/v1/cards — HIGH
- Google Chat — Webhooks quickstart (one-way, non-conversational, no interaction handling): https://developers.google.com/workspace/chat/quickstart/webhooks — HIGH
- Confirmation webhooks support `text` + `cardsV2` + `accessoryWidgets`, 32KB message limit: SES Google Chat Webhook guide cross-checked w/ official Cards v2 ref — MEDIUM→HIGH (verified against official ref)
- Standup/digest bot landscape (Geekbot, Dailybot, Standuply, Steady — async collection model): https://geekbot.com/blog/slack-standup-bot/ , https://www.dailybot.com/ — MEDIUM
- Resource overbooking/underutilization alerting + 70–85% util benchmark: https://birdviewpsa.com/blog/prevent-resource-overbooking/ , https://www.runn.io/blog/overutilization — MEDIUM
- Alert/notification fatigue — actionable copy, fewer alerts, digests over per-event, only-when-action-required: https://www.datadoghq.com/blog/best-practices-to-prevent-alert-fatigue/ , https://www.suprsend.com/post/alert-fatigue , https://kissflow.com/workflow/bpm/how-to-design-workflow-notifications-without-causing-alert-fatigue/ — MEDIUM

---
*Feature research for: nightly design-studio resourcing nudge bot → Google Chat*
*Researched: 2026-06-02*
