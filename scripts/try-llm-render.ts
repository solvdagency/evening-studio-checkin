/**
 * try-llm-render.ts — one live LLM render against a representative fixture, for the
 * Phase-5 human tone checkpoint (PLAN 05-01 final gate).
 *
 * It exercises the REAL Anthropic path: USE_LLM_RENDERER behaviour on, the
 * org-sanctioned ANTHROPIC_API_KEY read from the gitignored `.env` (via dotenv,
 * exactly as a local dev run would), a representative busy StudioReport +
 * RenderContext built in the renderMessage.test.ts helper style, then
 * `renderLlmOrTemplate(...)`. It prints the resulting verdict-section header
 * sentence and notes which renderPath was used (llm vs template fallback).
 *
 * This is a MANUAL, off-CI tool — it costs a fraction of a cent and needs the key.
 * It never posts to Chat; it only prints the header sentence for the human to judge
 * the on-brand voice and confirm the fallback degrades cleanly.
 *
 * Run:
 *   npx tsx scripts/try-llm-render.ts
 * To exercise the fallback, run it with a deliberately bad key:
 *   ANTHROPIC_API_KEY=sk-ant-bad npx tsx scripts/try-llm-render.ts
 */

import "dotenv/config";
import type { DesignerId } from "../src/domain/types.ts";
import type { DesignerResult } from "../src/domain/capacity.ts";
import type { StudioReport } from "../src/domain/report.ts";
import type { BriefFlag } from "../src/productive/brief.ts";
import type { CardsV2Payload, RenderContext } from "../src/render/cards.ts";
import { renderLlmOrTemplate } from "../src/llm/renderLlm.ts";

const ANISHA = "686712" as DesignerId;
const ELLA = "686716" as DesignerId;
const LIAM = "686717" as DesignerId;

const NAMES: Record<string, string> = {
  [ANISHA]: "Anisha Gittins",
  [ELLA]: "Ella Wright",
  [LIAM]: "Liam Mills",
};

/** Minutes from hours, exact (mirrors the test helper). */
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

/** A representative busy night: two designers with open time, one unbriefed job, one unaccounted meeting. */
function representativeReport(): StudioReport {
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

function representativeCtx(): RenderContext {
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
  return {
    designerNames: NAMES,
    sourceErrors: [],
    briefFlags,
    tentativeNotes: {},
    worthALook: { [LIAM]: [{ title: "FDC IPO Launch Check-In", durationMinutes: 60 }] },
    header: { subtitle: "Tomorrow · Thursday 4 June", targetDate: "2026-06-04" },
  };
}

/** Pull the verdict-section header text out of the assembled payload. */
function verdictHeader(payload: CardsV2Payload): string {
  const widget = payload.cardsV2[0]?.card.sections[0]?.widgets[0];
  if (widget && "textParagraph" in widget) return widget.textParagraph.text;
  return "(no verdict header found)";
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — add it to .env (the org-sanctioned key).");
    process.exit(1);
  }

  // Capture the structured run-log line renderLlmOrTemplate emits so we can report
  // which path (llm vs template fallback) was actually taken — without re-deriving it.
  const realLog = console.log;
  let renderPath = "unknown";
  let fallbackReason = "none";
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    if (line.startsWith("run-log ")) {
      try {
        const fields = JSON.parse(line.replace(/^run-log /, "")) as {
          renderPath?: string;
          fallbackReason?: string;
        };
        renderPath = fields.renderPath ?? renderPath;
        fallbackReason = fields.fallbackReason ?? fallbackReason;
      } catch {
        /* leave defaults */
      }
    }
    realLog(...args);
  };

  const payload = await renderLlmOrTemplate(representativeReport(), representativeCtx());
  console.log = realLog;

  const header = verdictHeader(payload);
  console.log("\n──────── live LLM render ────────");
  console.log(`renderPath:     ${renderPath}${renderPath === "template" ? ` (fallback: ${fallbackReason})` : ""}`);
  console.log(`header sentence: ${header}`);
  console.log("─────────────────────────────────");
  if (renderPath === "template") {
    console.log("Fallback used — the card carries the visible degraded note (template wording).");
  }
}

await main();
