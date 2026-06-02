# Pitfalls Research

**Domain:** Nightly unattended automation — Productive.io resourcing + Google Calendar -> capacity logic -> LLM judgment/writing -> Google Chat, on GitHub Actions cron, built by a designer learning to code
**Researched:** 2026-06-02
**Confidence:** HIGH on infra/API gotchas (verified against official docs); HIGH on the LLM-on-Pro ToS issue (verified, recent enforcement); MEDIUM on Productive's exact "briefed" representation (org-specific custom convention — must be discovered, not assumed)

## Critical Pitfalls

### Pitfall 1: Running an LLM on the Claude Pro subscription from an unattended job (ToS violation + account-ban risk)

**What goes wrong:**
The whole project depends on driving the Pro subscription's LLM from a headless GitHub Actions run. Anthropic's Consumer Terms prohibit using Free/Pro/Max OAuth credentials in any third-party product, tool, or service — including the Agent SDK and any "harness" that pilots a web/subscription account programmatically. In January 2026 Anthropic actively cracked down on exactly these harnesses (OAuth-token-driven automation) and built ongoing detection for them. Consequences range from the run silently failing to the *person's* Claude account being suspended.

**Why it happens:**
The org blocks API-key creation (per PROJECT.md), so the Pro subscription looks like the only LLM route. It technically "works" in early testing because detection is probabilistic and bans lag. The designer-developer reasonably assumes "I pay for Pro, I can use it however." The exemption that *does* exist (Claude Code CLI on your own machine for scripted use) does NOT extend to an unattended server using exported OAuth tokens.

**How to avoid:**
Treat the LLM layer as genuinely optional and the templated fallback as the real v1. Architect so the deterministic templated message is the default code path, and the LLM is a swappable enhancement (already a Key Decision — enforce it ruthlessly). For the LLM itself, prefer a route with no automation restrictions: (a) a low-cost commercial API key from a different provider the org doesn't block, (b) a flat-rate automation-friendly model service, or (c) accept templated-only for v1 and revisit. Do NOT export the Pro OAuth token into GitHub Actions secrets. If the org genuinely forbids all API keys, the honest answer to the roadmap is "ship templated; the LLM polish is blocked by policy."

**Warning signs:**
- Any design that copies a `~/.claude` token / OAuth credential into a CI secret.
- "It works when I run it locally with Claude Code" but the deployment plan is unattended cron.
- Login challenges, sudden auth failures, or rate-limit/usage-cap errors appearing only on the automated runs.

**Phase to address:**
Earliest planning phase (architecture/decision) — this decides whether the LLM layer exists at all. Build the templated path FIRST as a standalone deliverable; gate the LLM layer behind a separate, later phase that can be cut without affecting ship.

---

### Pitfall 2: Assuming "briefed" is a standard Productive API field (it isn't)

**What goes wrong:**
The booking data model returned by the API has no native `briefed` status. A booking has `service_id`, optional `task_id`, `person_id`, `draft`, `approval_status`, `hours`, `started_on`, `ended_on`. The "briefed" concept the studio uses is almost certainly an *org-specific convention*: a custom field on the booking or task, a workflow status, a task label/tag, or even just "a task is attached at all." Code written against an assumed `briefed` boolean will compile, return null/false for everything, and silently flag every booking as un-briefed — destroying trust on night one.

**Why it happens:**
PROJECT.md describes the workflow in human terms ("the booking can be marked briefed") which maps cleanly to an imagined field. The user explicitly warns their booking conventions are non-obvious. Productive's flexible custom-field model means two agencies implement "briefed" completely differently.

**How to avoid:**
Before writing any capacity logic, do a *discovery spike*: pull 20-30 real bookings for the three designers with `include` of task, service, and custom fields, and manually inspect the JSON against what the PMs see in the UI. Identify exactly what "briefed" maps to (custom field id? task workflow status? presence of `task_id`?). Document the mapping as a named constant. The requirement is only an existence check ("brief exists and is marked briefed"), so the goal is just to find the one field/relationship that encodes it.

**Warning signs:**
- Code references a `booking.briefed` attribute that doesn't appear in raw API responses.
- Every booking flags as un-briefed (or none do) in early tests.
- Disagreement between what the script reports and what a PM sees in the Productive UI.

**Phase to address:**
Productive integration / data-discovery phase — before capacity logic. Make "confirmed mapping of briefed + booking->task link, validated against the live UI" an explicit success criterion.

---

### Pitfall 3: Letting the LLM do the arithmetic (non-determinism in the numbers)

