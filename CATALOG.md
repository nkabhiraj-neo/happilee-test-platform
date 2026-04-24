# Happilee E2E Platform Catalog (Updated End-to-End)

## 1) What this platform does

`happilee-test-platform` is a full E2E execution + failure triage system.

It runs Cucumber/Playwright tests, captures rich failure evidence, generates a static dashboard, adds AI analysis, and can create Jira/GitHub tickets from failures.

---

## 2) Why this exists

The goal is to convert a failing test into an actionable engineering item quickly:
- exact failed step
- real UI error shown to user
- screenshots + run video
- root-cause suggestions
- ticket-ready context for Jira/GitHub

---

## 3) Repos and workspace layout

- Automation workspace: `c:\happilee-test-platform`
- App under test clone: `c:\happilee-test-platform\codebase\happilee_ops_frontend`

Why this split:
- keep automation scripts stable
- still inspect/edit app source for selectors and root causes
- faster triage from failed step to source file

---

## 4) Current core stack

- Test runner: Cucumber + Playwright
- Test code: TypeScript (`e2e/features`, `e2e/steps`, `e2e/support`)
- Orchestration: `e2e/scripts/run-e2e-with-report.mjs`
- Failure processing + ticketing: `e2e/scripts/post-e2e-failures.mjs`
- AI analysis: `e2e/scripts/ai-analyze-failure.mjs` + `@anthropic-ai/sdk`
- Dashboard output: `e2e/reports/dashboard.html` served on `localhost:4000`

---

## 5) End-to-end runtime flow (latest)

1. **Pre-run cleanup** in `run-e2e-with-report.mjs`:
   - clears `e2e/reports/screenshots/steps/`
   - clears `e2e/reports/videos/`
   - clears `e2e/reports/failures/last-run/`

2. **Test execution**:
   - `npm run test:e2e:qa`
   - `E2E_RECORD_FULL_RUN=1` records one full-run video
   - `failFast: true` in `e2e/cucumber.config.cjs` stops remaining steps after first failure in scenario flow

3. **Failure capture**:
   - scenario failure screenshot + JSON + NDJSON entry in `e2e/reports/failures/last-run/`
   - login flow now throws clear error if still on `/login`
   - login flow captures visible UI error before throw (for real diagnostic message)

4. **AI analysis**:
   - `.env` key loaded (`ANTHROPIC_API_KEY`)
   - model: `claude-sonnet-4-5`
   - prompt includes scenario, failed step, terminal error, visible UI error, existing suggestions
   - logs:
     - `Calling Claude API...`
     - `Claude response received`
     - exact error details on API failure

5. **Post processing**:
   - writes `E2E-FAILURE-REPORT.md`
   - writes `failures/last-run/summary.json`
   - writes static `dashboard.html`

---

## 6) Dashboard behavior (latest fixes)

Dashboard is fully static and served from `e2e/reports`.

### Step rendering rules
- **Passed step**: shows step screenshot from current run only
- **Skipped/Pending step**: yellow dot + `skipped` label, no screenshot
- **Failed step**:
  - shows failure screenshot (not stale step image)
  - red highlight styling
  - clickable image
  - label: `📸 Failure screenshot`

### Failure screenshot path fix
Failure path stored as:
- `e2e/reports/failures/last-run/...png`

Dashboard now strips `e2e/reports/` so browser path resolves as:
- `failures/last-run/...png`

This fixed the “failure screenshot not displaying” issue.

---

## 7) Hooks and capture rules (latest)

In `e2e/support/hooks.ts`:
- step-level screenshots are captured **only for passed steps**
- failed-step screenshot is handled by failure capture artifact (single source of truth)
- avoids stale screenshot confusion on dashboard

---

## 8) Jira/GitHub ticket automation

### Jira
- supports creation from failures via `E2E_JIRA_CREATE=1`
- supports default assignee through:
  - `JIRA_ASSIGNEE_ACCOUNT_ID`
- supports limit:
  - `E2E_JIRA_MAX` (default behavior aligned to 1)

### GitHub
- supports creation from failures via `E2E_GITHUB_CREATE=1`
- supports default assignee through:
  - `GITHUB_ASSIGNEE_USERNAME`
- supports limit:
  - `E2E_GITHUB_MAX` (default behavior aligned to 1)

Both ticket bodies include failure context, and full run video path where available.

---

## 9) Important environment variables in use

- Test/auth: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`
- Video: `E2E_RECORD_FULL_RUN`, `E2E_RECORD_VIDEO`
- AI: `ANTHROPIC_API_KEY`
- Jira: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `E2E_JIRA_CREATE`, `E2E_JIRA_MAX`, `JIRA_ASSIGNEE_ACCOUNT_ID`
- GitHub: `GITHUB_TOKEN`, `GITHUB_REPO`, `E2E_GITHUB_CREATE`, `E2E_GITHUB_MAX`, `GITHUB_ASSIGNEE_USERNAME`

---

## 10) Commands currently used most

- Run QA flow and regenerate all artifacts:
  - `npm run test:e2e:qa`
- Start dashboard:
  - `npm run qa:dashboard`
- Open dashboard:
  - `http://localhost:4000/dashboard`

---

## 11) Current known failure signal (latest runs)

Recent BUG-10 run fails at login with explicit UI validation message:
- `Login failed — UI showed: "Must be 8+ chars with a letter, number, and symbol". Check E2E_TEST_PASSWORD in .env`

This confirms the improved error-capture logic is working and fail-fast behavior prevents downstream step execution.

---

## 12) AGENT workflow alignment

`AGENT.md` was updated to enforce:
- cleanup before each run
- read `knowledge/flows/login.md` first
- test-first + artifact-first reporting
- ask before ticket creation (when instructed)
- always show dashboard after run
- codebase reading order for new feature selector discovery

---

## 13) Practical end-to-end summary

Clone/setup -> run QA script -> auto-clean old artifacts -> execute tests with fail-fast -> capture real failure evidence -> run Claude analysis -> generate static dashboard/report -> optionally create Jira/GitHub tickets -> review at `localhost:4000/dashboard`.
