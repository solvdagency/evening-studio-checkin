# Phase 1: Core Math & Clock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 1-core-math-clock
**Areas discussed:** Time-off → hours, Underbooked threshold, Rest-of-week window, Holiday source, Overbooked handling, Hour precision, Empty/partial input

---

## Time-off → available hours

### Full day off
| Option | Description | Selected |
|--------|-------------|----------|
| Excluded as 'off' | Shown on leave, NOT counted underbooked | ✓ |
| Flagged underbooked | 0 booked of 0 available | |
| Omitted entirely | Dropped from report with no mention | |

### Partial absence
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, proportional | available = 7.5 − absence hours | ✓ |
| Round to half-days | Snap to full/half day | |
| Full-day only | Any absence = whole day off | |

**User's choice:** Excluded as 'off' (still mentioned); proportional reduction.
**Notes:** Flagging someone on leave as underbooked would erode trust.

---

## Underbooked threshold

### Gap threshold
| Option | Description | Selected |
|--------|-------------|----------|
| ≥ 0.5h open | Filter trivial gaps | |
| Any gap | Flag the moment booked < available | ✓ |
| ≥ 1h open | Quietest | |

### Tentative-only fill
| Option | Description | Selected |
|--------|-------------|----------|
| Booked but shaky | Tentative counts; not underbooked, flagged shaky | |
| Still underbooked | Only confirmed counts; tentative-only = underbooked AND shaky | ✓ |

**User's choice:** Any gap; only confirmed hours close the gap.
**Notes:** Deliberately strict/cautious — rather over-flag than miss a real gap. Underbooked open hours = available − confirmed; tentative surfaced separately as shaky.

---

## Rest-of-week rollup (CAP-05)

### Window
| Option | Description | Selected |
|--------|-------------|----------|
| Target day → Friday | Forward from next working day to that week's Friday | ✓ |
| Whole current week | Mon–Fri incl. passed days | |
| Just the target day | No rollup | |

### Friday rollover
| Option | Description | Selected |
|--------|-------------|----------|
| All of next week | Mon–Fri ahead | ✓ |
| Just Monday | Only target day on Fridays | |

### Studio total
| Option | Description | Selected |
|--------|-------------|----------|
| Net of time-off | Sum of available hours | ✓ |
| Flat capacity | 3 × 7.5 × days | |

**User's choice:** Target day → that week's Friday; rolls to next week on Fridays; total net of time-off.
**Notes:** Run is ~4:30pm so today is treated as done. Consistent rule: always target-day through that day's Friday.

---

## Holiday source

| Option | Description | Selected |
|--------|-------------|----------|
| Config list | Explicit committed dates | |
| Library (date-holidays) | Computed AU + state holidays | ~ (leaning) |
| Skip in v1 | Weekends only | |

### Holiday + rollup
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, drop it | Holiday = 0 hours, not a working day | ✓ |
| Next-day only | Only affects target day | |

**User's choice (free-text):** "I like library but they do also show in Productive I think." Region = NSW.
**Notes:** Resolved architecturally — Phase 1 stays dependency-free by accepting an **injected holiday-date set**; the actual source (library default, cross-checked against Productive absences) is Phase 2 wiring. Library = clean feed for the clock; Productive absences naturally cover capacity. Holiday drops out of rollup. Region confirmed NSW.

---

## Overbooked handling

| Option | Description | Selected |
|--------|-------------|----------|
| Compute, flag gently | Low-key distinct "over capacity" signal | ✓ |
| Compute silently | Track but never flag | |
| Clamp to available | Hide overage | |

**User's choice:** Compute, flag gently.
**Notes:** Early warning of bad booking / crunch; not alarmist. No clamping — booked math stays accurate.

---

## Hour precision

| Option | Description | Selected |
|--------|-------------|----------|
| Round to 0.25h | Quarter-hour display, exact internal | ✓ |
| Exact decimal | To the minute | |
| Round to 0.5h | Half-hour | |

**User's choice:** Round to 0.25h.
**Notes:** Compute internally in exact minutes; round only the surfaced figure.

---

## Empty / partial input

### Zero bookings
| Option | Description | Selected |
|--------|-------------|----------|
| Underbooked, full open | Full available reported open | ✓ |
| Skip / no data | Treated as nothing to report | |

### Missing from input
| Option | Description | Selected |
|--------|-------------|----------|
| Detectable gap | Knows 3-designer roster, reports "2 of 3" | ✓ |
| Just compute present ones | Silently report whoever's present | |

**User's choice:** Underbooked with full open; missing designer is a detectable gap.
**Notes:** Feeds the REL-01 degraded-message path in Phase 3. Partial/empty inputs must degrade gracefully, never throw.

---

## Claude's Discretion
- Internal types / function signatures / module layout.
- Test structure (project standard: `node:test`) — but Friday→Monday, holiday-eve, and DST-boundary cases are all mandatory per ROADMAP success criteria.
- Exact rounding mode (half-up vs half-even) at 0.25h granularity.

## Deferred Ideas
- Holiday-source wiring → Phase 2.
- Brief existence/briefed checks → Phase 2.
- Message format / presentation / deep-links → Phase 3.
- Degraded-message wording for missing-designer signal → Phase 3.