**What goes wrong:**
If hours, availability, "10 of 40 studio hours unfilled," or under-booked flags are computed by the LLM, the numbers drift run-to-run, occasionally hallucinate, and quietly contradict Productive. The team notices once, stops trusting the message, and the tool is dead — exactly the failure mode PROJECT.md calls out.

**Why it happens:**
It's tempting to hand the LLM the raw bookings and ask it to "summarize capacity" because it's less code. LLMs are confidently wrong at multi-step arithmetic and aggregation.

**How to avoid:**
Hard architectural boundary (already a Key Decision): all capacity math — 7.5h minus time-off, booked vs available, tentative-hours handling, week rollup, Friday->Monday — lives in plain deterministic code with unit tests. The LLM receives *pre-computed numbers and structured flags* and only does (a) the meeting-reconciliation judgment and (b) prose. The LLM must never be the source of a number that appears in the message. Pass numbers as literals it must echo verbatim, and ideally re-validate that the rendered message's numbers match the computed ones before posting.

**Warning signs:**
- Prompts that include raw booking arrays and ask for totals/sums.
- The same input producing different reported hours on re-run.
- Numbers in the Chat message that don't match a hand-check against Productive.

**Phase to address:**
Capacity-logic phase (built before any LLM integration) and the message-rendering phase (validate numbers survive the LLM unchanged).

---

### Pitfall 4: GitHub Actions cron drift, DST, and the silent 60-day disable

**What goes wrong:**
Three compounding scheduling failures: (1) GitHub cron is UTC-only, so a fixed UTC time lands at a different local clock time across daylight-saving changes — a "4:30pm local" trigger silently shifts by an hour twice a year. (2) GitHub queues scheduled jobs and can delay them by many minutes (sometimes 30-60+) under load, and may drop runs entirely during high-demand windows. (3) On a repo with no commits for 60 days, GitHub auto-disables the scheduled workflow — and it disables silently, so the nightly message just stops with no error.

**Why it happens:**
Cron looks deterministic. The UTC/DST mismatch isn't visible until the clocks change. The 60-day rule bites precisely because a finished, stable automation gets no new commits — success causes the failure.

**How to avoid:**
- Don't pin to one UTC cron expecting exact local time. Either compute the target window in code from the *current* local date (Australia/locale tz), or schedule two crons bracketing the desired local time and let the job no-op if it's already run. Don't hardcode the DST offset.
- Treat "around 4:30pm" as a tolerance, not a guarantee; never build logic that assumes precise firing time.
- Add a keepalive (a small scheduled commit/API touch every ~45 days, or a maintained keepalive action) to defeat the 60-day disable. Add a weekday guard in code (skip weekends) rather than relying solely on cron day-of-week.

**Warning signs:**
- The message arrives an hour off after a DST boundary.
- Runs appear in the Actions log with large queue delays.
- The nightly post just stops and there's no failed-run notification.

**Phase to address:**
Scheduling/deployment phase. Success criterion: documented tz handling, a weekday guard in code, and a keepalive mechanism.

---

### Pitfall 5: Runs failing silently — no message and nobody knows

**What goes wrong:**
A token expires, an API 500s, the calendar scope is wrong, or the workflow is disabled — and the team simply gets no evening message. Because the *absence* of a message looks the same as "quiet night," the failure is invisible for days. PROJECT.md explicitly requires "never silently skips a night" and a degraded message naming what it couldn't reach.

**Why it happens:**
Cron jobs fail quietly by nature; a failed GitHub Action just shows red in a tab nobody watches. The happy path is built and tested; the "data source down" path is an afterthought.

