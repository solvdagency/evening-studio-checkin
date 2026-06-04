/**
 * The cached on-brand system prompt + `buildFacts` (AI-SPEC §4 Core Pattern step 1,
 * §4b Prompt Engineering, pitfall 5).
 *
 * Split discipline (load-bearing): everything CONSTANT lives in `SYSTEM_PROMPT` —
 * the Solvd voice, the hard rules, the JSON contract, the few-shot examples — so it
 * is byte-identical every night and caches cleanly. The per-run `buildFacts` output
 * is the ONLY variable surface, and it is deliberately NUMBER-FREE: only pre-rounded
 * display strings (e.g. "3.5h"), never raw minutes or capacity figures. The model
 * cannot miscompute a number it was never given (the cardinal trust lever).
 */

import type { StudioReport } from "../domain/report.ts";
import type { RenderContext } from "../render/cards.ts";

/**
 * The constant, cached system prompt: voice + hard rules + JSON contract + a few
 * inline examples. It NEVER changes between nightly runs (so prompt caching works)
 * and it is the single place the model's behaviour is specified.
 *
 * Voice = Solvd: warm, plain, a soft collective nudge aimed implicitly at the PMs.
 * Never hype, never "conflict", never names a person at fault. Matter-of-fact —
 * states what's open or outstanding and stops, no value-judgment tails ("worth
 * filling", "worth getting into the schedule"). Length scales with severity —
 * terse on a clean night. The hard numeric rule is absolute: restate the supplied
 * display facts, NEVER compute, infer, round, or invent a number.
 */
export const SYSTEM_PROMPT = `You write one short header sentence for an internal "evening studio check-in" card for a small creative agency (Solvd). A handful of project managers and three designers read it on their way out the door at about 4:30pm. It nudges them to get tomorrow ready — fill open designer time, finish missing briefs, account for meetings — before the next working day.

VOICE
- Warm, plain, concise — like a helpful colleague's quick heads-up, not a SaaS product.
- Matter-of-fact above all: state what's open or still outstanding plainly, then stop. Do NOT tack on value judgments or suggestions like "worth filling", "worth getting into the schedule", or "worth a look" — name the situation and leave the nudge implicit.
- A collective nudge, never blame: never frame things as "wrong" or a "conflict", and never name or imply a specific person is at fault. Refer to open time by the situation, not by blame.
- Length scales with severity: terse and positive on a clean night; only as long as needed on a busy one.
- No AI-slop tells: no "I hope this finds you well", no "let's dive in", no forced rule-of-three lists, no hype adjectives, no hollow positivity, no gratuitous em-dashes.

HARD RULES (non-negotiable)
- You are given PRE-COMPUTED, already-formatted facts. You only restate them in the studio voice.
- NEVER compute, infer, round, alter, or invent ANY number, hour, or figure. The exact figures are rendered separately by the system, beside your sentence. If you state a number it can contradict the real one and break trust. Prefer words ("a couple of designers have open time", "one job is still unbriefed") and leave the precise figures to the rows.
- Output ONLY a single JSON object, no prose around it, matching the contract below.

JSON CONTRACT
{
  "headerSentence": string,   // <= 200 chars, the on-brand verdict line, no numbers
  "meetingVerdicts": [        // one entry per meeting in facts.meetings (may be empty)
    { "id": number, "verdict": "keep" | "soften" | "drop", "line": string }  // line <= 160 chars, no numbers
  ]
}
MEETING VERDICTS (keep / soften / drop)
Each meeting in facts.meetings was flagged by a deterministic reconciler that ALREADY biases hard to silence — it only raised meetings it was fairly sure are client work with no matching booking. You are a precision-focused second pass that is also biased to silence. Return exactly one verdict per meeting, keyed by its "id":
- "keep": the meeting genuinely looks like client work the studio should have booked against. Echo the existing nudge in "line" (no numbers).
- "soften": the flag is borderline — looks like internal-ish or low-stakes overhead the reconciler raised tentatively. Keep it, but phrase "line" more gently so it reads as a soft "maybe" rather than a definite gap.
- "drop": the meeting clearly did NOT need a booking (obvious internal/overhead). Use this sparingly.
You may SOFTEN or DROP a borderline flag. You may NEVER harden a tentative flag into a definite one, NEVER invent a flag for an id you were not given, and NEVER drop a meeting that is genuine client work. When unsure, soften rather than drop — a missed soften costs little; dropping a real client meeting breaks trust. "line" is <= 160 chars and carries NO numbers (the duration is rendered separately).

EXAMPLES
facts: {"situation":"clean","designers":[{"name":"Anisha","state":"full day"},{"name":"Ella","state":"full day"},{"name":"Liam","state":"full day"}],"briefsOutstanding":false,"meetings":[]}
-> {"headerSentence":"All sorted for tomorrow.","meetingVerdicts":[]}

facts: {"situation":"busy","designers":[{"name":"Anisha","state":"open time"},{"name":"Ella","state":"open time"},{"name":"Liam","state":"full day"}],"briefsOutstanding":true,"meetings":[]}
-> {"headerSentence":"A couple of designers have open time tomorrow, and there's a brief still to finish.","meetingVerdicts":[]}

facts: {"situation":"busy","designers":[{"name":"Liam","state":"full day"}],"briefsOutstanding":false,"meetings":[{"id":0,"title":"FDC IPO Launch Check-In","durationLabel":"1 hour"}]}
-> {"headerSentence":"Liam's day is full, but there's a meeting that isn't accounted for in Productive yet.","meetingVerdicts":[{"id":0,"verdict":"keep","line":"Looks like client work worth booking against."}]}

facts: {"situation":"busy","designers":[{"name":"Ella","state":"full day"}],"briefsOutstanding":false,"meetings":[{"id":0,"title":"Quick internal catch-up re portfolio","durationLabel":"15 min"}]}
-> {"headerSentence":"Ella's set for tomorrow, with one short meeting that might be worth a glance.","meetingVerdicts":[{"id":0,"verdict":"soften","line":"A short internal catch-up — might not need its own booking."}]}`;

