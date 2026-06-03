/**
 * Tests for the pure templated renderer `renderTemplate` (Task 2, plan 03-01).
 *
 * renderTemplate is the render twin of computeStudioReport: a pure (report, ctx) →
 * CardsV2Payload function, no I/O, never recomputes a number. These tests pin the
 * locked card output to committed expected-JSON fixtures (one per mockup scenario)
 * via assert.deepStrictEqual — the trust-stable approach (NOT node:test's
 * experimental snapshot API; RESEARCH lines 53/310). Each scenario builds a
 * deterministic StudioReport + RenderContext that mirrors design/chat-card-mockups.html.
 *
 * Run: node --import tsx --test "src/render/__tests__/renderMessage.test.ts"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import type { DesignerId } from "../../domain/types.ts";
import type { DesignerResult } from "../../domain/capacity.ts";
import type { StudioReport } from "../../domain/report.ts";
import type { BriefFlag } from "../../productive/brief.ts";
import type { RenderContext } from "../cards.ts";
import { renderTemplate } from "../renderMessage.ts";

const ANISHA = "686712" as DesignerId;
const ELLA = "686716" as DesignerId;
const LIAM = "686717" as DesignerId;

const NAMES: Record<string, string> = {
  [ANISHA]: "Anisha Gittins",
  [ELLA]: "Ella Wright",
  [LIAM]: "Liam Mills",
};

function loadFixture(name: string): unknown {
  const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Minutes from hours, exact. */
const h = (hours: number): number => Math.round(hours * 60);

/** Build a DesignerResult with display fields the renderer reads. */
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

describe("renderTemplate — busy two-open scenario (MSG-01/02/03/07)", () => {
  it("matches the locked two-open card JSON", () => {
    const report: StudioReport = {
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
        designer({
          designerId: LIAM,
          status: "ok",
          confirmedMin: h(7.5),
          availableHours: 7.5,
          bookedHours: 7.5,
          openHours: 0,
        }),
      ],
      rollup: { totalMin: h(45), openMin: h(33), totalHours: 45, openHours: 33 },
      missingDesigners: [],
    };

    const briefFlags: BriefFlag[] = [
      {
        designerId: ELLA,
        bookingId: "b-ella-1",
        taskId: "t-str-050",
        jobLabel: "STR_050",
        reason: "blank-brief",
        isTentative: false,
      },
    ];

    const out = renderTemplate(
      report,
      ctx({
        briefFlags,
        tentativeNotes: { [ANISHA]: { tentativeHours: 3.5, client: "Dairy Farmers" } },
      }),
    );
    assert.deepStrictEqual(out, loadFixture("two-open"));
  });
});

describe("renderTemplate — clean scenario (MSG-04/05)", () => {
  it("matches the locked clean card JSON (no designer rows)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-05",
      window: ["2026-06-05"],
      designers: [
        designer({ designerId: ANISHA, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
        designer({ designerId: ELLA, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
        designer({ designerId: LIAM, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
      ],
      rollup: { totalMin: h(45), openMin: h(3), totalHours: 45, openHours: 3 },
      missingDesigners: [],
    };

    const out = renderTemplate(
      report,
      ctx({ header: { subtitle: "Tomorrow · Friday 5 June", targetDate: "2026-06-05" } }),
    );
    assert.deepStrictEqual(out, loadFixture("clean"));
  });
});

describe("renderTemplate — overbooked scenario (MSG-01/02)", () => {
  it("matches the locked overbooked card JSON (🟠 Xh over in #b06000)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        designer({
          designerId: ANISHA,
          status: "overbooked",
          confirmedMin: h(9),
          openMin: h(-1.5),
          availableHours: 7.5,
          bookedHours: 9.0,
          openHours: -1.5,
        }),
        designer({ designerId: ELLA, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
        designer({ designerId: LIAM, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
      ],
      rollup: { totalMin: h(45), openMin: 0, totalHours: 45, openHours: 0 },
      missingDesigners: [],
    };

    const out = renderTemplate(report, ctx({}));
    assert.deepStrictEqual(out, loadFixture("overbooked"));
  });
});

describe("renderTemplate — degraded scenario (REL-01 / D-18)", () => {
  it("matches the locked degraded card JSON (source unreachable, no rows/bar)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [],
      rollup: { totalMin: 0, openMin: 0, totalHours: 0, openHours: 0 },
      missingDesigners: [],
    };

    const out = renderTemplate(report, ctx({ sourceErrors: ["Productive"] }));
    assert.deepStrictEqual(out, loadFixture("degraded"));
  });

  it("names the source verbatim from ctx.sourceErrors (data-driven, not hardcoded)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [],
      rollup: { totalMin: 0, openMin: 0, totalHours: 0, openHours: 0 },
      missingDesigners: [],
    };

    const out = renderTemplate(report, ctx({ sourceErrors: ["Calendar"] }));
    const verdict = out.cardsV2[0].card.sections[0].widgets[0];
    assert.ok("textParagraph" in verdict);
    assert.match(verdict.textParagraph.text, /Couldn't reach Calendar tonight\./);
  });
});

describe("renderTemplate — per-designer miss (D-19 / MSG-07)", () => {
  it("matches the locked couldnt-read-one card JSON (🤖 row + nameless verdict)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        // The missing designer still occupies a roster slot; its figures are
        // ignored — the 🤖 row is keyed off missingDesigners.
        designer({ designerId: ANISHA, status: "underbooked", openHours: 7.5, bookedHours: 0 }),
        designer({ designerId: ELLA, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
        designer({ designerId: LIAM, status: "ok", confirmedMin: h(7.5), bookedHours: 7.5 }),
      ],
      rollup: { totalMin: h(45), openMin: h(7.5), totalHours: 45, openHours: 7.5 },
      missingDesigners: [ANISHA],
    };

    const out = renderTemplate(report, ctx({}));
    assert.deepStrictEqual(out, loadFixture("couldnt-read-one"));
  });
});

describe("renderTemplate — HTML-escaping (T-03-01 / V5)", () => {
  it("escapes &, <, > in a dynamic client name before insertion", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        designer({
          designerId: ANISHA,
          status: "underbooked",
          openHours: 7.5,
          openMin: h(7.5),
          bookedHours: 0,
          tentativeMin: h(2),
          shaky: true,
        }),
      ],
      rollup: { totalMin: h(7.5), openMin: h(7.5), totalHours: 7.5, openHours: 7.5 },
      missingDesigners: [],
    };

    const out = renderTemplate(
      report,
      ctx({
        tentativeNotes: { [ANISHA]: { tentativeHours: 2, client: "Tom & <Jerry>" } },
      }),
    );
    const rowSection = out.cardsV2[0].card.sections[1];
    const widget = rowSection.widgets[0];
    assert.ok("decoratedText" in widget);
    const text = widget.decoratedText.text;
    assert.match(text, /Tom &amp; &lt;Jerry&gt;/);
    assert.doesNotMatch(text, /Tom & </);
  });
});
