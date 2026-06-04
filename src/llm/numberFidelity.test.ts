/**
 * The cardinal-invariant property test (AI-SPEC §5, "the most important test in
 * the phase"): prove that NO model output can alter a number in the assembled card.
 *
 * For a battery of HOSTILE LlmOutput objects — fake hours in the header sentence,
 * injected HTML, fake numbers in a meetingVerdict line — `assembleCardsV2(report,
 * ctx, hostile)` must produce a payload whose every non-header element (designer
 * rows, week-bar section, button URL, card header, section order) is
 * deepStrictEqual to the deterministic `renderTemplate(report, ctx)` baseline. Only
 * the verdict-section header textParagraph (the prose) may differ — and even there,
 * the model text must be HTML-escaped (T-05-03), never inserted raw.
 *
 * Mirrors src/render/__tests__/renderMessage.test.ts: same ANISHA/ELLA/LIAM ids,
 * the same `designer`/`ctx` builders, assert.deepStrictEqual over a computed
 * baseline (no network, no key, no real client).
 *
 * Run: node --import tsx --test "src/llm/numberFidelity.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DesignerId } from "../domain/types.ts";
import type { DesignerResult } from "../domain/capacity.ts";
import type { StudioReport } from "../domain/report.ts";
import type { BriefFlag } from "../productive/brief.ts";
import type { RenderContext } from "../render/cards.ts";
import { renderTemplate } from "../render/renderMessage.ts";
import { assembleCardsV2 } from "./assemble.ts";
import type { LlmOutput } from "./schema.ts";

const ANISHA = "686712" as DesignerId;
const ELLA = "686716" as DesignerId;
const LIAM = "686717" as DesignerId;

const NAMES: Record<string, string> = {
  [ANISHA]: "Anisha Gittins",
  [ELLA]: "Ella Wright",
  [LIAM]: "Liam Mills",
};

/** Minutes from hours, exact. */
const h = (hours: number): number => Math.round(hours * 60);

function designer(over: Partial<DesignerResult> & { designerId: DesignerId }): DesignerResult {
  return {
    designerId: over.designerId,
    availableMin: over.availableMin ?? h(7.5),
    confirmedMin: over.confirmedMin ?? 0,
    tentativeMin: over.tentativeMin ?? 0,
    openMin: over.openMin ?? 0,
    status: over.status ?? "ok",
    shaky: over.shaky ?? false,
    availableHours: over.availableHours ?? 7.5,
    bookedHours: over.bookedHours ?? 0,
    openHours: over.openHours ?? 0,
  };
}

function ctx(over: Partial<RenderContext>): RenderContext {
  return {
    designerNames: NAMES,
    sourceErrors: [],
    briefFlags: [],
    tentativeNotes: {},
    header: { subtitle: "Tomorrow · Thursday 4 June", targetDate: "2026-06-04" },
    ...over,
  };
}

