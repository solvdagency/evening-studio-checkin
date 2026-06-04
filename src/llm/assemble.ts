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
 * Slice 2 (LLM-02) applies `out.meetingVerdicts` to the reconciler's 📅 worth-a-look
 * lines ONLY when `applyMeetingJudgment` is true (the default is false → byte-identical
 * to Slice 1). The verdicts are applied by deterministic code (`applyVerdicts`) BEFORE
 * rendering: a verdict can only soften the wording or drop a flag, never invent one.
 * Numbers/rows/week-bar/links are still sourced from the template regardless.
 */

import type { CardsV2Payload } from "../render/cards.ts";
import type { DesignerId } from "../domain/types.ts";
import type { StudioReport } from "../domain/report.ts";
import type { RenderContext } from "../render/cards.ts";
import type { WorthALookItem } from "../calendar/reconcile.ts";
import { renderTemplate } from "../render/renderMessage.ts";
import { escapeHtml } from "../render/rows.ts";
import type { LlmOutput } from "./schema.ts";
import { applyVerdicts } from "./applyVerdicts.ts";

/**
 * Apply the model's verdicts to `ctx.worthALook`, returning a NEW ctx with the
 * adjudicated worth-a-look map (or the original ctx unchanged when there is nothing
 * to judge). The flattening order is IDENTICAL to buildFacts (designers in
 * `report.designers` order, meetings in per-designer array order), so a verdict id
 * maps to exactly the meeting buildFacts sent. Pure: ctx is never mutated.
 */
function adjudicateWorthALook(
  report: StudioReport,
  ctx: RenderContext,
  out: LlmOutput,
): RenderContext {
  if (!ctx.worthALook) return ctx;

  // Flatten in buildFacts order, tracking which designer each flat index belongs to.
  const flat: WorthALookItem[] = [];
  const ownerByIndex: DesignerId[] = [];
  for (const d of report.designers) {
    for (const m of ctx.worthALook[d.designerId] ?? []) {
      flat.push(m);
      ownerByIndex.push(d.designerId as DesignerId);
    }
  }
  if (flat.length === 0) return ctx;

  // Pair each flat item with its original index so we can re-group AFTER applying
  // verdicts (applyVerdicts preserves order but may drop entries, so we re-derive
  // the owner from the surviving items' identity by walking in lockstep).
  const indexed = flat.map((item, i) => ({ item, i }));
  const adjudicatedFlat = applyVerdicts(
    indexed.map((p) => p.item),
    out.meetingVerdicts,
  );

  // applyVerdicts keeps input order and only drops/rewords, so we can re-attach
  // owners by replaying the same keep/soften/drop decision per original index.
  const byId = new Map<number, LlmOutput["meetingVerdicts"][number]>();
  for (const v of out.meetingVerdicts) byId.set(v.id, v);

  const regrouped: Record<string, WorthALookItem[]> = {};
  // Initialise every designer key that had a (possibly empty) list, so the shape
  // matches the original map (empty arrays render as no 📅 line, same as before).
  for (const key of Object.keys(ctx.worthALook)) regrouped[key] = [];

  let outCursor = 0;
  indexed.forEach(({ item, i }) => {
    const v = byId.get(i);
    if (v?.verdict === "drop") return; // dropped — contributes nothing
    const owner = ownerByIndex[i]!;
    // The adjudicated item at outCursor corresponds to this surviving input item.
    const survivor = adjudicatedFlat[outCursor] ?? { ...item };
    (regrouped[owner] ??= []).push(survivor);
    outCursor += 1;
  });

  return { ...ctx, worthALook: regrouped };
}

/**
 * Assemble the Cards v2 payload from the deterministic template, substituting only
 * the verdict-section header prose with the (escaped) model sentence — and, when
 * `applyMeetingJudgment` is true, applying the model's keep/soften/drop verdicts to
 * the worth-a-look lines BEFORE rendering (Slice 2 / LLM-02). With the flag false
 * (the default) the card is byte-identical to Slice-1-only output.
 *
 * Pure and deterministic: identical (report, ctx, out, flag) yield deep-equal output.
 */
export function assembleCardsV2(
  report: StudioReport,
  ctx: RenderContext,
  out: LlmOutput,
  applyMeetingJudgment = false,
): CardsV2Payload {
  // SLICE-2 SEAM: adjudicate the reconciler's 📅 worth-a-look lines with the model's
  // verdicts BEFORE rendering — ONLY when the judgment toggle is on. Deterministic
  // code (applyVerdicts) does the keep/soften/drop; unknown ids are no-ops and a flag
  // can never be invented (reconciler bias-to-silence, D-04 / AI-SPEC §6). When off,
  // renderCtx === ctx and the 📅 lines render exactly as the template produces them.
  const renderCtx = applyMeetingJudgment ? adjudicateWorthALook(report, ctx, out) : ctx;

  // The deterministic baseline — every number/row/dot/link the card will ever show.
  const base = renderTemplate(report, renderCtx);

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

  return payload;
}
