# Phase 7: Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 07-hardening
**Areas discussed:** Marker storage, Manual re-run policy, Marker write timing, Run-log shape

---

## Marker storage

| Option | Description | Selected |
|--------|-------------|----------|
| Committed JSON file | `.runs/<date>.json`; existence = marker, contents = run log; durable, free, version-controlled; needs `contents: write` + commit/push | ✓ |
| GitHub Actions cache | Keyed by date; no commits but evictable — too weak for correctness-critical guarantee | |
| Gist / external KV | Durable, repo stays clean, but adds a credential to maintain | |

**User's choice:** Committed JSON file
**Notes:** Merges with the run-log decision — one artifact serves both REL-03 and the structured-log criterion.

---

## Manual re-run policy

| Option | Description | Selected |
|--------|-------------|----------|
| Manual always posts | Guard only for `event_name == schedule`; manual dispatch always posts (to test space); friction-free re-testing | ✓ |
| Manual with `force` input | Manual respects marker by default, `force` boolean overrides; safest, more config | |
| Strict — block all | Any run for a marked evening skips; most faithful but blocks same-day re-testing | |

**User's choice:** Manual always posts
**Notes:** Accepted risk — a deliberate double-dispatch double-posts (self-inflicted, low stakes, test space).

---

## Marker write timing (write-fail handling)

| Option | Description | Selected |
|--------|-------------|----------|
| Log loudly, exit 0 | Post succeeded = job done; warn that marker didn't persist; never a misleading failure alert | ✓ |
| Exit 1 to surface it | Failed-run email fires immediately, but flags a night that actually posted as "failed" | |

**User's choice:** Log loudly, exit 0
**Notes:** Reinforces the cardinal rule — err toward posting, never toward skipping. The overall order is post-first, mark-second.

---

## Run-log shape

| Option | Description | Selected |
|--------|-------------|----------|
| JSON in marker file + stdout | One JSON object to both stdout (Actions logs) and the committed marker file (durable history) | ✓ |
| stdout JSON only | Inspectable per-run, zero commit noise, but no durable history / no committed marker | |
| Human-readable lines | Consistent labelled summary block; easy to eyeball, harder to parse later | |

**User's choice:** JSON in marker file + stdout
**Notes:** Confirms the one-artifact synthesis; must honour existing redaction rules (no secrets in the JSON).

---

## Claude's Discretion

- Exact JSON field names/nesting and the TS type for the run-log object.
- Whether the marker read/write is injected through `RunNightlyDeps` (preferred for testability) or a thin fs helper — planner decides.
- nightly.yml mechanics for commit+push of the marker (`contents: write`, `[skip ci]` guard, "nothing to commit" handling).
- Future `.runs/` pruning/retention.

## Deferred Ideas

- `.runs/` retention/pruning — revisit only if the directory becomes noisy.
- D-06 degrade-path refinement (per-designer 🤖 row) — pre-existing STATE follow-up.
- Expanding `labelled-events.json` before enabling the Phase-5 meeting-judgment toggle in prod — Phase-5 follow-up.
