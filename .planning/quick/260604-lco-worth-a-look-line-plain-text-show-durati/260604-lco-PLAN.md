---
phase: quick-260604-lco
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/calendar/schemas.ts
  - src/calendar/gather.ts
  - src/calendar/reconcile.ts
  - src/calendar/duration.ts
  - src/render/rows.ts
  - src/render/cards.ts
  - src/calendar/__fixtures__/labelled-events.json
  - src/calendar/__fixtures__/events-day.json
  - src/calendar/__tests__/gather.test.ts
  - src/calendar/__tests__/reconcile.test.ts
  - src/calendar/__tests__/reconcile-render.e2e.test.ts
  - src/render/__tests__/renderMessage.test.ts
  - src/render/__tests__/fixtures/worth-a-look.json
  - src/calendar/__tests__/duration.test.ts
autonomous: true
requirements: [MEET-04, MSG-06, D-14]

must_haves:
  truths:
    - "The 📅 worth-a-look line is plain muted text with NO <a href> hyperlink"
    - "The 📅 line shows the meeting DURATION (humanized), not the start time"
    - "The 📅 line ends with 'not in Productive' and never says 'worth a look'"
    - "A timed flagged meeting renders: 📅 {title} · {duration}, not in Productive"
    - "When durationMinutes is missing the line gracefully omits the duration segment and never prints 'undefined'/'NaN'"
    - "npm test is fully green and npx tsc --noEmit is clean"
  artifacts:
    - path: "src/calendar/duration.ts"
      provides: "Pure humanizeDuration(minutes) helper"
      exports: ["humanizeDuration"]
    - path: "src/calendar/reconcile.ts"
      provides: "WorthALookItem = { title; durationMinutes? } (no start/link)"
      contains: "durationMinutes"
    - path: "src/render/rows.ts"
      provides: "Plain-text 📅 line ending 'not in Productive'"
      contains: "not in Productive"
  key_links:
    - from: "src/calendar/gather.ts"
      to: "src/calendar/reconcile.ts"
      via: "FilteredEvent.durationMinutes feeds WorthALookItem.durationMinutes"
      pattern: "durationMinutes"
    - from: "src/render/rows.ts"
      to: "src/calendar/duration.ts"
      via: "humanizeDuration(m.durationMinutes) in the 📅 line"
      pattern: "humanizeDuration"
---

<objective>
Change the 📅 worth-a-look calendar sub-line per Liam's pilot feedback: plain text
(no hyperlink), show meeting DURATION instead of start time, drop "worth a look",
end with "not in Productive". Final line:

  📅 {meeting title} · {duration}, not in Productive
  e.g. 📅 Stream Hill Michael @ Third.i · 1 hour, not in Productive

This intentionally OVERRIDES the earlier MSG-06 "deep-linked title" decision and
changes the D-14 sub-line wording — per direct user feedback. Capture this in the
SUMMARY for traceability.

Purpose: the deep link wasn't useful in the pilot; duration + "not in Productive"
reads more like an actionable nudge than a start-time clash hint.
Output: a duration humanizer, an end→durationMinutes data path through
schemas→gather→reconcile→render, and updated tests/fixtures.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Current shapes the executor edits. Use these directly — no exploration needed. -->

From src/calendar/schemas.ts — EventDateTime already exists and is REUSED for `end`:
```typescript
const EventDateTime = z.object({
  date: z.string().optional(),     // present ⟺ all-day
  dateTime: z.string().optional(), // present ⟺ timed (RFC3339)
  timeZone: z.string().optional(),
}).loose();

export const CalendarEventResource = z.object({
  id: z.string(),
  // ...
  start: EventDateTime.optional(),
  // end is NOT yet present — add it here
}).loose();
```

From src/calendar/gather.ts — FilteredEvent (add `durationMinutes?`):
```typescript
export interface FilteredEvent {
  id: string;
  summary: string;
  htmlLink: string;
  startLabel: string;
  startDateTime?: string;
  startDate?: string;
  eventType?: string;
  responseStatusSelf?: string;
  attendeeCount: number;
}
```
The mapping that builds it (~line 154) currently reads e.start only. luxon DateTime
is already imported. STUDIO_ZONE is imported. NO new system-clock read is allowed —
duration is start↔end arithmetic only.