**How to avoid:**
Make "always post something" a first-class requirement, not error handling bolted on later. Wrap each data source in try/catch; on partial failure, post a degraded Chat message that names the unreachable source (and still reports what succeeded). On *total* failure (can't even build a message), have the workflow post a minimal "the check-in couldn't run tonight" alert — e.g. a fallback step with `if: failure()` hitting the Chat webhook directly. Separately route run failures to somewhere a human sees them (the webhook itself, or email).

**Warning signs:**
- Error handling that `return`s/`exit`s before posting.
- No test for "Productive is down" / "Calendar auth failed."
- The only failure signal is a red checkmark in the Actions UI.

**Phase to address:**
Delivery/resilience phase, but the "always post" contract should shape the architecture from the start (the message-builder must accept partial data).

---

### Pitfall 6: Wrong/over-noisy/finger-pointing messages that kill adoption

**What goes wrong:**
Three distinct adoption-killers: (a) a single wrong number erodes trust permanently; (b) flagging things that are actually fine (false-positive meeting flags, flagging known WIP/creative-team meetings, flagging legitimately part-time days) trains people to ignore the message; (c) tone that blames PMs by name makes it political and gets it muted. PROJECT.md is explicit: name the designer with open time, refer to thin jobs/briefs — NOT the PMs.

**Why it happens:**
Meeting reconciliation is genuinely fuzzy (an ad-hoc meeting may or may not correspond to a booking). The known-overhead meetings (daily 15-min WIP, creative-team meeting 3x/week) look like un-reconciled meetings unless explicitly excluded. Designers' real availability varies. Blame-tone creeps in when the message is generated from "X didn't do Y" framing.

**How to avoid:**
- Bias meeting reconciliation toward NOT flagging — a false negative (missed flag) is far cheaper than a false positive that erodes trust. Hard-exclude the known recurring overhead meetings by title/pattern before reconciliation.
- Encode tone constraints in the LLM prompt AND the templated fallback: subject is jobs/briefs/open-time, never a PM's name; collective-nudge framing.
- Always post a positive note on clean nights (required) so the channel isn't only-bad-news.
- Validate against a few real evenings with the team before going daily — does the team agree with every flag?

**Warning signs:**
- The team starts muting or ignoring the channel.
- Flags that the team waves off as "that's fine / that's known."
- Any message that reads as "PM didn't book/brief X."

**Phase to address:**
Reconciliation-logic phase (false-positive suppression, overhead exclusion) and message-rendering phase (tone). Pilot/validation gate before daily rollout.

---

### Pitfall 7: Timezone & working-day edge cases (Friday->Monday, holidays, DST, week boundaries)

**What goes wrong:**
The capacity logic targets "next working day." If working-day arithmetic is naive: Friday should look ahead to Monday (skip the weekend) — a simple +1 day breaks this. Public holidays make the "next working day" not always the next weekday. Week boundaries ("rest of this week") need a defined start (Mon?) and must not leak weekend days. DST transitions can make a "day" 23 or 25 hours and shift event timestamps. Calendar events come back in various timezones / as UTC and naive comparison double-counts or mis-buckets them.

**Why it happens:**
Date math is deceptively hard and the happy-path (a normal Tuesday) hides all of it. Holidays especially are invisible until one occurs in production.

**How to avoid:**
- Use a real date/time library with explicit timezone handling; pin one canonical local timezone for all bucketing; convert all Calendar timestamps into it before comparing.
- Implement "next working day" explicitly: skip Sat/Sun, and skip a configurable public-holiday list. Define the week start explicitly for the "rest of this week" rollup.
- Unit-test the boundaries: a Friday run, a run the day before a public holiday, and a run across a DST change.

**Warning signs:**
- A Friday-evening message that targets Saturday.
- Hours off by exactly one hour around late-March/early-April or early-October (AU DST).
- Holiday eves reporting tomorrow as a normal working day.

**Phase to address:**
Capacity-logic phase. Success criterion: passing tests for Friday->Monday, holiday-eve, and a DST boundary.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode booking/calendar/person IDs in source | Fast to wire up | Breaks when a designer changes or a calendar moves; tempts committing real IDs | Only in a throwaway spike; move to config/secrets before any real run |
| Skip the Productive data-discovery spike, assume the data model | Start coding capacity logic sooner | Builds the whole pipeline on a wrong "briefed"/booking->task assumption; rework + lost trust | Never |
| Let LLM format numbers into prose without re-validation | Less code | A hallucinated/edited number ships unnoticed | Never for numbers; fine for non-numeric prose |
| Single UTC cron, hardcode the local offset | Trivial to set up | Silently wrong twice a year at DST | Never (use code-side tz or bracketing crons) |
| No degraded/"couldn't run" message path | Ships the happy path faster | Silent multi-day outages, killed trust | Never — it's an explicit requirement |
| Skip the pilot and go straight to daily | Faster to "done" | False positives train the team to ignore it before it earns trust | Never for v1 rollout |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Productive auth | Missing the dual-header auth | Send BOTH `X-Auth-Token` (Personal Access Token from Settings -> API integrations) AND `X-Organization-Id` on every request; set `Content-Type: application/vnd.api+json` (JSON:API spec). 403 = auth header problem. |
| Productive bookings | Forgetting tentative bookings are excluded by default | Tentative = `draft: true`; they don't affect scheduled hours unless requested. Use `with_draft`/`draft` filter to *include* them, then flag them as shaky (per requirement). Don't assume the default response contains them. |
| Productive bookings | Confusing budget bookings with absence bookings | Budget booking = work (`service_id`, optional `task_id`). Absence booking = time off (`event_id`, has approval_status). Time-off availability math must read absence bookings, not budget bookings. |
| Productive pagination | Reading only page 1 (default 30 records) | Default page size 30, max 200; iterate `page[number]` until `total_pages`. A designer with many bookings will silently truncate. Use `page[size]=200`. |
| Productive rate limits | Tight polling / report endpoints | 100 req / 10s and 4000 req / 30min general; report endpoints only 10 req / 30s. A once-nightly job is fine, but a paginating loop with includes can burst — add a small backoff. |
| Productive person matching | Matching people by name string across endpoints | Match by `person_id` (stable integer), never by display name. Names differ/repeat; calendar identity is email — keep an explicit person_id <-> calendar-email mapping in config. |
| Google service account | Expecting a service account to read user calendars by default | A service account can't see user calendars without **domain-wide delegation** authorized by a Workspace admin, with the Calendar scope (use read-only: `calendar.readonly` or `calendar.events.readonly`). The account then impersonates each user. |
| Google Calendar events | Not expanding recurring events | Pass `singleEvents=true` (and `orderBy=startTime`) so recurrences expand into instances; otherwise you get the master event, not the actual instances on the target day. |
| Google Calendar events | Counting declined / OOO / all-day events as work conflicts | Check the impersonated user's `responseStatus` and skip `declined`. Handle all-day events (date, not dateTime) and OOO/`outOfOffice` event types deliberately — don't treat them as meetings to reconcile. |
| Google Calendar timezones | Comparing event times naively | Events return tz-aware (or UTC) timestamps; convert all to the one canonical local tz before bucketing into a working day. |
| Google Chat webhook | Treating the webhook URL as non-secret | The webhook URL *is* the credential — anyone with it can post to the space. Store in GitHub secret, never log it, never commit it. |
| Google Chat Cards v2 | Overstuffing a card | 100-widget limit per card; if a section pushes past 100, that section and all following are silently dropped. Keep the evening card compact. |
| Google Chat message size | Very long generated message | 32,000-byte max per message. Unlikely for one studio but cap LLM output length defensively. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Paginating bookings with heavy `include` in a loop | Slow runs, occasional 429s | Use `page[size]=200`, request only needed includes, small backoff on 429 | Only if request volume grows; trivial at 3-5 people / once nightly |
| Re-fetching all calendars/bookings for full history | Slow, wasteful | Constrain by date window (the target working day + rest-of-week only) via `filter`/`timeMin`/`timeMax` | Grows with unbounded date ranges, not user count |

(Note: this is a tiny-scale, once-nightly job for 3-5 people. Real scale risk is near zero; the above are correctness/courtesy, not capacity, concerns. Do not over-engineer for scale.)

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Echoing the Chat webhook URL, Productive token, or service-account key in logs / error output | Anyone reading Actions logs can post to the space or hit Productive | Never `print`/log raw secrets or full request URLs; redact. Actions masks registered secrets but not values you reconstruct/concatenate. |
| Storing the Google service-account JSON key loosely | Full delegated calendar access to 3 staff | Store as a single GitHub secret; restrict delegation scopes to read-only calendar; rotate if exposed |
| Putting any Pro/OAuth Claude credential into CI | ToS violation + account suspension (see Pitfall 1) | Don't. Use an automation-permitted LLM route or templated-only |
| Committing real person/calendar/booking IDs or test dumps | Leaks org structure + identifiers; IDs in git history are hard to remove | Keep IDs in secrets/config; never commit API response dumps from the discovery spike |
| Over-broad service-account scopes | Larger blast radius if key leaks | Request only `calendar.readonly` (or events.readonly) in domain-wide delegation; nothing more |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Only-bad-news channel | Team mutes it | Always post a short positive note on clean nights (required) |
| False-positive flags (esp. known overhead meetings) | Team learns to ignore flags | Hard-exclude WIP + creative-team meetings; bias reconciliation toward not flagging |
| Naming/blaming PMs | Becomes political, gets muted | Frame around jobs/briefs/open-time and name the designer with capacity, never the PM |
| Numbers that don't match Productive | One mismatch = permanent distrust | Deterministic math + validate rendered numbers against computed numbers before posting |
| Wall-of-text card | Skimmed and ignored | Compact Cards v2 layout; lead with the one thing to fix |

## "Looks Done But Isn't" Checklist

- [ ] **"Briefed" detection:** Often built on an assumed field — verify the mapping against the live Productive UI for real bookings.
- [ ] **Tentative bookings:** Often missing from default API response — verify `with_draft`/`draft` is set AND they're flagged distinctly, not silently counted.
- [ ] **Friday run:** Often targets Saturday — verify Friday looks ahead to Monday and skips weekends/holidays.
- [ ] **Declined/all-day/OOO calendar events:** Often counted as meetings — verify they're filtered by `responseStatus` and event type.
- [ ] **Recurring meetings:** Often appear as one master event — verify `singleEvents=true` expansion.
- [ ] **Degraded path:** Often only the happy path is tested — verify a partial-failure message actually posts (kill one data source and run it).
- [ ] **DST:** Often off by an hour seasonally — verify behavior across a DST boundary, not just on the day you built it.
- [ ] **60-day disable:** Often forgotten — verify a keepalive exists so a stable repo doesn't get its cron silently switched off.
- [ ] **Secrets in logs:** Verify webhook URL and tokens never appear in run output.
- [ ] **LLM is truly optional:** Verify the system produces a correct message with the LLM layer entirely disabled.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pro-subscription LLM route blocked/banned | LOW (if architected right) | Flip to templated fallback (already the default path); decouples ship from the LLM decision |
| Wrong "briefed" mapping shipped | MEDIUM | Re-run discovery spike, correct the mapping constant, re-validate against UI, re-pilot to rebuild trust |
| Numbers wrong in a posted message | HIGH (trust) | Fix math, add the failing case as a unit test, post a brief correction, slow-rollout to re-earn trust |
| Cron disabled / DST drift | LOW | Add keepalive; move tz handling into code; re-enable workflow |
| Silent multi-day outage | MEDIUM (trust) | Add `if: failure()` alert + degraded-message path; communicate the gap to the team |
| False-positive flags eroding trust | HIGH (trust) | Tighten reconciliation/overhead exclusion, re-pilot before resuming daily |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| LLM-on-Pro ToS / ban | Architecture decision (earliest) + isolated LLM phase (last, cuttable) | System produces correct message with LLM disabled; no subscription OAuth token in CI |
| "Briefed" / booking->task assumption | Productive data-discovery phase (before capacity logic) | Mapping validated against live Productive UI on real bookings |
| LLM doing arithmetic | Capacity-logic phase + render phase | Deterministic math unit-tested; rendered numbers re-checked against computed |
| Cron drift / DST / 60-day disable | Scheduling/deployment phase | Tz handled in code; weekday guard; keepalive present; tested across DST |
| Silent run failure | Resilience/delivery phase (contract set at architecture) | Degraded message posts when a source is killed; failure alert routed to a human |
| Wrong/noisy/blaming messages | Reconciliation phase + render phase + pilot gate | Team agrees with every flag in a real-evening pilot; tone excludes PM names |
| Working-day/tz/holiday math | Capacity-logic phase | Tests pass for Friday->Monday, holiday-eve, DST boundary |
| Secrets exposure | Every phase touching credentials | Logs scrubbed; secrets in GitHub secrets; read-only delegation scope |

## Sources

- Anthropic Consumer Terms / Claude Code subscription use + Jan 2026 harness enforcement: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan ; https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses (HIGH)
- Productive bookings data model (draft/tentative, service_id, task_id, person_id, absence vs budget): https://developer.productive.io/bookings.html ; https://developer.productive.io/reference/resources/bookings (HIGH)
- Productive tentative bookings (soft allocations): https://help.productive.io/en/articles/8582323-tentative-bookings (HIGH)
- Productive auth headers (X-Auth-Token, X-Organization-Id): https://developer.productive.io/guides/authorization.html (HIGH). Content-Type application/vnd.api+json inferred from Productive following the JSON:API spec (MEDIUM)
- Productive pagination + rate limits: https://developer.productive.io/faq.html (HIGH)
- Google Chat limits (32,000-byte messages, 100 widgets/card, 1 msg/sec per space, no daily cap): https://developers.google.com/workspace/chat/limits ; https://developers.google.com/workspace/chat/api/reference/rest/v1/cards (HIGH)
- Google Calendar service account + domain-wide delegation, recurring/singleEvents, tz: https://developers.google.com/workspace/calendar/api/concepts/events-calendars ; https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation (HIGH)
- GitHub Actions 60-day scheduled-workflow disable + cron delay/UTC: https://github.com/orgs/community/discussions/32197 ; https://dev.to/gautamkrishnar/how-to-prevent-github-from-suspending-your-cronjob-based-triggers-knf ; https://github.com/marketplace/actions/keepalive-workflow (HIGH)

---
*Pitfalls research for: nightly Productive.io + Google Calendar -> LLM -> Google Chat capacity automation*
*Researched: 2026-06-02*
