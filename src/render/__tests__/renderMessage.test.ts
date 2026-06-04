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

  it("tentative line shows hours alone when no client detail is supplied (live-corrected 2026-06-04)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        designer({
          designerId: ELLA,
          status: "underbooked",
          availableHours: 7.5,
          bookedHours: 0,
          openHours: 7.5,
          openMin: h(7.5),
          tentativeMin: h(7),
          shaky: true,
        }),
      ],
      rollup: { totalMin: h(7.5), openMin: h(7.5), totalHours: 7.5, openHours: 7.5 },
      missingDesigners: [],
    };
    // tentativeHours present, client omitted entirely.
    const out = renderTemplate(report, ctx({ tentativeNotes: { [ELLA]: { tentativeHours: 7 } } }));
    const json = JSON.stringify(out);
    assert.ok(json.includes("7.0h tentative (on top)"), "tentative hours render");
    assert.ok(
      !json.includes("tentative (on top) · "),
      "no empty ' · ' client suffix when client omitted",
    );
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

  it("renders Productive-only — never leaks the GOOGLE_SA_KEY reason or a doubled prefix", () => {
    // Production now passes ctx.sourceErrors a Productive label ONLY; the raw
    // calendar error (with the GOOGLE_SA_KEY reason) never reaches the card.
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [],
      rollup: { totalMin: 0, openMin: 0, totalHours: 0, openHours: 0 },
      missingDesigners: [],
    };

    const out = renderTemplate(report, ctx({ sourceErrors: ["Productive"] }));
    const json = JSON.stringify(out);
    assert.ok(!json.includes("GOOGLE_SA_KEY"), "no SA-key reason in the degraded card");
    assert.ok(
      !json.includes("Couldn't reach Couldn't reach"),
      "no doubled 'Couldn't reach' prefix",
    );
    assert.ok(!json.includes("Calendar for"), "no raw per-designer calendar error text");
  });
});

describe("renderTemplate — calendar-unavailable note (REL-01, figures intact)", () => {
  /** A busy report so the normal card path (rows + button + week bar) renders. */
  function busyReport(): StudioReport {
    return {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        designer({
          designerId: ANISHA,
          status: "underbooked",
          openHours: 7.5,
          openMin: h(7.5),
          bookedHours: 0,
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
      rollup: { totalMin: h(45), openMin: h(10.5), totalHours: 45, openHours: 10.5 },
      missingDesigners: [],
    };
  }

  it("calendarUnavailable=true on a normal card → exactly one muted note, no 📅, still the normal card", () => {
    const out = renderTemplate(busyReport(), ctx({ calendarUnavailable: true }));
    const json = JSON.stringify(out);
    assert.ok(
      json.includes("couldn't check calendars tonight — meeting flags skipped"),
      "the muted calendars-unavailable note is present",
    );
    assert.ok(!json.includes("📅"), "no 📅 worth-a-look line on a calendar-only failure");
    assert.ok(
      json.includes("Open in Productive"),
      "still the NORMAL card (degraded card has no button)",
    );
    // Exactly one note — count occurrences of the note text.
    const count = json.split("couldn't check calendars tonight").length - 1;
    assert.equal(count, 1, "the muted note appears exactly once");
  });

  it("calendarUnavailable absent → no calendars-unavailable note", () => {
    const out = renderTemplate(busyReport(), ctx({}));
    const json = JSON.stringify(out);
    assert.ok(!json.includes("couldn't check calendars"), "no note when calendar is fine");
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

describe("renderTemplate — holiday variant (D-20)", () => {
  it("matches the locked holiday card JSON (warm message, no rows/bar/button)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-08",
      window: ["2026-06-08"],
      designers: [],
      rollup: { totalMin: 0, openMin: 0, totalHours: 0, openHours: 0 },
      missingDesigners: [],
    };

    const out = renderTemplate(
      report,
      ctx({
        holidayTomorrow: { dateLabel: "King's Birthday" },
        header: { subtitle: "Tomorrow · Monday 8 June", targetDate: "2026-06-08" },
      }),
    );
    assert.deepStrictEqual(out, loadFixture("holiday"));
  });

  it("holiday wins the cascade even when sourceErrors is also set (D-20 > D-18)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-08",
      window: ["2026-06-08"],
      designers: [],
      rollup: { totalMin: 0, openMin: 0, totalHours: 0, openHours: 0 },
      missingDesigners: [],
    };

    const out = renderTemplate(
      report,
      ctx({
        holidayTomorrow: { dateLabel: "King's Birthday" },
        sourceErrors: ["Productive"],
        header: { subtitle: "Tomorrow · Monday 8 June", targetDate: "2026-06-08" },
      }),
    );
    assert.deepStrictEqual(out, loadFixture("holiday"));
  });
});

describe("renderTemplate — closure variant (D-21)", () => {
  it("matches the locked closure card JSON (offsite message, no rows/bar/button)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-12",
      window: ["2026-06-12"],
      designers: [],
      rollup: { totalMin: 0, openMin: 0, totalHours: 0, openHours: 0 },
      missingDesigners: [],
    };

    const out = renderTemplate(
      report,
      ctx({
        closureTomorrow: { backDayLabel: "Monday 15 June" },
        header: { subtitle: "Tomorrow · Friday 12 June", targetDate: "2026-06-12" },
      }),
    );
    assert.deepStrictEqual(out, loadFixture("closure"));
  });
});

describe("renderTemplate — on-leave row (D-22 full day)", () => {
  it("matches the locked on-leave card JSON (minimal ⚪ row, nothing more)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        designer({ designerId: ANISHA, status: "off", availableHours: 0, bookedHours: 0 }),
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
      rollup: { totalMin: h(15), openMin: h(3), totalHours: 15, openHours: 3 },
      missingDesigners: [],
    };

    const out = renderTemplate(report, ctx({}));
    assert.deepStrictEqual(out, loadFixture("on-leave"));
  });
});

