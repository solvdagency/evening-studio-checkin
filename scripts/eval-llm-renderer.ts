/**
 * eval-llm-renderer.ts — the offline FLAG-FAIRNESS eval harness (AI-SPEC §5/§7;
 * threat T-05-06). Slice 2 (LLM-02) manual pre-ship gate.
 *
 * It runs the REAL prompt (the cached SYSTEM_PROMPT + the same Messages call the
 * nightly renderer uses) over the Phase-4 PM-labelled meetings
 * (src/calendar/__fixtures__/labelled-events.json), collects the model's
 * keep/soften/drop verdicts, and prints a pass/fail table scoring each verdict
 * against the PM label. The cardinal assertion: the model must NEVER `drop` a
 * meeting labelled genuine client work ("worth-a-look"). Any such drop is a HARD
 * FAIL and the harness exits non-zero, so it is usable as a manual gate before
 * changing the prompt, the model id, or the few-shot examples.
 *
 * This is a ONE-OFF tsx script, NOT a node:test — it lives under scripts/ so the
 * `npm test` glob (the src test-file glob) never picks it up, it is intentionally
 * EXCLUDED from CI (it costs a fraction of a cent and needs the key), and it is the
 * BEHAVIOURAL half of the never-drop-a-genuine-flag rule (the structural half is
 * src/llm/flagFairness.test.ts, which runs network-free in CI).
 *
 * Run (uses the org-sanctioned ANTHROPIC_API_KEY from .env):
 *   npx tsx scripts/eval-llm-renderer.ts
 * or explicitly with a dev key:
 *   ANTHROPIC_API_KEY=$DEV_KEY npx tsx scripts/eval-llm-renderer.ts
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { LlmOutput } from "../src/llm/schema.ts";
import { SYSTEM_PROMPT } from "../src/llm/prompt.ts";
import { defaultClient } from "../src/llm/client.ts";

/** The pinned model id — kept in lockstep with renderLlm.ts MODEL. */
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

interface LabelledEvent {
  _label?: string;
  _fixtureNote?: string;
  summary: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string };
}

/** A worth-a-look candidate fed to the model, with its PM ground-truth label. */
interface Candidate {
  id: number;
  title: string;
  durationLabel?: string;
  /** The PM label class derived from the fixture _label. */
  truth: "genuine" | "borderline" | "covered" | "other";
}