From src/calendar/reconcile.ts — WorthALookItem (becomes { title; durationMinutes? }):
```typescript
export interface WorthALookItem {
  title: string;
  start: string;  // REMOVE
  link: string;   // REMOVE
}
// reconcileMeetings pushes { title: event.summary, start: event.startLabel, link: event.htmlLink }
```

From src/render/rows.ts (~line 158-161) — the current 📅 loop:
```typescript
for (const m of ctx.worthALook?.[d.designerId] ?? []) {
  const titleLink = `<a href="${escapeHtml(m.link)}">${escapeHtml(m.title)}</a>`;
  lines.push(`📅 ${titleLink} · ${muted(escapeHtml(m.start))} · ${muted("worth a look")}`);
}
```
`escapeHtml` is exported in this file (line 24); `muted` is a local helper (line 34).

From src/render/cards.ts (~line 172) — RenderContext.worthALook inline type:
```typescript
worthALook?: Record<string, Array<{ title: string; start: string; link: string }>>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Duration humanizer (pure helper, TDD)</name>
  <files>src/calendar/duration.ts, src/calendar/__tests__/duration.test.ts</files>
  <behavior>
    humanizeDuration(minutes: number): string — round to nearest minute first.
    - 1..59 (not a whole/half hour) → "{m} min"  e.g. 25 → "25 min", 45 → "45 min"
    - exact whole hours → "{h} hour" / "{h} hours"  e.g. 60 → "1 hour", 120 → "2 hours"
    - exact half hours → "{h}.5 hours"  e.g. 90 → "1.5 hours", 150 → "2.5 hours"
      (30 → "30 min", since 0.5 hour reads better as minutes)
    - else mixed → "{h}h {m}m"  e.g. 75 → "1h 15m", 100 → "1h 40m"
    - rounding: 89.6 → 90 → "1.5 hours"; 59.4 → 59 → "59 min"
    Pure: no clock, no I/O. This is the trust-safe analog of the deterministic-math rule.
  </behavior>
  <action>Create src/calendar/duration.ts exporting `humanizeDuration(minutes: number): string`
implementing the bands in <behavior>. Round to nearest integer minute at the top
(Math.round). Compute h = floor(mins/60), m = mins % 60. Branch: m===0 → "{h} hour(s)";
m===30 AND h>=1 → "{h}.5 hours"; h===0 → "{m} min"; else "{h}h {m}m". Singular only for
exactly "1 hour". Add a docblock noting this is presentation-only formatting, never hour
arithmetic that feeds capacity (CLAUDE.md trust rule). Write duration.test.ts FIRST with
node:test covering every band + the two rounding cases above; confirm RED, then implement
to GREEN.</action>
  <verify>
    <automated>npx tsx --test src/calendar/__tests__/duration.test.ts</automated>
  </verify>
  <done>humanizeDuration covers all bands + rounding; its test file is green.</done>
</task>

<task type="auto">
  <name>Task 2: end→durationMinutes data path (schemas, gather, reconcile)</name>
  <files>src/calendar/schemas.ts, src/calendar/gather.ts, src/calendar/reconcile.ts, src/calendar/__fixtures__/labelled-events.json, src/calendar/__fixtures__/events-day.json, src/calendar/__tests__/gather.test.ts, src/calendar/__tests__/reconcile.test.ts</files>
  <action>
1. schemas.ts — add `end: EventDateTime.optional()` to CalendarEventResource (reuse the
   existing EventDateTime const). Update the field-list docblock comment to mention `end`.
2. gather.ts — add `durationMinutes?: number` to the FilteredEvent interface (document it:
   "studio meeting length in minutes, start.dateTime→end.dateTime; undefined when not timed
   or end missing — presentation-only, never capacity math"). In the mapping (~line 154-164)
   compute it: when BOTH e.start?.dateTime and e.end?.dateTime are present, parse both with
   DateTime.fromISO (RFC3339 offsets carry the zone — no setZone needed for a diff), and if
   both isValid set durationMinutes = Math.round(end.diff(start,"minutes").minutes); otherwise
   leave undefined. Keep startLabel/startDateTime/startDate untouched (filters still use them).
   Do NOT read the system clock.
3. reconcile.ts — change WorthALookItem to { title: string; durationMinutes?: number }
   (REMOVE start and link fields). Update reconcileMeetings' push to
   { title: event.summary, durationMinutes: event.durationMinutes }. Update the WorthALookItem
   docblock to the new line format ("📅 {title} · {duration}, not in Productive", plain text,
   no deep link) and note it overrides MSG-06 deep-link + D-14 wording per user feedback.
4. labelled-events.json — add `end` to the timed golden events so duration computes: at least
   "Quick FDC catch up" (start 09:45+10:00 → end 10:15+10:00, 30 min) and "FDC IPO Launch
   Check-In" (start 12:00+10:00 → end 13:00+10:00, 60 min → "1 hour"). Add `end` to any other
   TIMED event the gather/reconcile/e2e tests actually read. Keep every entry
   CalendarEventResource.safeParse-valid (end uses the same {dateTime,timeZone} shape; all-day
   entries get no end). Do not add end to the all-day/date-only entries.
5. events-day.json — add `end` to "evt-fdc-checkin" (start 14:30+10:00 → end 15:30+10:00,
   60 min) so the gather test can assert durationMinutes.
6. gather.test.ts — assert the FDC FilteredEvent now carries durationMinutes === 60 (and that
   the all-day "evt-allday-leave" has durationMinutes === undefined). Keep existing assertions.
7. reconcile.test.ts — update the inline FilteredEvent builder to map raw.end → durationMinutes
   (or set durationMinutes directly on COVERED/WORTH consts). GOLDEN 2 (WORTH): replace the
   removed item.start / item.link assertions with item.durationMinutes (60 for the IPO event);
   keep item.title. GOLDEN 1 (covered) stays []. Bias-to-silence cases unchanged.
  </action>
  <verify>
    <automated>npx tsx --test src/calendar/__tests__/gather.test.ts src/calendar/__tests__/reconcile.test.ts</automated>
  </verify>
  <done>schemas validate `end`; FilteredEvent + WorthALookItem carry durationMinutes; gather + reconcile tests green; fixtures stay safeParse-valid.</done>
</task>

<task type="auto">
  <name>Task 3: render the new plain-text 📅 line (rows, cards, render tests)</name>
  <files>src/render/rows.ts, src/render/cards.ts, src/render/__tests__/renderMessage.test.ts, src/render/__tests__/fixtures/worth-a-look.json, src/calendar/__tests__/reconcile-render.e2e.test.ts</files>
  <action>
1. cards.ts — update RenderContext.worthALook inline type to
   `Record<string, Array<{ title: string; durationMinutes?: number }>>` and update the field's
   docblock to the new format (plain muted text, no deep link, ends "not in Productive";
   note it overrides MSG-06). Remove deep-link/MSG-06 phrasing that no longer applies.
2. rows.ts — import humanizeDuration from "../calendar/duration.ts". Replace the 📅 loop
   (~line 158-161): build the line as plain MUTED text, no <a href>. When m.durationMinutes is
   a finite number, line = `📅 ${muted(escapeHtml(m.title))} · ${muted(humanizeDuration(m.durationMinutes))}, ${muted("not in Productive")}`;
   when durationMinutes is missing/undefined, omit the duration segment →
   `📅 ${muted(escapeHtml(m.title))}, ${muted("not in Productive")}`. Never emit "undefined"/"NaN".
   Update the 📅 docblock comment (~line 154-157) to the new wording and drop the
   "deep-links (MSG-06)" / "worth a look voice" lines. Keep escaping (T-04-11) on the title.
3. worth-a-look.json fixture — replace start/link with durationMinutes on both entries:
   "686717" FDC IPO entry → durationMinutes 60; the XSS-title "686712" entry → durationMinutes
   90 (keeps an escaping case + a "1.5 hours" case). Keep the <script>/& title for the escape test.
4. renderMessage.test.ts — update the worthALook fixture type and assertions:
   - "renders a soft, deep-linked 📅 line" test → rename intent to plain-text; assert the line
     matches /📅 .*FDC IPO Launch Check-In/, contains "1 hour", contains "not in Productive",
     and assert NO <a href / no "worth a look" in the text.
   - drop the /9:00am/ start-time assertion.
   - "uses the soft 'worth a look' voice" test → assert the rendered JSON does NOT include
     "worth a look" and still does NOT include /conflict/i; assert it DOES include "not in Productive".
   - HTML-escape test → keep &lt;script&gt; / no raw <script>; the link-escape (eid=xss&amp;)
     assertion no longer applies (no link) — replace with an assertion that the line has no
     "<a href" and the duration "1.5 hours" renders for the XSS entry.
   - "no worthALook entry → no 📅 line" and "absent map is a no-op" tests stay as-is.
   - Add ONE test: an entry with durationMinutes undefined renders `📅 {title}, not in Productive`
     with no " · " duration segment and no "undefined"/"NaN".
5. reconcile-render.e2e.test.ts — update the inline FilteredEvent builder to carry durationMinutes
   (map raw.end or set directly). Update the flagged-meeting assertions: assert the rendered text
   contains the title + a humanized duration + "not in Productive", and assert it has NO <a href
   and NO "worth a look". Keep: covered meeting → [] / no 📅 line. Keep the
   calendar-unavailable + degraded-card tests untouched.
  </action>
  <verify>
    <automated>npm test 2>&1 | tail -20 && npx tsc --noEmit</automated>
  </verify>
  <done>📅 line is plain muted text ending "not in Productive", shows duration, no hyperlink, no "worth a look"; missing-duration path is safe; npm test fully green AND npx tsc --noEmit clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Google Calendar JSON → app | Untrusted event titles/times cross at CalendarEventResource.safeParse (T-04-03). |
| FilteredEvent → rendered card text | Event title interpolated into Chat HTML (T-04-11). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-03 | Tampering | new `end` field on CalendarEventResource | mitigate | `end` is optional + `.loose()` EventDateTime; drift on end skips the event, never throws (existing safeParse path). |
| T-04-11 | Injection | 📅 line title in rows.ts | mitigate | Title still passed through `escapeHtml` before insertion; duration is humanizeDuration output (digits + fixed words only, no user data). |
| T-04-TRUST | Tampering | duration arithmetic | accept | humanizeDuration is presentation-only formatting of a start↔end diff; it never touches capacity/hour math (CLAUDE.md trust rule) and reads no clock. |
</threat_model>

<verification>
- `npm test` is fully green (all ~225+ tests).
- `npx tsc --noEmit` is clean.
- Grep the flagged-meeting rendered text in tests: contains "not in Productive", a humanized
  duration, the escaped title; contains NO "<a href" and NO "worth a look".
- Missing-duration entry renders `📅 {title}, not in Productive` with no "undefined"/"NaN".
- Every labelled-events.json / events-day.json entry still CalendarEventResource.safeParse-valid.
</verification>

<success_criteria>
- The 📅 line renders `📅 {title} · {duration}, not in Productive` (plain muted text, no link).
- Duration replaces start time; "worth a look" tail removed.
- Missing/undefined durationMinutes → `📅 {title}, not in Productive`, never crashes or prints NaN.
- WorthALookItem and RenderContext.worthALook are { title; durationMinutes? } (no start/link).
- Only the listed files touched; no capacity/report/clock/hour-math code modified; runNightly
  remains the single clock read.
- `npm test` green AND `npx tsc --noEmit` clean.
</success_criteria>

<output>
Create `.planning/quick/260604-lco-worth-a-look-line-plain-text-show-durati/260604-lco-SUMMARY.md` when done.
In the SUMMARY, record the traceability note: this change intentionally OVERRIDES MSG-06
(deep-linked title) and changes the D-14 sub-line wording, per direct user pilot feedback.
</output>
