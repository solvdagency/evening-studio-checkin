---
phase: 02-productive-pull-briefed-discovery
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/config.ts
  - src/holidays.ts
  - src/productive/client.ts
  - src/productive/schemas.ts
  - src/productive/types.ts
  - src/productive/mappers.ts
  - src/productive/briefed.ts
  - src/productive/brief.ts
  - src/productive/gather.ts
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
critical_resolved:
  - CR-01
  - CR-02
critical_open: 0
fix_log:
  - "2026-06-03: CR-01 + CR-02 fixed via TDD (commits 85637c6, 846e49c). Warnings/Info untouched."
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 2 Productive ingestion tier: the non-throwing client, zod boundary schemas, raw types, the booking/absence mapper, the briefed-column resolution, brief-flag emission, and the `gather` composition root. The trust-critical posture is largely sound: the token lives only in headers and is never interpolated into a URL or echoed in an error (`client.ts` error paths use `HTTP ${status}` / `e.message` only), the boundary uses `safeParse` everywhere, failures degrade into `sourceErrors`, the domain boundary holds (no `src/domain` import of `src/productive`), and the per-day minutes arithmetic is integer-minute and guarded against NaN/Infinity/zero-divisor.

Two correctness defects rise to Critical, both in `gather.ts` and both affecting the trust-critical hour figures. The `/allocations` tentative-capture path (the post-SC-4 GAP-CLOSURE) does not filter canceled allocations, so a canceled allocation can be resurrected as tentative work; and a non-rostered person's allocation/booking can leak into the synthesized set because the allocations and bookings pulls are person-filtered server-side but the set-difference and roster attribution never re-verify the person id. The remaining findings are robustness and clarity issues.

This phase has no LLM-in-the-loop arithmetic (correct) and no secret-leak path that I could trace (correct).

## Critical Issues

### CR-01: Canceled allocations are synthesized as tentative work, inflating the hour figures

> **RESOLVED 2026-06-03 (commit 85637c6).** `AllocationAttributes` now captures `canceled` (raw JSON:API attribute name, defaulting false). The `/allocations` query adds `filter[canceled]=false` AND the gather loop skips `a.attributes.canceled === true` before synthesis (defense-in-depth, never trusting the server filter alone). `tentativeAllocationToRawBooking` now propagates the true `canceled` value so the mapper's existing `canceled===true` skip is a second guard. TDD test added: a canceled allocation-only record is NOT synthesized as tentative; a non-canceled one still is.

**File:** `src/productive/gather.ts:396-418` (with `:299` and `:351-356`)
**Issue:** The `/bookings` pull filters `filter[canceled]=false` (line 355), so `confirmedIds` (line 396) contains only non-canceled bookings. The `/allocations` pull (lines 397-402) has **no `filter[canceled]` and no canceled attribute check**. The set-difference at line 414 therefore treats *any* allocation absent from the confirmed set as tentative — including a canceled allocation that simply isn't in the (canceled-filtered) bookings result. `tentativeAllocationToRawBooking` then hard-codes `canceled: false` (line 299) and forces `draft: true`, so a canceled allocation flows into `mapToBookingsAndAbsences` as live tentative work. `AllocationAttributes` (schemas.ts:146-156) does not even capture a `canceled` field, so the mapper's defensive `a.canceled === true` skip (mappers.ts:157) can never catch it. Result: tentative minutes — surfaced as "shaky" time on the message — can be overstated by phantom canceled work. This violates the project's hard rule that the numbers must be exact.
**Fix:** Filter canceled allocations at the source and/or capture the field and skip it. Minimal source-side fix:
```ts
const allocationsQuery =
  `filter[person_id]=${personFilter}` +
  `&filter[after]=${targetKey}` +
  `&filter[before]=${lastKey}` +
  `&filter[canceled]=false` +          // mirror the /bookings filter
  `&include=person,service,event`;
```
Defense-in-depth: add `canceled: z.boolean()` to `AllocationAttributes`, propagate it through `tentativeAllocationToRawBooking` (instead of hard-coding `false`), and `continue` on `a.attributes.canceled === true` in the allocations loop. Do not rely on the source filter alone given the "never trust the boundary" posture.

