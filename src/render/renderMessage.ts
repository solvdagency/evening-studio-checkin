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
  GoogleCard,
  RenderContext,
  RenderMessage,
  Section,
  Widget,
} from "./cards.ts";
import type { StudioReport } from "../domain/report.ts";
import { AVATAR_PNG_URL, BRAND_COLORS, PRODUCTIVE_DEEPLINK_TEMPLATE } from "../config.ts";
import { isBusy, selectVariant } from "./variants.ts";
import { buildVerdict, CLEAN_STATUS_LINE } from "./verdict.ts";
import { buildRow, escapeHtml } from "./rows.ts";
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

/** The card header — fixed title + avatar, subtitle/targetDate from ctx. */
function cardHeader(ctx: RenderContext): GoogleCard["header"] {
  return {
    title: "Solvd Studio Check-in",
    subtitle: ctx.header.subtitle,
    imageUrl: AVATAR_PNG_URL,
    imageType: "CIRCLE",
  };
}

/** Wrap an ordered list of sections into the top-level cardsV2 payload. */
function payloadFrom(ctx: RenderContext, sections: Section[]): CardsV2Payload {
  return {
    cardsV2: [{ cardId: "studio-checkin", card: { header: cardHeader(ctx), sections } }],
  };
}

/**
 * The degraded variant (D-18 / REL-01): a source was unreachable, so the figures
 * are untrusted this run. Render header + a verdict/body section ONLY — no rows, no
 * week bar, no button. The source name is data-driven from ctx.sourceErrors (so a
 * future Calendar source reads "Couldn't reach Calendar"), escaped before insertion.
 * Never throws — it always returns a complete, postable payload (REL-01).
 */
function renderDegraded(ctx: RenderContext): CardsV2Payload {
  const source = escapeHtml(ctx.sourceErrors.join(" and "));
  const body =
    "No booking figures this run. I'll have them tomorrow evening — worth a check in Productive yourself in the meantime.";
  const widgets: Widget[] = [
    { textParagraph: { text: `<b>🤖 Couldn't reach ${source} tonight.</b>` } },
    { textParagraph: { text: `<font color="${BRAND_COLORS.muted}">${body}</font>` } },
  ];
  return payloadFrom(ctx, [{ widgets }]);
}

/**
 * The holiday (D-20) and closure (D-21) variants: header + a single warm
 * textParagraph with the locked copy and the date label interpolated + escaped.
 * No rows, no week bar, no button.
 */
function renderHoliday(ctx: RenderContext): CardsV2Payload {
  const dateLabel = escapeHtml(ctx.holidayTomorrow?.dateLabel ?? "");
  const text = `🎉 Public holiday tomorrow — ${dateLabel}. No check-in needed. Enjoy…`;
  return payloadFrom(ctx, [{ widgets: [{ textParagraph: { text } }] }]);
}

function renderClosure(ctx: RenderContext): CardsV2Payload {
  const backDayLabel = escapeHtml(ctx.closureTomorrow?.backDayLabel ?? "");
  const text = `📦 Studio's out tomorrow — team offsite. No check-in needed. Back ${backDayLabel}.`;
  return payloadFrom(ctx, [{ widgets: [{ textParagraph: { text } }] }]);
}

export const renderTemplate: RenderMessage = (report, ctx) => {
  // Ordered cascade (variants.ts): holiday → closure → degraded → card. The
  // always-posts variants short-circuit before the figures-bearing card.
  const variant = selectVariant(report, ctx);
  if (variant === "holiday") return renderHoliday(ctx);
  if (variant === "closure") return renderClosure(ctx);
  if (variant === "degraded") return renderDegraded(ctx);

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
  // A 🤖 per-designer miss (D-19) renders inside this normal card path, NOT as a
  // top-level variant — missingDesigners + leaveNotes are passed through to buildRow.
  if (busy) {
    const rowWidgets: Widget[] = [];
    report.designers.forEach((d, i) => {
      if (i > 0) rowWidgets.push({ divider: {} });
      rowWidgets.push(
        buildRow(d, {
          designerNames: ctx.designerNames,
          briefFlags: ctx.briefFlags,
          tentativeNotes: ctx.tentativeNotes,
          leaveNotes: ctx.leaveNotes,
          missingDesigners: report.missingDesigners,
        }),
      );
    });
    sections.push({ widgets: rowWidgets });
  }

  // 3 — CTA button.
  sections.push(buttonSection(ctx.header.targetDate));

  // 4 — week-bar footer.
  sections.push(weekBarSection(report));

  return payloadFrom(ctx, sections);
};
