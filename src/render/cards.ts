/**
 * Cards v2 type contract + the swappable RenderMessage interface (the LLM-01 prep).
 *
 * Trust posture (mirrors the Phase-1 domain trust docblocks): every renderer that
 * satisfies `RenderMessage` is PURE — no I/O, no network, no clock, no randomness.
 * It reads ONLY the display-only `*Hours` fields from the report (and, as the one
 * documented exception, `rollup.*Min` for the dot-count in weekBar.ts) and NEVER
 * recomputes a number (RESEARCH anti-pattern line 297; CLAUDE.md trust constraint:
 * the team's trust depends on the figures being exact, so the renderer formats and
 * never calculates). Colour is limited to inline `<font color>` + emoji — there is
 * NO custom font (`<font face>`) and NO background/highlight colour (D-02, D-03).
 *
 * This is a type-only module mirroring the per-field-documented exported-interface
 * style of src/domain/capacity.ts `DesignerResult` and src/productive/brief.ts
 * `BriefFlag`. It defines the Google Chat Cards v2 payload shape (validated against
 * developers.google.com/workspace/chat/api/reference/rest/v1/cards + the locked
 * mockup, RESEARCH Pattern 4) and the single `RenderMessage` function type the
 * templated renderer satisfies today and the Phase-5 LLM renderer satisfies later.
 *
 * Boundary note (CLAUDE.md + 03-CONTEXT line 110): src/render/ sits ABOVE both
 * src/domain and src/productive and may import their OUTPUT types (StudioReport,
 * BriefFlag). It must NEVER import the raw Productive zod schemas, the HTTP client,
 * or any raw JSON:API response type — the forbidden edge is domain → productive,
 * not render → *.
 */

import type { StudioReport } from "../domain/report.ts";
import type { BriefFlag } from "../productive/brief.ts";

// ---------------------------------------------------------------------------
// Cards v2 widget types (developers.google.com .../rest/v1/cards; RESEARCH P4)
// ---------------------------------------------------------------------------

/**
 * The top-level webhook body. A single card is wrapped in the `cardsV2` array,
 * each entry carrying a stable `cardId` (this project uses "studio-checkin").
 */
export interface CardsV2Payload {
  cardsV2: Array<{
    /** Stable id for the card within the message ("studio-checkin"). */
    cardId: string;
    /** The card itself — header + ordered sections. */
    card: GoogleCard;
  }>;
}

/** A Cards v2 card: a header followed by the ordered content sections (D-06/D-08). */
export interface GoogleCard {
  /** The avatar + title + subtitle header (D-06, D-07). */
  header: CardHeader;
  /** Content sections in contractual top-to-bottom order (MSG-02). */
  sections: Section[];
}

/**
 * The card header. `imageType: "CIRCLE"` renders the brand-asterisk avatar PNG as
 * a circular avatar (D-07); `imageUrl` is the hosted public PNG (config.AVATAR_PNG_URL).
 */
export interface CardHeader {
  /** Fixed title — "Solvd Studio Check-in" (D-06). */
  title: string;
  /** "Tomorrow · {Weekday Date}" e.g. "Tomorrow · Thursday 4 June" (D-06). */
  subtitle: string;
  /** Public HTTPS PNG, anonymously fetchable by Google's renderer (D-07, Pitfall 4). */
  imageUrl: string;
  /** Circular avatar crop (D-07). */
  imageType: "CIRCLE";
}

/**
 * One content section. An optional `header` titles a section (used only by the
 * footer week-bar section, D-23); widgets render in array order.
 */
export interface Section {
  /** Optional section title — only the week-bar footer uses it ("Remaining…"). */
  header?: string;
  /** The widgets in this section, in render order. */
  widgets: Widget[];
}

/**
 * The widget union covering exactly the four widget kinds this card uses
 * (RESEARCH Pattern 4): body text, decorated rows, dividers, and the CTA button.
 * Each widget object carries exactly ONE of these keys.
 */