### CR-02: Allocation/booking rows are never re-checked against the roster, so a non-monitored person can leak into the figures

> **RESOLVED 2026-06-03 (commit 846e49c).** Added a `ROSTER` set + a `seen` set in `gather`. Both the bookings and allocations loops now resolve the row's `person` id and drop any row whose id is `null` (un-included/missing) or not in the roster, recording a `sourceError` ("a booking/allocation row had no rostered person (skipped)") instead of producing a `""`-keyed booking. `assessedDesigners` is now derived from `seen` (rostered ids actually observed on a resolved row across bookings AND allocations, in roster order) rather than the static `DESIGNER_PERSON_IDS` — so a designer the pull never reached falls through to the report's `missingDesigners` (T-02-15), while a designer reached with zero confirmed bookings is still assessed. The captured `bookings-page.json` fixture (pre-include-fix capture: `person` was a not-included marker) was given realistic rostered `person` linkages so the happy-path tests exercise real resolution rather than the former hard-coded roster. TDD tests added: (1) a missing-person row → that designer in `missingDesigners`, not silently empty-but-assessed; (2) a designer reached only via allocations with zero bookings is still assessed.

**File:** `src/productive/gather.ts:370-381`, `:407-417`, `:471`, `:507`
**Issue:** Roster attribution depends entirely on the server-side `filter[person_id]` and on `linkedId(raw.relationships.person)` resolving to a rostered id. But the mapper writes `designerId = linkedId(person) ?? ""` (mappers.ts:161) and `gather` declares `assessedDesigners = DESIGNER_PERSON_IDS` unconditionally (line 471). If the `person` linkage is missing/un-included on any row (the exact failure mode the 02-04 include-set bug already proved can happen), `designerId` becomes `""`. Downstream `report.ts` filters bookings by `b.designerId === designerId` against the roster, so an empty-id booking silently contributes to nothing — but its minutes have already been mapped, and a row whose person id is a *different* (non-monitored) Productive person id (e.g. a shared/assigned allocation, or a person filter that the API interprets more loosely than expected) would be attributed to whichever roster member shares that id, or dropped, with no `sourceError`. There is no assertion anywhere that `designerId ∈ DESIGNER_PERSON_IDS`. Because `assessedDesigners` is hard-coded to the full roster, a pull that silently dropped one designer's rows (empty person id) would still report that designer as "assessed, present-but-empty" rather than missing — defeating the T-02-15 partial-result guard the report layer was built to honor.
**Fix:** Filter to rostered designers explicitly after mapping, and derive `assessedDesigners` from what actually resolved, not from the constant:
```ts
const ROSTER = new Set<string>(DESIGNER_PERSON_IDS);
// when building rawBookings / synthesizing allocations:
const pid = relId(parsed.data.relationships.person);
if (pid === null || !ROSTER.has(pid)) {
  sourceErrors.push("a booking row had no rostered person (skipped)");
  continue;
}
// ...
// assessedDesigners = the rostered ids actually seen on at least one resolved row
const seen = new Set<DesignerId>(/* collect pid as DesignerId per kept row */);
const assessedDesigners = DESIGNER_PERSON_IDS
  .filter((id) => seen.has(id as DesignerId))
  .map((id) => id as DesignerId);
```
At minimum, drop any row whose resolved person id is not in the roster, and ensure an empty/unmatched person id is recorded as a `sourceError` rather than silently producing a `""`-keyed booking.

## Warnings

### WR-01: Tentative allocation can be double-counted against its own confirmed booking when ids differ

**File:** `src/productive/gather.ts:396`, `:414`
**Issue:** The set-difference dedupe assumes `/allocations` and `/bookings` share *identical resource ids* for confirmed records (asserted in schemas.ts:128-134 and the 02-04 summary). That assumption is load-bearing and unverified in code. If Productive ever returns a confirmed allocation under a different id than its booking (a plausible API variation — allocations and bookings are distinct resource types), the same scheduled time is counted once as confirmed (from `/bookings`) and again as tentative (from `/allocations`), inflating the day. There is no guard beyond the id-equality assumption.
**Fix:** This is correctness-fragile. At minimum, document the dependency loudly at the dedupe site and add a unit test pinning "an allocation whose id matches a booking id is dropped." Consider a secondary dedupe key (person + service + started_on + figure) as defense if id-sharing cannot be guaranteed across the API contract.

