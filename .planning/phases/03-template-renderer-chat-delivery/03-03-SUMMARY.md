---
phase: 03-template-renderer-chat-delivery
plan: 03
subsystem: chat-delivery
tags: [transport, webhook, security, result-boundary, tdd]
requires:
  - "src/render/cards.ts (CardsV2Payload type, plan 03-01)"
  - "src/productive/client.ts (Result<T> type, Phase 2)"
provides:
  - "src/chat/postToChat.ts — postToChat(payload, webhookUrl, fetch?) → Result<void>, the single side-effecting Chat POST"
affects:
  - "plan 03-04 composition root (reads GCHAT_WEBHOOK_URL, passes it in; exits non-zero on { ok: false } → REL-02)"
tech-stack:
  added: []
  patterns:
    - "Non-throwing Result boundary (reused from client.ts::getJson)"
    - "Injectable fetch for offline/deterministic stubbed tests (mirrors gather.test.ts)"
    - "Secret redaction: webhook URL stripped from every returned error (T-03-06)"
key-files:
  created:
    - "src/chat/postToChat.ts"
    - "src/chat/__tests__/postToChat.test.ts"
  modified: []
decisions:
  - "Reused Result<T> from src/productive/client.ts rather than declaring a third result convention (D-01 / PATTERNS shared boundary)."
  - "fetch is injectable (defaults to global fetch) so tests stub the network with zero real I/O."
  - "Redact the webhook URL from BOTH error paths (non-ok body echo + thrown message) via .split(webhookUrl).join('[webhook]') — stronger than 'never interpolate', it also strips a URL the upstream/exception puts there itself."
metrics:
  duration: 12min
  completed: 2026-06-03
---

# Phase 3 Plan 03: Chat Delivery Transport Summary

A single non-throwing `postToChat(payload, webhookUrl, fetch?)` that POSTs the Cards v2 JSON to the Google Chat incoming webhook and returns a `Result<void>` — the side-effecting twin of the pure renderer, built TDD and mirroring `src/productive/client.ts::getJson` exactly.

## What Was Built

- **`src/chat/postToChat.ts`** — the one outbound POST. Success (HTTP 2xx) → `{ ok: true, value: undefined }`; a non-ok status or a thrown fetch → `{ ok: false, error }` carrying only the HTTP status and a truncated (≤300-char) response body. A payload whose `JSON.stringify` length exceeds 32 KB is rejected before any fetch call. The function never throws across the boundary, so a dead webhook surfaces as `{ ok: false }` for the plan-04 composition root to turn into a non-zero exit and a GitHub failure email (REL-02).
- **`src/chat/__tests__/postToChat.test.ts`** — 7 stubbed-fetch cases: ok, POST shape (method/headers/body), non-ok with status+truncated body, long-body truncation, throwing fetch (never rejects), 32 KB guard (asserts fetch called 0 times), and a URL-leak gate asserting the webhook key/token appear in no error path.

## How It Satisfies the Plan

| must_have | Where |
|-----------|-------|
| 2xx → `{ ok: true }` (D-01) | `postToChat` success branch; test "resolves { ok: true } on an HTTP 2xx response" |
| non-ok / throw → `{ ok: false, error }` with status only, never the URL | non-ok + catch branches; tests assert `500`/`ECONNREFUSED` present, `SECRET_URL`/`AKEY`/`ATOKEN` absent |
| URL from `process.env.GCHAT_WEBHOOK_URL`, never logged/returned | URL is a parameter (plan 04 reads the env var and passes it in); redacted from both error paths |
| >32 KB payload rejected before the POST | size guard returns early; test asserts `calls.length === 0` |

## Trust / Security (threat model)

- **T-03-06 (info disclosure):** webhook URL is used only as the fetch target and is actively redacted from the non-ok body and the thrown message. The `webhookUrl` identifier appears in source only as the fetch first arg and inside `.split(webhookUrl)` redaction calls — never interpolated into a template-string error.
- **T-03-07 (availability):** failure is a `Result` value, never a swallowed exception — enables the plan-04 non-zero exit (REL-02).
- **T-03-08 (oversized payload):** 32 KB guard short-circuits before the network.
- **T-03-SC (installs):** no packages installed — native `fetch` only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Redact the webhook URL from upstream-supplied error text**
- **Found during:** Task 1 (GREEN — URL-leak test scenario where the server's 403 body echoes the full webhook URL).
- **Issue:** The plan's rule was "never interpolate `webhookUrl` into an error." But the secret can also leak when the *upstream response body* or the *thrown exception message* itself contains the URL — neither is something we interpolate, yet both would leak the key/token through our returned error. The threat register (T-03-06) requires the key/token in NO error path.
- **Fix:** Both error branches run `.split(webhookUrl).join("[webhook]")` on the body/message before returning, guaranteeing the secret cannot reach the caller via any path.
- **Files modified:** `src/chat/postToChat.ts`
- **Commit:** 41e9ea9

**2. [Rule 1 - Bug] Renamed the test's local fetch stub to avoid a tsc self-reference error**
- **Found during:** Task 1 verification (`npx tsc --noEmit`).
- **Issue:** Naming the stub `const fetch = (...) as typeof fetch` triggered TS7022 ("implicitly has type any … referenced in its own initializer").
- **Fix:** Renamed the local to `stub`, returned `{ fetch: stub }`.
- **Files modified:** `src/chat/__tests__/postToChat.test.ts`
- **Commit:** 41e9ea9

## TDD Gate Compliance

- RED commit `241d5d4` — `test(03-03): add failing stubbed-fetch tests` (test fails: `../postToChat.ts` unresolved).
- GREEN commit `41e9ea9` — `feat(03-03): implement postToChat webhook transport`.
- REFACTOR — none needed.

## Verification

- `node --import tsx --test "src/chat/__tests__/postToChat.test.ts"` → 7/7 pass.
- `npm test` → 139/139 pass.
- `npx tsc --noEmit` → exit 0, clean.

## Self-Check: PASSED

- FOUND: src/chat/postToChat.ts
- FOUND: src/chat/__tests__/postToChat.test.ts
- FOUND commit 241d5d4 (RED)
- FOUND commit 41e9ea9 (GREEN)