/** A busy report with real figures + a brief flag + a worth-a-look meeting. */
function busyReport(): StudioReport {
  return {
    targetDay: "2026-06-04",
    window: ["2026-06-04"],
    designers: [
      designer({
        designerId: ANISHA,
        status: "underbooked",
        availableHours: 7.5,
        bookedHours: 0,
        openHours: 7.5,
        openMin: h(7.5),
        tentativeMin: h(3.5),
        shaky: true,
      }),
      designer({
        designerId: ELLA,
        status: "underbooked",
        confirmedMin: h(4.5),
        openMin: h(3),
        availableHours: 7.5,
        bookedHours: 4.5,
        openHours: 3.0,
      }),
      designer({ designerId: LIAM, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
    ],
    rollup: { totalMin: h(45), openMin: h(33), totalHours: 45, openHours: 33 },
    missingDesigners: [],
  };
}

const BRIEF_FLAGS: BriefFlag[] = [
  {
    designerId: ELLA,
    bookingId: "b-ella-1",
    taskId: "t-str-050",
    jobLabel: "STR_050",
    reason: "blank-brief",
    isTentative: false,
  },
];

/** The full context the busy report renders against (rows + worth-a-look + tentative). */
function busyCtx(): RenderContext {
  return ctx({
    briefFlags: BRIEF_FLAGS,
    tentativeNotes: { [ANISHA]: { tentativeHours: 3.5, client: "Dairy Farmers" } },
    worthALook: { [LIAM]: [{ title: "FDC IPO Launch Check-In", durationMinutes: 60 }] },
  });
}

/**
 * The hostile inputs: each tries to smuggle a number or markup into the card. The
 * assembler must take NONE of them into a figure field, and must escape the prose.
 */
const HOSTILE: Array<{ name: string; out: LlmOutput }> = [
  {
    name: "fake free-hours claim in the header sentence",
    out: { headerSentence: "Sarah has 99 hours free tomorrow.", meetingVerdicts: [] },
  },
  {
    name: "injected HTML / fake bold zero in the header sentence",
    out: { headerSentence: "Everyone is at <b>0h</b> booked.", meetingVerdicts: [] },
  },
  {
    name: "fake numbers smuggled through a meetingVerdict line",
    out: {
      headerSentence: "A couple of things to sort tomorrow.",
      meetingVerdicts: [
        { id: 0, verdict: "keep", line: "Liam has 42.5h open and 3 unbriefed jobs" },
      ],
    },
  },
  {
    name: "verdict for an id the reconciler never raised (must be a no-op)",
    out: {
      headerSentence: "All sorted for tomorrow.",
      meetingVerdicts: [{ id: 999, verdict: "drop", line: "drop everything: 0h left" }],
    },
  },
];

describe("number fidelity — no model output can alter a figure (T-05-01, the cardinal invariant)", () => {
  const report = busyReport();
  const context = busyCtx();
  const baseline = renderTemplate(report, context);

  for (const { name, out } of HOSTILE) {
    it(`hostile (${name}): every non-header element is byte-identical to renderTemplate`, () => {
      const assembled = assembleCardsV2(report, context, out);

      // Card id, header, and section count/shape must be identical.
      assert.equal(assembled.cardsV2.length, 1);
      assert.equal(assembled.cardsV2[0].cardId, baseline.cardsV2[0].cardId);
      assert.deepStrictEqual(
        assembled.cardsV2[0].card.header,
        baseline.cardsV2[0].card.header,
        "card header (title/subtitle/avatar) is deterministic",
      );

      const aSections = assembled.cardsV2[0].card.sections;
      const bSections = baseline.cardsV2[0].card.sections;
      assert.equal(aSections.length, bSections.length, "same section count + order");

      // Section 0 is the verdict section. Only its FIRST widget (the bold header
      // prose) may differ; every other widget in it (e.g. the calendar note) and
      // every other section (rows, button, week bar) must be deepStrictEqual.
      aSections.forEach((section, i) => {
        if (i === 0) {
          // Verdict-section header widget may differ (the prose) — assert the REST
          // of the verdict section is identical, then check the prose separately.
          assert.deepStrictEqual(
            section.widgets.slice(1),
            bSections[i].widgets.slice(1),
            "non-header widgets in the verdict section are deterministic",
          );
        } else {
          assert.deepStrictEqual(
            section,
            bSections[i],
            `section ${i} (rows / button / week bar) is byte-identical to the template`,
          );
        }
      });
    });

    it(`hostile (${name}): the prose is HTML-escaped, never inserted raw (T-05-03)`, () => {
      const assembled = assembleCardsV2(report, context, out);
      const headerWidget = assembled.cardsV2[0].card.sections[0].widgets[0];
      assert.ok("textParagraph" in headerWidget, "verdict header is a textParagraph");
      const text = headerWidget.textParagraph.text;
      // Any '<'/'>' the model emitted must be escaped before insertion.
      assert.doesNotMatch(text, /<b>0h<\/b>/, "raw model markup never reaches the card");
      if (out.headerSentence.includes("<")) {
        assert.match(text, /&lt;/, "model angle brackets are escaped");
      }
    });
  }

  it("the assembled verdict prose uses the model headerSentence (escaped), not buildVerdict", () => {
    const out: LlmOutput = {
      headerSentence: "There's a bit of open time worth filling before tomorrow.",
      meetingVerdicts: [],
    };
    const assembled = assembleCardsV2(report, context, out);
    const headerWidget = assembled.cardsV2[0].card.sections[0].widgets[0];
    assert.ok("textParagraph" in headerWidget);
    assert.match(
      headerWidget.textParagraph.text,
      /There's a bit of open time worth filling before tomorrow\./,
      "the model's prose is what renders in the verdict header",
    );
  });
});
