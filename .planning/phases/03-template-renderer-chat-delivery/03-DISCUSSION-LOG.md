# Phase 3 — Discussion Log

**Gathered:** 2026-06-03
*Human-reference record of the discussion. Not consumed by downstream agents — see 03-CONTEXT.md for the decisions.*

## Areas discussed
Card layout & hierarchy · Voice & copy · Severity scaling · Deep-links & degraded/failure (all four selected).

## How it went
Liam (brand designer) asked to drive the card design visually rather than via abstract options, so the discussion ran as an **HTML prototyping loop** (`design/chat-card-mockups.html`), ~15 rounds, opening the file in the browser each round and reacting.

Key turns:
- **Round 1–2:** ASCII → on-brand HTML using the live SOLVD system (Host Grotesk, yellow `#FEFD5C`, asterisk, "NO EYEBROWS" rule).
- **Round 2→3:** Liam asked to confirm Google Chat integration was considered. Verified Cards v2 live: **no custom fonts, no background/highlight, hosted-PNG images only.** Pivoted to a true-to-Chat render (Roboto, native widgets). Liam chose to "stick closer to native."
- **Rounds 4–8:** layout converged — avatar (settled on **white asterisk on black**), date moved into the header, week summary turned into a **dot bar** (filled = booked) and moved to a labelled footer, title renamed **"Solvd Studio Check-in"**, verdict copy iterated.
- **Rounds 9–12:** scenario gallery — clean / busy / one-quiet / whole-studio-light / mixed / overbooked / on-leave / briefs-missing / couldn't-read / degraded / holiday / studio-closure / half-day-leave / two-on-leave. Rules locked: **no names in the verdict**, detail **one-item-per-line**, **briefs nested under each person**, **🤖 for data problems**, separate **holiday** message.
- **Rounds 13–15:** sub-flag line format — **"📄 No brief / Brief empty / Not briefed · CODE · Xh"** and **"⚠️ Xh tentative (on top) · client"**. Confirmed live that tentative (allocations) carry no job code — client name only. Locked the tentative qualifier as **"(on top)"** in brackets.

## Decisions confirmed at close
- Two-on-leave verdict → **"All sorted for tomorrow."** (option A).
- Deep-link → tomorrow's Productive scheduling view (Liam supplied the exact URL pattern with the saved design-team filter).
- Total-run-failure alert → **GitHub Actions failure email**.

## Deferred
Hosted-image smooth progress bar; Gmail delivery; per-row deep-links; (Calendar / LLM / idempotency → later phases).
