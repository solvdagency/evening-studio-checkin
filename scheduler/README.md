# Scheduling & reliability runbook (SCHED-04)

How the nightly check-in gets triggered on time, and how we make sure a night is
never silently missed. **No code to maintain — two free web services + one line in
the GitHub workflow.**

## Why this exists

GitHub Actions' built-in `schedule:` cron is "best effort" — it fired this job
**4–5 hours late on every run** (8:27pm, 8:34pm, 9:27pm vs the 4:30pm target).
GitHub's own docs say scheduled jobs can be delayed or dropped. So we don't use it.

Instead:

| Job | Service | What it does |
|-----|---------|--------------|
| **Trigger** | [cron-job.org](https://cron-job.org) | Presses "go" at 4:30pm Sydney by calling GitHub's API. API-triggered runs start in seconds (they skip the slow queue). |
| **Watchdog** | [healthchecks.io](https://healthchecks.io) | A dead-man's switch. The workflow pings it *only after a successful post*. If a ping doesn't arrive, it emails you. This is the "never silently skip" guarantee. |

Both are **free** and need **only an email** (no credit card). The watchdog lives on
different infrastructure from the trigger on purpose — so one outage can't take out
both the run and the alarm.

---

## Part A — Watchdog (healthchecks.io)

1. Sign up at <https://healthchecks.io> (free, email only).
2. **Add Check** → name it `evening-checkin`.
3. Set the schedule so it expects a ping every weekday after 4:30pm:
   - Schedule type: **Cron**
   - Expression: `30 16 * * 1-5`
   - Timezone: **Australia/Sydney**
   - **Grace Time:** `30 min` (covers the run finishing + small trigger jitter).
4. **Integrations** → add **Email** (and/or a Google Chat webhook) so alerts reach
   you. ⚠️ Test this channel actually works — an unverified alert channel is a
   silent watchdog.
5. Copy the check's **Ping URL** (looks like `https://hc-ping.com/<uuid>`).
6. In GitHub → repo **Settings → Secrets and variables → Actions → New repository
   secret**: name `HEALTHCHECK_PING_URL`, value = that ping URL.

> The workflow already has the ping step (added in `nightly.yml`). Until the secret
> exists it just logs "skipping" and does nothing — so nothing breaks before you set
> this up.

---

## Part B — GitHub token (for the trigger to be allowed to press "go")

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained
   tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `solvdagency/evening-studio-checkin`.
3. **Permissions → Repository permissions → Actions: Read and write.**
4. **Expiration:** set the maximum. ⚠️ Put a calendar reminder ~3 weeks before it
   expires — a fine-grained token gives no built-in expiry warning. (If it lapses,
   the trigger stops *and* the watchdog will email you about the missed night, so
   it fails loudly, not silently.)
5. Generate and **copy the token** (`github_pat_…`) for Part C.

---

## Part C — Trigger (cron-job.org)

1. Sign up at <https://cron-job.org> (free, email only).
2. **Create cronjob.**
3. **Title:** `Evening check-in trigger`.
4. **URL:**
   ```
   https://api.github.com/repos/solvdagency/evening-studio-checkin/actions/workflows/nightly.yml/dispatches
   ```
5. **Schedule:**
   - Time: **16:30**
   - Days: **Mon–Fri**
   - **Timezone: Australia/Sydney** (this handles daylight saving automatically —
     nothing to change twice a year).
6. **Advanced / request settings:**
   - **Request method:** `POST`
   - **Headers:**
     ```
     Authorization: Bearer <paste your token from Part B>
     Accept: application/vnd.github+json
     X-GitHub-Api-Version: 2022-11-28
     ```
   - **Request body:**
     ```json
     {"ref":"main"}
     ```
7. Save.

---

## Part D — Prove it works (do this once, in the TEST Chat space)

1. In cron-job.org, open the job and click **Test run** (or **Run now**).
2. Within a few seconds, a run should appear in the GitHub **Actions** tab, and the
   check-in should post to the **test** Chat space.
3. Confirm healthchecks.io flips to **up** (it received the success ping).
4. **Test the safety net:** temporarily put a wrong character in the token in
   cron-job.org so the trigger fails. Within the grace window (30 min) healthchecks.io
   should email you "evening-checkin is down." Then fix the token. ✅

---

## Going live

Once the test run works, point cron-job.org at the real schedule (it already is:
4:30pm Sydney, Mon–Fri) and make sure the workflow posts to the **real** Chat space
(that's controlled by the `GCHAT_WEBHOOK_URL` GitHub secret, separate from this).

---

## The only recurring chores

- **Renew the GitHub token before it expires** (calendar reminder): generate a new
  one (Part B), update the `Authorization` header in cron-job.org. That's it.
- Nothing else to maintain — no servers, no code, no daily token refresh.

---

## If you ever outgrow this (future note, not needed now)

The clean "one platform" upgrade is **Google Cloud Run Jobs + Cloud Scheduler**
(reuses the Google service account you already have; no third-party token; real
scheduler SLA). It requires a company credit card on a Google Cloud billing account
and a day of setup, so it's only worth it if the org wants everything Google-native.
Until then, this two-service setup is simpler and costs nothing.
