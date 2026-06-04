/**
 * Pure duration humanizer (quick 260604-lco) — the short human label for the 📅
 * worth-a-look sub-line, e.g. "1 hour", "30 min", "1.5 hours", "1h 15m".
 *
 * TRUST RULE (CLAUDE.md): this is PRESENTATION-ONLY formatting of a meeting's
 * start↔end length. It never participates in capacity/hour arithmetic that feeds
 * the trusted figures, and it reads no system clock. It is the trust-safe analog
 * of round.ts: a display transform, never re-entering the math.
 *
 * Bands (after rounding the input to the nearest whole minute):
 *   - exact whole hours       → "{h} hour" / "{h} hours"   (60 → "1 hour", 120 → "2 hours")
 *   - exact half hours, h ≥ 1 → "{h}.5 hours"               (90 → "1.5 hours")
 *   - under an hour (h === 0) → "{m} min"                    (25 → "25 min", 30 → "30 min")
 *   - mixed                   → "{h}h {m}m"                  (75 → "1h 15m")
 * "30 min" (not "0.5 hours") is the chosen wording for a half hour (Liam's default).
 */
export function humanizeDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;

  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  if (m === 30 && h >= 1) return `${h}.5 hours`;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}