describe("renderTemplate — half-day leave row (D-22 partial)", () => {
  it("matches the locked half-day-leave card JSON (normal row + leave note)", () => {
    const report: StudioReport = {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        designer({
          designerId: ANISHA,
          status: "ok",
          availableHours: 4.0,
          confirmedMin: h(4),
          bookedHours: 4.0,
          openHours: 0,
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
      rollup: { totalMin: h(19), openMin: h(3), totalHours: 19, openHours: 3 },
      missingDesigners: [],
    };

    const out = renderTemplate(
      report,
      ctx({ leaveNotes: { [ANISHA]: "On leave until midday · 4h booked" } }),
    );
    assert.deepStrictEqual(out, loadFixture("half-day-leave"));
  });
});

describe("renderTemplate — 📅 worth-a-look sub-line (D-14 / MEET-04 / MSG-06)", () => {
  /** A busy report with the three designers so the rows section renders. */
  function worthALookReport(): StudioReport {
    return {
      targetDay: "2026-06-04",
      window: ["2026-06-04"],
      designers: [
        designer({
          designerId: ANISHA,
          status: "underbooked",
          openHours: 7.5,
          openMin: h(7.5),
          bookedHours: 0,
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
      rollup: { totalMin: h(45), openMin: h(10.5), totalHours: 45, openHours: 10.5 },
      missingDesigners: [],
    };
  }

  const FIX = loadFixture("worth-a-look") as {
    worthALook: Record<string, Array<{ title: string; durationMinutes?: number }>>;
  };

  it("renders a plain-text 📅 line (no hyperlink) with duration + 'not in Productive'", () => {
    const out = renderTemplate(worthALookReport(), ctx({ worthALook: FIX.worthALook }));
    // Rows are divider-separated: widget[0]=Anisha, [1]=divider, [2]=Ella,
    // [3]=divider, [4]=Liam. Liam gets the FDC line.
    const rowSection = out.cardsV2[0].card.sections[1];
    const liamRow = rowSection.widgets[4];
    assert.ok("decoratedText" in liamRow);
    const text = liamRow.decoratedText.text;
    assert.match(text, /📅 .*FDC IPO Launch Check-In/, "plain-text title in the 📅 line");
    assert.match(text, /1 hour/, "humanized duration (60 min → '1 hour')");
    assert.match(text, /not in Productive/, "ends with 'not in Productive'");
    assert.doesNotMatch(text, /<a href/, "no hyperlink on the 📅 line anymore (overrides MSG-06)");
    assert.doesNotMatch(text, /worth a look/, "'worth a look' wording removed");
  });

  it("the rendered card no longer says 'worth a look' or 'conflict', and does say 'not in Productive'", () => {
    const out = renderTemplate(worthALookReport(), ctx({ worthALook: FIX.worthALook }));
    const json = JSON.stringify(out);
    assert.ok(!json.includes("worth a look"), "'worth a look' wording removed");
    assert.ok(!/conflict/i.test(json), "never asserts a conflict (D-04)");
    assert.ok(json.includes("not in Productive"), "new 'not in Productive' tail present");
  });

  it("HTML-escapes the title (T-04-11) — a <script> title is never raw; no hyperlink", () => {
    const out = renderTemplate(worthALookReport(), ctx({ worthALook: FIX.worthALook }));
    const rowSection = out.cardsV2[0].card.sections[1];
    // Anisha (index 0) carries the XSS-shaped fixture entry (90 min → "1.5 hours").
    const anishaRow = rowSection.widgets[0];
    assert.ok("decoratedText" in anishaRow);
    const text = anishaRow.decoratedText.text;
    assert.match(text, /&lt;script&gt;/, "title is escaped");
    assert.doesNotMatch(text, /<script>/, "no raw script tag injected");
    assert.doesNotMatch(text, /<a href/, "no hyperlink (no link to escape anymore)");
    assert.match(text, /1\.5 hours/, "humanized duration (90 min → '1.5 hours')");
  });

  it("an entry with no durationMinutes renders '📅 {title}, not in Productive' (no duration segment, no NaN)", () => {
    const out = renderTemplate(
      worthALookReport(),
      ctx({ worthALook: { [LIAM]: [{ title: "Mystery meeting" }] } }),
    );
    const rowSection = out.cardsV2[0].card.sections[1];
    const liamRow = rowSection.widgets[4];
    assert.ok("decoratedText" in liamRow);
    const text = liamRow.decoratedText.text;
    assert.match(text, /📅 .*Mystery meeting.*not in Productive/, "title + tail present");
    assert.match(text, /Mystery meeting<\/font>, /, "tail joins title directly (no duration segment)");
    assert.doesNotMatch(text, / · /, "no ' · ' duration separator when duration is missing");
    assert.doesNotMatch(text, /undefined|NaN/, "never prints undefined/NaN");
  });

  it("a designer with no worthALook entry renders no 📅 line", () => {
    const out = renderTemplate(worthALookReport(), ctx({ worthALook: FIX.worthALook }));
    const rowSection = out.cardsV2[0].card.sections[1];
    // Ella (widget[2], divider-separated) has no fixture entry.
    const ellaRow = rowSection.widgets[2];
    assert.ok("decoratedText" in ellaRow);
    assert.doesNotMatch(ellaRow.decoratedText.text, /📅/);
  });

  it("an absent worthALook map is a no-op (no 📅 line anywhere)", () => {
    const out = renderTemplate(worthALookReport(), ctx({}));
    const json = JSON.stringify(out);
    assert.ok(!json.includes("📅"), "no 📅 line when worthALook is absent");
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
