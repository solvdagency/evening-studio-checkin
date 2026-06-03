# Evening Studio Check-in

A nightly automation for Solvd's creative studio. Every weekday at **4:30pm Australia/Sydney** it reads the design team's resourcing from Productive.io, computes exactly what needs sorting before the next working day, and posts an on-brand "evening check-in" Cards v2 message to Google Chat — so the three designers walk in to a full, briefed day instead of chasing work.

All hour/capacity arithmetic is done in deterministic TypeScript (never an LLM) — the numbers must be exact or the team stops reading the message.

## How it runs

- **Schedule:** GitHub Actions cron, `30 16 * * 1-5` with `timezone: Australia/Sydney` (DST-aware). No always-on server.
- **Entrypoint:** `node --import tsx src/index.ts` (the `runNightly` composition root). It carries a luxon weekday guard as defence-in-depth — a weekend run exits 0 without posting.
- **Pipeline:** `gather` (Productive pull) → `computeStudioReport` (deterministic figures) → `renderTemplate` (Cards v2 payload) → `postToChat` (the one outbound POST).

## One-time setup

### 1. Create the Google Chat webhook

In the **target Chat space**: `Apps & integrations` → `Webhooks` → `Create`. Copy the full webhook URL (it includes the `key` + `token` query params — this is the auth, treat it as a secret).

### 2. Add the GitHub Actions secrets

Repo → `Settings` → `Secrets and variables` → `Actions` → `New repository secret`. Add all three:

| Secret | Value |
|--------|-------|
| `GCHAT_WEBHOOK_URL` | the full Chat webhook URL from step 1 |
| `PRODUCTIVE_AUTH_TOKEN` | Productive personal access token (`X-Auth-Token`) |
| `PRODUCTIVE_ORG_ID` | Productive org id (the numeric prefix of the org slug, e.g. `34092`) |

`.env.example` lists the same names for local dev — copy it to a gitignored `.env` with real values to run locally.

### 3. Confirm the avatar PNG is publicly reachable

The card header avatar is `assets/avatar-asterisk.png` (white brand asterisk on a black `#0A0A0A` circle). Google's image renderer fetches it **server-side and anonymously**, so the URL in `src/config.ts` (`AVATAR_PNG_URL`) must resolve without auth.

It currently points at the raw URL on the default branch:
`https://raw.githubusercontent.com/solvdagency/evening-studio-checkin/main/assets/avatar-asterisk.png`

**This only works if the repo is PUBLIC.** GitHub raw URLs on a private repo are not anonymously fetchable, so a private repo will render a broken avatar in the posted card. If the repo must stay private, host the PNG on a public bucket (or a public assets repo) and update `AVATAR_PNG_URL` to that URL. Verify the chosen URL loads in an incognito browser before relying on it.

## Run a manual test

From the GitHub `Actions` tab → **Evening Studio Check-in** → `Run workflow` (the `workflow_dispatch` trigger). A manual dispatch fires any time on a weekday, so you don't have to wait for 4:30pm. Confirm a card posts to the test space.

## Failure alerting

There is no extra alerting infrastructure (D-25) — reliability rides on two distinct paths:

- **A data-source failure** (Productive unreachable) is **not** a silent skip: the run still posts a degraded "Couldn't reach Productive tonight." card (REL-01).
- **A post failure** (dead webhook, bad URL) makes the run **exit non-zero**, which triggers **GitHub's built-in failed-run email** to the repo owners (REL-02) — that is the alert channel.

### Caveat: scheduled workflows disable after inactivity

GitHub disables scheduled workflows after **60 days of repo inactivity**, and scheduled runs can be **delayed under load** (so don't assume exactly 16:30 — the guard checks the weekday, not the minute). If the studio goes quiet for two months, re-enable the workflow from the Actions tab.

## Local development

```bash
npm ci
npm test          # node --test over src/**/*.test.ts (trust-critical math is unit-tested)
npx tsc --noEmit  # type-check
node --import tsx src/index.ts   # run the pipeline (needs a local .env)
```