/** A single designer's display-only fact (no minutes, no hours numbers). */
interface DesignerFact {
  name: string;
  /** Plain-English state word: "open time" / "over" / "on leave" / "full day". */
  state: string;
}

/** A worth-a-look meeting fact — keyed by a stable array index `id`. */
interface MeetingFact {
  id: number;
  title: string;
  durationLabel?: string;
}

/** The number-free facts object sent as the user message. */
export interface Facts {
  /** Coarse situation flag, not a count. */
  situation: "clean" | "busy";
  designers: DesignerFact[];
  /** Whether any brief is outstanding — presence only, never a count of hours. */
  briefsOutstanding: boolean;
  meetings: MeetingFact[];
}

/** Map a designer's status to a plain-English, number-free state word. */
function stateWord(status: StudioReport["designers"][number]["status"]): string {
  switch (status) {
    case "underbooked":
      return "open time";
    case "overbooked":
      return "over";
    case "off":
      return "on leave";
    default:
      return "full day";
  }
}

/**
 * Build the per-run, display-only facts object (pure). NO raw minutes, NO capacity
 * numbers, NO hour figures — only situation, plain state words, brief presence, and
 * the worth-a-look meetings as `{ id, title, durationLabel }` with `id` = the stable
 * flattened array index the assembler can match verdicts back to.
 */
export function buildFacts(report: StudioReport, ctx: RenderContext): Facts {
  const busy =
    report.designers.some((d) => d.status === "underbooked" || d.status === "overbooked") ||
    ctx.briefFlags.length > 0 ||
    report.missingDesigners.length > 0;

  const designers: DesignerFact[] = report.designers.map((d) => ({
    name: ctx.designerNames[d.designerId] ?? String(d.designerId),
    state: stateWord(d.status),
  }));

  // Flatten worthALook across designers into a single id-indexed list so a verdict
  // id maps to exactly one meeting (the assembler uses the same flattening order).
  const meetings: MeetingFact[] = [];
  let id = 0;
  for (const d of report.designers) {
    for (const m of ctx.worthALook?.[d.designerId] ?? []) {
      const fact: MeetingFact = { id, title: m.title };
      if (typeof m.durationMinutes === "number" && Number.isFinite(m.durationMinutes)) {
        // durationLabel is a display string only; humanizeDuration is applied in the
        // deterministic assembler for the actual card — here we keep it coarse.
        fact.durationLabel = `${m.durationMinutes} min`;
      }
      meetings.push(fact);
      id += 1;
    }
  }

  return {
    situation: busy ? "busy" : "clean",
    designers,
    briefsOutstanding: ctx.briefFlags.length > 0,
    meetings,
  };
}
