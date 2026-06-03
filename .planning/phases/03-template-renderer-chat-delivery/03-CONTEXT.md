# Phase 3: Template Renderer & Chat Delivery - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Render the trusted `StudioReport` (from Phases 1–2) as an on-brand Google Chat **Cards v2** message and deliver it via an incoming webhook, posted automatically every weekday ~4:30pm studio time (plus a manual trigger). The message always posts — clean, busy, and degraded variants — with a deterministic template renderer and **zero LLM, zero Calendar**. This is the shippable v1.

**In scope:** Cards v2 message design + deterministic renderer; weekday cron + manual dispatch; always-post incl. clean/degraded/holiday/closure variants; deep-links to Productive; failure alerting.
**Out of scope (later phases):** LLM-written prose (Phase 5), Calendar/meeting reconciliation (Phase 4), idempotency/run-logging hardening (Phase 6), `gmail.send` email delivery.

The message design was explored over ~15 visual iteration rounds against a live HTML mockup; the agreed design is captured below and rendered in `design/chat-card-mockups.html`.
</domain>

<decisions>
## Implementation Decisions

### Cards v2 fidelity (hard platform constraints — verified live)
- **D-01:** Deliver via **incoming webhook** (one POST, `cardsV2` payload). No bot/OAuth.
- **D-02:** **No custom fonts** in Cards v2 — the card renders in Google's font (Roboto). The brand typeface (Host Grotesk / Oldschool Grotesk Compressed) is NOT used in the card. Accepted.
- **D-03:** **No background/highlight colour and no yellow-on-white** (brand rule: #FEFD5C is 1.08:1 on white — invisible). Colour in the card is limited to inline `<font color>` (red/green) + emoji. The brand yellow appears in exactly one native place: the header avatar image.
- **D-04:** Images (logo/avatar) must be **hosted raster PNGs at a public HTTPS URL** (SVG support unreliable). Export the brand asterisk + any logo to PNG and host (e.g. GitHub raw).
- **D-05:** Brand expression in this surface = **the avatar, the voice/copy, and clean structure** — not type or highlights.

### Card layout & hierarchy
- **D-06:** **Header** = avatar + title **"Solvd Studio Check-in"** + subtitle **"Tomorrow · {Weekday Date}"** (e.g. "Tomorrow · Thursday 4 June"). The date framing makes the moment instant: *here's tomorrow, here's how it looks.*
- **D-07:** **Avatar** = the Solvd four-spoke **asterisk in white on a black circle** (`imageType: CIRCLE`), hosted PNG.
- **D-08:** **Body lead** = a one-line **verdict** (see voice). Then per-designer rows, then a footer week-bar.
- **D-09:** **Per-designer row** = `decoratedText`-style: a status emoji gutter + name (bold) + status (coloured) on line 1; detail items each on **their own line** beneath, body-size, greyed (NOT Chat's tiny fixed `bottomLabel` — promote into the main text so size holds; hierarchy by colour/weight, not size).
- **D-10:** **Status markers:** 🔴 open time · 🟢 full day · 🟠 overbooked · ⚪ on leave · 🤖 couldn't read this designer · 📄 brief issue · ⚠️ tentative.
- **D-11:** **Status colours (inline `<font>`):** red `#d93025` (open / "couldn't reach"), green `#188038` (full), amber-brown `#b06000` (overbooked "Xh over"). Grey `#5f6368` for muted detail.

### Voice & copy (verdict line)
- **D-12:** **The verdict line NEVER names a person.** Names appear only in the rows. (Collective-nudge ethos; brand voice: direct, confident, human, Australian English, sentence case, no jargon.)
- **D-13:** Verdict adapts to the scenario (nameless), e.g.:
  - Clean: **"All sorted for tomorrow."** + status **"Three designers fully booked. Nothing to action."** (locked verbatim)
  - 2 open: **"Two designers have open time tomorrow."**
  - 1 open: **"One designer has a bit of open time tomorrow."**
  - All open: **"The whole studio's light tomorrow."**
  - Overbooked: **"One designer's a bit over tomorrow."**
  - All over: **"The whole studio's overbooked tomorrow."**
  - Mixed: **"A couple of things to sort tomorrow."**
  - Briefs only: **"Everyone's booked — but {N} brief(s) need finishing."**
  - On leave: leave **never** drives the verdict; it only shows as a row. Even with 2 of 3 on leave, if the rest is fine the verdict is **"All sorted for tomorrow."** (user chose this over acknowledging the thin team).

### Sub-flag lines (tentative & briefs) — nested under the relevant designer
- **D-14:** **Tentative** line format: **"⚠️ {X.X}h tentative (on top) · {Client}"**. Tentative shows the **client name + hours** — NO job code (allocations carry no task/project code; verified live). "(on top)" is mandatory (chosen over "as well"/"extra"/etc.) to signal it is additive.
- **D-15:** **Tentative NEVER counts** toward booked, open, or "over" — those figures are **confirmed-only**. Tentative is always the on-top extra (the `shaky` flag from Phase 1). This must be visually unambiguous.
- **D-16:** **Brief** line format: **"📄 {label} · {CODE} · {X}h"**, nested under the booked designer (NOT a separate bottom section). Three short labels by failure mode: **"No brief"** (no task/brief attached), **"Brief empty"** (blank description), **"Not briefed"** (status not at/past Briefed). Always include the **job code** and the **hours** booked on that job.

### Severity scaling & states
- **D-17:** Always posts. **Clean night** = short verdict + status, no per-designer rows, just the week bar. **Busy night** = full rows. Length scales with severity (MSG-05).
- **D-18:** **Degraded** (a source unreachable, e.g. Productive): **"🤖 Couldn't reach Productive tonight."** + **"No booking figures this run. I'll have them tomorrow evening — worth a check in Productive yourself in the meantime."** Names what it couldn't reach; still posts (REL-01).
- **D-19:** **Per-designer data miss** (one/two designers didn't come back): show **🤖** next to that person's row ("couldn't read"); never fake "empty". Verdict nameless (e.g. "I could only read one designer tonight.").
- **D-20:** **Holiday tomorrow** = its own short, warm message: **"🎉 Public holiday tomorrow — {name}. No check-in needed. Enjoy..."** (no rows/bar).
- **D-21:** **Studio closure / offsite** (internal, not public holiday) = its own message: **"📦 Studio's out tomorrow — team offsite. No check-in needed. Back {day}."**
- **D-22:** **On-leave row** is minimal — only ever **"on leave / Full day off."** Nothing more. **Half-day/partial leave** is different: treat them as a normal availability row for the hours they're in, with a note like **"On leave until midday · {X}h booked"** (user approved this treatment).

### Week summary bar (footer)
- **D-23:** Footer section labelled **"Remaining studio time this week"**, with a **dot bar** (`●●●○○○○○○○`) where **filled = booked, empty = open** (a fuel-gauge: full bar = studio booked up; mostly empty = lots to fill). Style = **"dots · colour"** (solid ink booked / light-grey `#c9ccd1` open). Caption shows **both figures**: **"{X}h booked · {Y}h open"**. Bar is a monospace run (Roboto Mono) — the only native "bar"; no real progress widget exists.

### Deep-links & failure
- **D-24:** A single **"Open in Productive"** button (`openLink`) → **tomorrow's scheduling view**, template:
  `https://app.productive.io/34092-solvd-agency/scheduling/bookings?date={TARGET_YYYY-MM-DD}&filter=NzQ5NTY2&groupBy=people`
  (org slug `34092-solvd-agency`; `date` = target working day; `filter=NzQ5NTY2` = the saved design-team filter, base64 of `749566`; `groupBy=people`). Verify the URL/filter resolves during planning.
- **D-25:** **Total-failure alert** (run can't even post): rely on **GitHub Actions' built-in failed-run email** to repo owners (REL-02). No extra infra; it's the only channel that works when the job can't reach Chat.

### Claude's Discretion
- Exact Cards v2 widget mapping (sections/dividers/columns), the swappable `renderMessage(report) → card` interface (LLM-01 prep for Phase 5), cron UTC conversion for 4:30pm studio time + `workflow_dispatch`, and the renderer's degrade-don't-throw wrapper — all left to research/planning, consistent with the decisions above.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brand system (the source of truth for voice + visual)
- `/Users/liammills/Documents/CLAUDE/Solvd Brand/tone-of-voice.md` — Solvd voice: direct, confident, collaborative, human, results-led, Australian English; sentence case; no jargon; phrases like "Work that works." Use for ALL message copy.
- `/Users/liammills/Documents/CLAUDE/Solvd Brand/visual-rules.md` — colour rules (yellow `#FEFD5C` dark-surface-only; black `#0A0A0A`), the "NO EYEBROWS" rule, type rules (Host Grotesk / Oldschool display-only), icon set.
- `/Users/liammills/Documents/CLAUDE/Solvd Brand/assets/logos/variants/logo-solvd-{black,white}.svg`, `assets/icons/icon-asterisk.svg` — export the asterisk (white-on-black) to a hosted PNG for the avatar.
  *(Note: brand assets live outside the repo on Liam's machine — copy the needed PNGs into the repo and host them.)*

### Design artifact
- `design/chat-card-mockups.html` — the agreed card design + every scenario variant (clean / busy / one-quiet / whole-studio-light / mixed / overbooked / whole-studio-over / on-leave / two-on-leave / half-day-leave / briefs-missing / couldn't-read-one/two / half-data-missing / degraded / holiday / studio-closure). This is the visual contract for the renderer.

### Platform
- https://developers.google.com/workspace/chat/format-messages — Cards v2 supported HTML subset (`<b><i><u><font color><a>`), no background/highlight, no custom fonts.
- https://developers.google.com/workspace/chat/api/reference/rest/v1/cards — cardsV2 widget reference (cardHeader, sections, decoratedText, divider, buttonList, columns).
- Productive deep-link template (D-24) — verify the `filter` + `scheduling/bookings` URL resolves.

### Project planning
- `.planning/REQUIREMENTS.md` — SCHED-01/02, MSG-01..07, REL-01/02, LLM-01 (renderer must be swappable behind one interface).
- `.planning/ROADMAP.md` §"Phase 3" — goal + success criteria.
- `CLAUDE.md` — stack (Node 22 + TS, GitHub Actions cron, incoming webhook), constraints (numbers exact/deterministic; never blame PMs).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/report.ts` — `computeStudioReport(input) → StudioReport`: the exact data the renderer consumes (`targetDay`, `window`, `designers[]` with status/confirmedMin/tentativeMin/openMin/shaky/hours, `rollup` {totalMin/openMin/hours}, `missingDesigners`).
- `src/productive/gather.ts` — `gather()` → bookings/absences/briefFlags/holidays/assessedDesigners/sourceErrors. `sourceErrors` non-empty ⇒ degraded message; `missingDesigners` ⇒ 🤖 rows.
- `src/productive/brief.ts` — `BriefFlag` (job/task, reason: no-task/not-briefed/blank-brief, isClient) → drives the 📄 lines (D-16).
- `src/domain/round.ts` — display rounding to 0.25h; all surfaced hours go through this.

### Established Patterns
- **Determinism / never-throw:** all arithmetic is done; the renderer only *presents* numbers, never computes. Wrap rendering + posting in degrade-don't-throw (return a degraded card on any failure) — mirrors the `Result`/safeParse boundary pattern.
- **Boundary:** `src/domain` must not import `src/productive`. The renderer is a new layer that consumes `StudioReport` (+ gather's `sourceErrors`/`briefFlags`), not raw API types.

### Integration Points
- New composition: gather → computeStudioReport → **renderMessage(report) → cardsV2 JSON** → POST webhook. The renderer is the new code; the webhook URL is a secret (`GCHAT_WEBHOOK_URL`).
- Renderer should sit behind one swappable interface (LLM-01) so Phase 5's LLM renderer drops in with the templated one as the always-available default.
</code_context>

<specifics>
## Specific Ideas

- Designers (from config, D-14 Phase 2): Liam Mills 686717, Anisha Gittins 686712, Ella Wright 686716.
- The design was driven by Liam (brand designer) over ~15 mockup rounds; `design/chat-card-mockups.html` is the canonical visual reference — match it.
- Tentative phrasing locked: **"(on top)"** in brackets.
- Brief phrasing locked: **"No brief / Brief empty / Not briefed"** + code + hours.
- Bar phrasing locked: **"Remaining studio time this week"** + "{X}h booked · {Y}h open".
</specifics>

<deferred>
## Deferred Ideas

- **Smooth pixel progress bar via a generated/hosted image** — considered for the week bar; deferred in favour of the native dot bar (Liam chose to "stick closer to native"). Revisit only if the dot bar disappoints in the real client.
- **Gmail email delivery** (`gmail.send`) — out of scope; Chat only for v1.
- **Per-row deep-links** — considered; chose a single "Open in Productive" button instead.
- Calendar/meeting reconciliation (Phase 4), LLM prose renderer (Phase 5), idempotency + run logging (Phase 6) — later phases.
</deferred>

---

*Phase: 03-template-renderer-chat-delivery*
*Context gathered: 2026-06-03*