### WR-02: `descriptionNonEmpty` HTML strip is naive and can misjudge the brief guard

**File:** `src/productive/gather.ts:121-125`
**Issue:** `description.replace(/<[^>]*>/g, "").trim()` is the entire D-04 false-trust guard — the line that decides whether a task is "briefed" or "blank-brief". A brief containing only an HTML entity (`&nbsp;`), an image with no text (`<img src=...>` strips to empty — correct), or only list-bullet markup may strip to a non-empty or empty string in ways that misclassify. `&nbsp;`-only content survives the strip+trim as a non-breaking space that `.trim()` does not remove in all engines, so a visually-blank brief reads as content → a blank brief is wrongly treated as briefed (a false-trust miss, the exact thing D-04 exists to prevent). Productive descriptions are rich-text/markdown, so entity-only content is realistic.
**Fix:** Decode/normalize before testing. At minimum also strip non-breaking spaces and common entities:
```ts
return description
  .replace(/<[^>]*>/g, "")
  .replace(/&nbsp;|&#160;| /gi, " ")
  .trim().length > 0;
```
A unit test with an `&nbsp;`-only and an `<img>`-only description would pin the intent.

### WR-03: `fetchAllPages` has no page cap — a runaway `total_pages` loops unbounded

**File:** `src/productive/client.ts:100-115`
**Issue:** The pagination loop is `while (true)` and only breaks on `current_page >= total_pages`. The trust posture is "never crash the nightly run," but if the API returns a corrupted/huge `total_pages` (or `current_page` never advances to meet it because the server returns a fixed page), this loops without bound — a soft hang on a scheduled job with no always-on monitor. The `JsonApiPage` schema validates the shape but not that `current_page` is actually advancing.
**Fix:** Add a hard page ceiling (the three designers over a one-week window are a handful of rows; even 50 pages is absurd) and break with a `sourceError` if exceeded:
```ts
const MAX_PAGES = 100;
if (page > MAX_PAGES) {
  return { ok: false, error: `pagination exceeded ${MAX_PAGES} pages in ${path}` };
}
```

### WR-04: Query parameters are not URL-encoded — brittle and a latent correctness risk

**File:** `src/productive/gather.ts:351-356`, `:397-401`, `:101` (client)
**Issue:** Filter values are interpolated raw into the query string (`filter[person_id]=${personFilter}`, `&include=${include}`, dates). Today the values are digits, commas, dashes and dotted include paths — all incidentally URL-safe — so it works. But this is unencoded user-adjacent config (`DESIGNER_PERSON_IDS`, `STUDIO_CLOSURES`-derived dates indirectly): the moment any value contains a character needing escaping, the query silently malforms and the pull degrades or returns wrong rows. Not a secret-leak (the token is in headers), so not Critical, but it is a correctness landmine in a trust-critical pull.
**Fix:** Build queries with `URLSearchParams` (note JSON:API bracket keys must be passed as literal keys, which `URLSearchParams` encodes acceptably for Productive) or `encodeURIComponent` each value. At minimum encode the date/filter *values*.

### WR-05: `targetKey` / `lastKey` can be empty strings, producing a malformed window filter

**File:** `src/productive/gather.ts:323`, `:325-326`, `:351-356`
**Issue:** `targetKey = targetDay.toISODate() ?? ""` and `lastKey = windowKeys[...] ?? targetKey`. If `toISODate()` ever returns null (an invalid DateTime — defensive, but the code explicitly guards for it with `?? ""`), the bookings query becomes `filter[after]=&filter[before]=...`, which is a malformed filter the API may interpret as "no bound," pulling a far wider or empty set. The downstream math would then run on wrong rows with no `sourceError`. The `?? ""` swallows the only signal that the clock produced garbage.
**Fix:** Treat an empty `targetKey` as a hard degrade before issuing any request:
```ts
if (targetKey === "" || lastKey === "") {
  sourceErrors.push("could not derive a valid target window (clock returned invalid date)");
  return degraded();
}
```

### WR-06: `getJson` parses non-JSON / empty bodies without guarding `res.json()`