export type Widget =
  | { textParagraph: TextParagraph }
  | { decoratedText: DecoratedText }
  | { divider: Divider }
  | { buttonList: ButtonList };

/** A body-size paragraph of (HTML-subset) text — verdict, status line, week bar. */
export interface TextParagraph {
  /** Inline-HTML-subset text (`<b> <font color> <br>` …). */
  text: string;
}

/**
 * A decorated-text row — one per designer (D-09). ALL row content lives in the
 * single `text` field with `<br>` separators (D-09 hard rule); `topLabel`/
 * `bottomLabel` are deliberately NOT modelled here because their fixed small-caption
 * font violates the hierarchy-by-colour/weight-not-size rule (RESEARCH Pitfall 2).
 */
export interface DecoratedText {
  /** The whole row: line 1 + greyed detail + nested ⚠️/📄 lines, `<br>`-separated. */
  text: string;
  /** Wrap long lines rather than truncate (always true for designer rows). */
  wrapText?: boolean;
}

/** A horizontal rule between designer rows (mockup `<hr>`). Always an empty object. */
export type Divider = Record<string, never>;

/** A list of buttons — this card has exactly one, the "Open in Productive" CTA (D-24). */
export interface ButtonList {
  buttons: Button[];
}

/** A single button that opens an external link in a new tab (D-24). */
export interface Button {
  /** Button label — "Open in Productive" (D-24). */
  text: string;
  /** Opens the deep-link URL. */
  onClick: { openLink: { url: string } };
}

// ---------------------------------------------------------------------------
// The RenderContext + RenderMessage contract (RESEARCH Pattern 1)
// ---------------------------------------------------------------------------

/**
 * A per-designer tentative note for the ⚠️ "(on top)" line (D-14/D-15). Tentative
 * time is carried HERE (not in StudioReport) because the row needs the client name
 * and the additive tentative hours, which the domain report does not surface per
 * designer. Planner decision (mirrors the 03-RESEARCH leaveNotes/holiday approach):
 * keep this presentation-only detail in RenderContext so src/domain stays untouched.
 * The renderer reads `tentativeHours` as a pre-rounded display figure — it does NOT
 * derive it from any exact-minute field (trust rule).
 */
export interface TentativeNote {
  /** Pre-rounded additive tentative hours, display-only (e.g. 3.5 → "3.5h"). */
  tentativeHours: number;
  /** The client/job the tentative time is against — escaped before insertion. */
  client: string;
}

/**
 * Everything the renderer needs that is NOT in StudioReport (RESEARCH Pattern 1).
 * Each field documents the decision it satisfies.
 */
export interface RenderContext {
  /** Display names keyed by DesignerId (from config, never the API). */
  designerNames: Record<string, string>;
  /** Non-empty ⇒ degraded variant (D-18). Verbatim source labels e.g. "Productive". */
  sourceErrors: string[];
  /** Per-designer brief problems (D-16). Grouped under their designer in the row. */
  briefFlags: BriefFlag[];
  /** Per-designer additive tentative notes for the ⚠️ "(on top)" line (D-14/D-15). */
  tentativeNotes: Record<string, TentativeNote>;
  /** Set when tomorrow is a public holiday (D-20) — short warm message, no rows. */
  holidayTomorrow?: { dateLabel: string };
  /** Set when tomorrow is a studio closure/offsite (D-21). */
  closureTomorrow?: { backDayLabel: string };
  /** Pre-formatted "Tomorrow · Thursday 4 June" subtitle + the yyyy-MM-dd deep-link date. */
  header: { subtitle: string; targetDate: string };
}

/**
 * THE interface. The templated renderer (renderTemplate) satisfies this today; the
 * Phase-5 LLM renderer will satisfy the identical signature so it drops in behind
 * the same contract. Pure: (report, ctx) → CardsV2Payload, no I/O, never recomputes.
 */
export type RenderMessage = (report: StudioReport, ctx: RenderContext) => CardsV2Payload;
