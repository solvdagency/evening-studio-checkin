# Roadmap: Evening Studio Check-in

## Shipped Milestones

- ✅ **v1.0 — MVP** (Phases 1–7, shipped 2026-06-04) — Deterministic capacity/brief/meeting nightly check-in posted to Google Chat: pure capacity math + working-day logic, live Productive pull with discovered "briefed" mapping, on-brand Cards v2 renderer with scheduled weekday posting + degraded mode, Google Calendar meeting reconciliation, optional (default-OFF) LLM prose + fuzzy-meeting layer, per-designer working-day availability, and idempotency + structured run logging. **22 plans · 25/25 requirements · audit `tech_debt` (no blockers).**
  Full detail: [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md) · Requirements: [`milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md) · Audit: [`v1.0-MILESTONE-AUDIT.md`](v1.0-MILESTONE-AUDIT.md)

## Next Milestone

None planned yet. Start the next milestone with `/gsd:new-milestone` (defines fresh requirements → roadmap; phase numbering continues from 8).

**Carried-forward tech debt (from v1.0 audit, none blocking):**
- Phase 4 — run the two live-run integration checks (real Google Calendar DWD read + real Productive same-day reconciliation) before relying on the live pipeline.
- Phase 5 — expand `labelled-events.json` with borderline/overhead cases and re-run `scripts/eval-llm-renderer.ts` before enabling `USE_LLM_MEETING_JUDGMENT` in production.
- Phase 6 — D-06: availability-read failure trips the whole-card degrade instead of a per-designer 🤖 row.