**File:** `src/productive/client.ts:67-74`
**Issue:** On a 200 with a non-JSON or empty body (a proxy error page, a truncated response), `await res.json()` throws — which is caught by the surrounding `try/catch` and degrades correctly. That part is fine. But the catch collapses *all* failures (network, DNS, JSON-parse) into one opaque error string, so a JSON-parse failure on a 200 is reported identically to a network drop. For a job whose whole value is a trustworthy nightly signal, distinguishing "the API is down" from "the API returned garbage" matters for the degraded-mode note.
**Fix:** Optional hardening — branch the body read so a parse failure yields a distinct message (e.g. `non-JSON body (HTTP ${res.status})`). Low severity; behavior is already non-throwing.

## Info

### IN-01: Stale, unused raw types declare fields that do not exist on the live API

**File:** `src/productive/types.ts:40-42`
**Issue:** `RawBookingAttributes` still declares `booking_type: string` and `approval_status: number | null`, which the 02-01 live probe confirmed are NOT on the live `/bookings` resource. The schemas and mappers were corrected; this file was not. It has no runtime path (nothing imports these for execution — the mapper defines its own `RawBookingForMapping`), so it is dead-but-misleading documentation that contradicts `schemas.ts`.
**Fix:** Delete `src/productive/types.ts` or remove the `booking_type` / `approval_status` fields and the `RawBookingResource`/`RawRelationship` interfaces if nothing imports them. (Flagged in the 02-04 summary as carried tech-debt; not in scope to fix here.)

### IN-02: Synthetic `service` linkage id can collide and is a code smell

**File:** `src/productive/gather.ts:305`
**Issue:** When a tentative allocation has no `service` linkage, the code fabricates `{ data: { id: "alloc-" + parsed.id, type: "services" } }` purely to make the mapper classify the row as work. This is a hack that works because the mapper only checks linkage presence, not the id's validity. It is fragile: any future consumer that trusts `service.data.id` as a real service id would break, and the `"alloc-"` prefix is an undocumented magic convention.
**Fix:** Acceptable given the mapper contract, but add a one-line comment that this id is a sentinel never used as a real service id, and consider a dedicated boolean on `RawBookingForMapping` (e.g. `isWork`) rather than overloading the relationship shape.

### IN-03: `briefed.ts` re-resolves the briefed position that `brief.ts` already computed

**File:** `src/productive/brief.ts:118` and `:128-130`
**Issue:** `assessBriefs` calls `isBriefed(...)` (which internally does `briefedPositionByWorkflow.get(workflowId)` and the `>=` compare), then on the not-briefed branch immediately re-does `briefedPositionByWorkflow.get(b.task.workflowId)` and re-derives `atOrPastBriefed`. Minor duplicated lookup/logic; not a bug, but the two code paths could drift if one is edited and not the other.
**Fix:** Have `isBriefed` (or a small helper) return the discriminated reason directly, so `assessBriefs` does not re-compute the position comparison.

### IN-04: Case-sensitive exact match on the "Briefed" status name is brittle

**File:** `src/productive/briefed.ts:26`, `:70`
**Issue:** `BRIEFED_STATUS_NAME = "Briefed"` is matched with strict `!==`. A studio rename to "briefed", " Briefed" (trailing space), or "Briefed " silently yields no Briefed column for that workflow → the whole workflow fails safe to not-briefed, flagging every client task in it as "not-briefed" noise. The fail-safe direction is defensible (false positives, not false trust), but a trailing-space typo in the Productive UI would produce a wall of false flags and kill trust.
**Fix:** Normalize before comparing: `s.attributes.name.trim().toLowerCase() === "briefed"`. Document that the match is normalized.

### IN-05: Magic number `2`/`1` for `project_type_id` lacks a named constant

**File:** `src/productive/gather.ts:188`
**Issue:** `isClientByProject.set(parsed.data.id, typeId === 2)` encodes the live-confirmed "client === 2, internal === 1" enum as a bare literal. The direction was disputed and resolved live (per the brief.ts comment), making it exactly the kind of value that should be a named, commented constant so a future reader does not flip it.
**Fix:** `const PROJECT_TYPE_CLIENT = 2; // live-confirmed: 1=internal, 2=client (D-06)` and compare against it.

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
