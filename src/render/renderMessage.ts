/**
 * renderTemplate — the always-available templated renderer (the LLM-01 default).
 *
 * The render twin of computeStudioReport: a PURE (report, ctx) → CardsV2Payload
 * function. It does NO I/O, reads ONLY the display-only `*Hours` fields (plus the
 * documented weekBar dot-count exception), NEVER recomputes a number, and never
 * throws on well-formed input (CLAUDE.md trust constraint; RESEARCH anti-pattern
 * line 297). Phase 5's LLM renderer drops in behind the identical `RenderMessage`
 * signature.
 *
 * For the `"card"` variant it assembles, in contractual order (MSG-02):
 *   header → verdict section → (designer rows section, busy only) → button → week bar.
 * The holiday / closure / degraded variants are owned by plan 03-02; this module
 * implements only the `"card"` path.
 */

import type {
  CardsV2Payload,
  RenderContext,
  RenderMessage,
  Section,
  Widget,
} from "./cards.ts";
import type { StudioReport } from "../domain/report.ts";
import { AVATAR_PNG_URL, BRAND_COLORS, PRODUCTIVE_DEEPLINK_TEMPLATE } from "../config.ts";
import { isBusy, selectVariant } from "./variants.ts";
import { buildVerdict, CLEAN_STATUS_LINE } from "./verdict.ts";
import { buildRow } from "./rows.ts";
import { buildWeekBar } from "./weekBar.ts";

/** Substitute the target day into the locked Productive deep-link (D-24). */
function deepLink(targetDate: string): string {
  return PRODUCTIVE_DEEPLINK_TEMPLATE.replace("{DATE}", targetDate);
}

/** The single "Open in Productive" CTA section (D-24). */
function buttonSection(targetDate: string): Section {
  return {
    widgets: [
      {
        buttonList: {
          buttons: [
            { text: "Open in Productive", onClick: { openLink: { url: deepLink(targetDate) } } },
          ],
        },
      },
    ],
  };
}

/** The footer week-bar section with its locked header (D-23). */
function weekBarSection(report: StudioReport): Section {
  return {
    header: "Remaining studio time this week",
    widgets: buildWeekBar(report.rollup).map((p) => ({ textParagraph: p })),
  };
}

export const renderTemplate: RenderMessage = (report, ctx) => {
  // This plan implements only the "card" variant; 03-02 owns the others.
  const variant = selectVariant(report, ctx);
  if (variant !== "card") {
    throw new Error(`variant "${variant}" is handled in plan 03-02`);
  }

  const sections: Section[] = [];

  // 1 — verdict section (+ clean-night status line).
  const busy = isBusy(report, ctx);
  const verdictWidgets: Widget[] = [
    { textParagraph: { text: `<b>${buildVerdict(report, ctx)}</b>` } },
  ];
  if (!busy) {
    verdictWidgets.push({
      textParagraph: { text: `<font color="${BRAND_COLORS.muted}">${CLEAN_STATUS_LINE}</font>` },
    });
  }
  sections.push({ widgets: verdictWidgets });

  // 2 — per-designer rows (busy nights only), divider-separated (D-09 / D-17).
  if (busy) {
    const rowWidgets: Widget[] = [];
    report.designers.forEach((d, i) => {
      if (i > 0) rowWidgets.push({ divider: {} });
      rowWidgets.push(buildRow(d, ctx));
    });
    sections.push({ widgets: rowWidgets });
  }

  // 3 — CTA button.
  sections.push(buttonSection(ctx.header.targetDate));

  // 4 — week-bar footer.
  sections.push(weekBarSection(report));

  const payload: CardsV2Payload = {
    cardsV2: [
      {
        cardId: "studio-checkin",
        card: {
          header: {
            title: "Solvd Studio Check-in",
            subtitle: ctx.header.subtitle,
            imageUrl: AVATAR_PNG_URL,
            imageType: "CIRCLE",
          },
          sections,
        },
      },
    ],
  };
  return payload;
};