/** Load the PM-labelled golden set (real data). */
function loadLabelled(): LabelledEvent[] {
  const url = new URL("../src/calendar/__fixtures__/labelled-events.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as LabelledEvent[];
}

/**
 * Load the SYNTHETIC borderline/overhead set (eval-only — kept out of the golden
 * fixture so the real calendar tests stay clean). These are the soften/drop side
 * of the rubric: meetings that would surface as flag candidates but a PM would not
 * chase, so the LLM SHOULD soften or drop them (reducing over-flagging).
 */
function loadBorderline(): LabelledEvent[] {
  const url = new URL("./eval-borderline.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as LabelledEvent[];
}

/** Map a fixture _label to its ground-truth class for scoring. */
function truthOf(label: string): Candidate["truth"] {
  if (label.includes("worth-a-look")) return "genuine"; // genuine client work — must NEVER drop
  if (label.includes("borderline")) return "borderline"; // overhead/low-signal — SHOULD soften/drop
  if (label.includes("covered")) return "covered"; // reconciler stays silent — not surfaced
  return "other";
}

/** Coarse duration label (minutes) from a timed event, matching buildFacts style. */
function durationLabel(e: LabelledEvent): string | undefined {
  const s = e.start?.dateTime;
  const f = e.end?.dateTime;
  if (!s || !f) return undefined;
  const mins = Math.round((Date.parse(f) - Date.parse(s)) / 60000);
  return Number.isFinite(mins) && mins > 0 ? `${mins} min` : undefined;
}

/**
 * Build the worth-a-look candidate set. The reconciler only ever surfaces
 * genuine/borderline flags (it stays silent on covered ones) — so the realistic
 * eval input is the set of meetings that WOULD be raised. We include the
 * "worth-a-look"-labelled (genuine) events as the protected set, plus any
 * borderline ones, and exclude the "covered" / mechanical-filter cases that never
 * reach the model. Each candidate keeps its truth label for scoring.
 */
function buildCandidates(events: LabelledEvent[]): Candidate[] {
  const candidates: Candidate[] = [];
  let id = 0;
  for (const e of events) {
    const label = e._label ?? "";
    const truth = truthOf(label);
    // The flag candidates the reconciler would surface and the model must judge:
    // genuine (must NEVER drop) + borderline (SHOULD soften/drop). covered and
    // mechanically-filtered events never reach the model, so they are not sent.
    if (truth !== "genuine" && truth !== "borderline") continue;
    const c: Candidate = { id, title: e.summary, truth };
    const dur = durationLabel(e);
    if (dur) c.durationLabel = dur;
    candidates.push(c);
    id += 1;
  }
  return candidates;
}

/** The number-free facts payload (mirrors prompt.ts Facts; a busy single-designer night). */
function buildFactsPayload(candidates: Candidate[]) {
  return {
    situation: "busy" as const,
    designers: [{ name: "Liam", state: "full day" }],
    briefsOutstanding: false,
    meetings: candidates.map((c) => {
      const m: { id: number; title: string; durationLabel?: string } = {
        id: c.id,
        title: c.title,
      };
      if (c.durationLabel) m.durationLabel = c.durationLabel;
      return m;
    }),
  };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — add it to .env (the org-sanctioned key).");
    process.exit(1);
  }

  const events = [...loadLabelled(), ...loadBorderline()];
  const candidates = buildCandidates(events);
  const genuineCount = candidates.filter((c) => c.truth === "genuine").length;
  const borderlineCount = candidates.filter((c) => c.truth === "borderline").length;
  if (genuineCount === 0) {
    console.error("No genuine worth-a-look candidates found in the labelled set — nothing to eval.");
    process.exit(1);
  }

  const facts = buildFactsPayload(candidates);
  const client = defaultClient();

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content: JSON.stringify(facts) },
      { role: "assistant", content: "{" }, // prefill: force a bare JSON object
    ],
  });

  if (msg.stop_reason === "max_tokens" || msg.stop_reason === "refusal") {
    console.error(`model returned stop_reason="${msg.stop_reason}" — cannot score this run.`);
    process.exit(1);
  }

  const block = msg.content[0];
  const text = block && block.type === "text" ? (block.text ?? "") : "";
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse("{" + text);
  } catch {
    console.error("model response was not valid JSON — cannot score this run.");
    process.exit(1);
  }
  const validated = LlmOutput.safeParse(parsedJson);
  if (!validated.success) {
    console.error("model response failed LlmOutput schema validation — cannot score this run.");
    process.exit(1);
  }

  const byId = new Map<number, "keep" | "soften" | "drop">();
  for (const v of validated.data.meetingVerdicts) byId.set(v.id, v.verdict);

  // Score each candidate against its truth class:
  //  - genuine: a `drop` is the never-drop violation → HARD FAIL (T-05-06).
  //    keep/soften both pass (a missing verdict defaults to keep).
  //  - borderline: the model SHOULD reduce over-flagging → soften/drop is the
  //    desired outcome; a `keep` means it did not reduce noise (soft signal,
  //    not a hard fail — the toggle ships OFF until this reads well).
  let droppedGenuine = 0;
  let borderlineReduced = 0; // soften or drop on a borderline case (good)
  let borderlineKept = 0; // keep on a borderline case (over-flagging not reduced)

  console.log("\n──────── flag-fairness eval (genuine never-drop + borderline soften/drop) ────────");
  console.log(`model: ${MODEL}   genuine: ${genuineCount}   borderline (synthetic): ${borderlineCount}`);
  console.log("");
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log(`${pad("class", 11)} ${pad("verdict", 8)} ${pad("result", 7)} title`);
  console.log("─".repeat(78));

  for (const c of candidates) {
    const verdict = byId.get(c.id) ?? "keep"; // no verdict → treated as keep
    let result: string;
    if (c.truth === "genuine") {
      if (verdict === "drop") {
        droppedGenuine += 1;
        result = "FAIL"; // never-drop violation
      } else {
        result = "pass"; // kept or softened — genuine flag preserved
      }
    } else {
      // borderline
      if (verdict === "keep") {
        borderlineKept += 1;
        result = "noisy"; // not reduced — a PM-borderline flag survived as-is
      } else {
        borderlineReduced += 1;
        result = "good"; // softened or dropped — over-flagging reduced
      }
    }
    console.log(`${pad(c.truth, 11)} ${pad(verdict, 8)} ${pad(result, 7)} ${c.title}`);
  }

  console.log("─".repeat(78));
  console.log(
    `summary: genuine ${genuineCount} (drops-of-genuine ${droppedGenuine}) · ` +
      `borderline ${borderlineCount} (reduced ${borderlineReduced}, kept ${borderlineKept})`,
  );

  if (droppedGenuine > 0) {
    console.error(
      `\nHARD FAIL: the model dropped ${droppedGenuine} meeting(s) labelled genuine client work (never-drop rule, T-05-06).`,
    );
    console.error("Do NOT ship this prompt/model change. Tune the prompt/few-shots and re-run.");
    process.exit(1);
  }

  console.log("\nPASS: no genuine client-work flag was dropped (the hard rule holds).");
  if (borderlineCount > 0 && borderlineReduced === 0) {
    console.log(
      `NOTE: the model kept all ${borderlineCount} borderline case(s) — over-flagging was not reduced. ` +
        "The judgment toggle adds little value as tuned; refine the prompt/few-shots before enabling it in prod.",
    );
  } else if (borderlineCount > 0) {
    console.log(
      `Over-flagging reduced on ${borderlineReduced}/${borderlineCount} borderline case(s) — the soften/drop side is working.`,
    );
  }
  process.exit(0);
}

await main();
