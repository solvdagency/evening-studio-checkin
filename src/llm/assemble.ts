/**
 * `assembleCardsV2` — DETERMINISTIC card assembly with model PROSE ONLY (AI-SPEC
 * §4 Core Pattern step 4; threat T-05-01 / T-05-03 / the cardinal trust rule).
 *
 * The card is built by `renderTemplate(report, ctx)` — so EVERY figure, designer
 * row, week-bar dot, deep-link, header and section comes from `report`/`ctx`
 * exactly as the always-available template does today. The ONE and ONLY model
 * contribution is the verdict-section header sentence: we replace the deterministic
 * `buildVerdict` line with `escapeHtml(out.headerSentence)`. By construction there
 * is no code path by which a model number reaches a figure field — this is the
 * design that makes numberFidelity.test.ts pass.
 *
 * Why reuse renderTemplate rather than re-mirror its section assembly: re-mirroring
 * risks drift (a row or dot diverging from the template). Cloning the template's
 * payload and swapping the single prose widget GUARANTEES byte-identity of every
 * non-header element — the strongest possible form of the invariant.
 *
 * Slice 1 does NOT apply `out.meetingVerdicts` to the rows yet — the 📅 lines render
 * exactly as the template produces them. The verdicts are validated by zod and
 * carried here for the Slice-2 seam (keep/soften/drop adjudication), marked below.
 */

import type { CardsV2Payload } from "../render/cards.ts";
import type { StudioReport } from "../domain/report.ts";
import type { RenderContext } from "../render/cards.ts";
import { renderTemplate } from "../render/renderMessage.ts";
import { escapeHtml } from "../render/rows.ts";
import type { LlmOutput } from "./schema.ts";

/**
 * Assemble the Cards v2 payload from the deterministic template, substituting only
 * the verdict-section header prose with the (escaped) model sentence.
 *
 * Pure and deterministic: identical (report, ctx, out) yield deep-equal output.
 */
export function assembleCardsV2(
  report: StudioReport,
  ctx: RenderContext,
  out: LlmOutput,
): CardsV2Payload {
  // The deterministic baseline — every number/row/dot/link the card will ever show.
  const base = renderTemplate(report, ctx);

  // The holiday / closure / degraded variants have no verdict-section header
  // sentence to substitute (they are short fixed-copy cards). In those cases the
  // model prose is irrelevant — return the deterministic card unchanged so a
  // figures-untrusted or no-figures night never gains model text.
  if (
    ctx.holidayTomorrow ||
    ctx.closureTomorrow ||
    ctx.sourceErrors.length > 0
  ) {
    return base;
  }

  // Structured-clone the payload so we never mutate renderTemplate's output, then
  // overwrite ONLY the first widget of section 0 (the bold verdict header). All
  // other widgets/sections are copied verbatim from the template.
  const payload: CardsV2Payload = structuredClone(base);
  const verdictSection = payload.cardsV2[0]?.card.sections[0];
  const headerWidget = verdictSection?.widgets[0];
  if (headerWidget && "textParagraph" in headerWidget) {
    // The model sentence is PROSE: escape it before it enters the Cards v2 HTML
    // subset (T-05-03), then wrap it in the same <b>…</b> the template uses.
    headerWidget.textParagraph.text = `<b>${escapeHtml(out.headerSentence)}</b>`;
  }

  // SLICE-2 SEAM (not applied in Slice 1): out.meetingVerdicts would adjudicate the
  // reconciler's 📅 worth-a-look lines here — keep / soften / drop, ignoring unknown
  // ids and never inventing a flag (reconciler bias-to-silence, D-04). Slice 1
  // leaves the rows exactly as the template renders them.

  return payload;
}
