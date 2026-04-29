# Happilee E2E Platform Catalog (Updated End-to-End)

## 1) What this platform does

`happilee-test-platform` is a full E2E execution + failure triage system.

It runs Cucumber/Playwright tests, captures rich failure evidence, generates a static dashboard, adds AI analysis, and can create Jira/GitHub tickets from failures.

This platform is designed to support ANY project/module over time (not tied to one feature area).

---

## 2) Why this exists

The goal is to convert a failing test into an actionable engineering item quickly:
- exact failed step
- real UI error shown to user
- screenshots + run video
- failed API evidence (status, URL, response, cURL)
- root-cause suggestions
- ticket-ready context for Jira/GitHub

---

## 3) Repos and workspace layout

- Automation workspace: `c:\happilee-test-platform`
- Active app/test modules: `c:\happilee-test-platform\codebase\_hap_fe_*`

Why this split:
- keep automation scripts stable
- still inspect/edit app source for selectors and root causes
- faster triage from failed step to source file

---

## 4) Current core stack

- Test runner: Cucumber + Playwright
- Test code: TypeScript in module-local paths (`codebase/_hap_fe_*/tests/bdd/**`)
- Orchestration: module cucumber commands + `e2e/scripts/post-run-sync.mjs`
- Failure processing + ticketing: `e2e/scripts/post-e2e-failures.mjs`
- AI analysis: `e2e/scripts/ai-analyze-failure.mjs` + `@anthropic-ai/sdk`
- Dashboard output: `docs/index.html` + `docs/reports/**` (GitHub Pages)

---

## 5) End-to-end runtime flow (latest)

1. **Pre-run cleanup**:
   - clears `e2e/reports/screenshots/steps/`
   - clears `e2e/reports/videos/`
   - clears `e2e/reports/failures/last-run/`

2. **Test execution**:
   - run module-specific cucumber command (`codebase/_hap_fe_*/tests/bdd/...`)
   - include cross-module `--require` paths when scenarios depend on shared/auth steps
   - record scenario videos/screenshots from hooks

3. **Failure capture**:
   - scenario failure screenshot + JSON + NDJSON entry in `e2e/reports/failures/last-run/`
   - network failures captured from hooks (`4xx`, `5xx`, `requestfailed`)
   - cURL and response body captured for failed API calls

4. **AI analysis**:
   - `.env` key loaded (`ANTHROPIC_API_KEY`)
   - model: `claude-sonnet-4-5`
   - prompt includes scenario, failed step, terminal error, screenshot and network/API failure context
   - logs:
     - `Calling Claude API...`
     - `Claude response received`
     - exact error details on API failure

5. **Post processing**:
   - writes `E2E-FAILURE-REPORT.md`
   - writes `failures/last-run/summary.json`
   - writes static `dashboard.html`

6. **Failure triage standard** (when any scenario fails):
   - identify exact failed step and file location
   - report expected result vs actual result
   - confirm screenshot + video evidence
   - extract exact API failure from network capture
   - include AI root cause + concrete fix direction

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

### Failure diagnostics paneling
- Dashboard shows AI panel and network panel for failed scenarios.
- Network panel includes failed requests with method/status/url, response body preview, and cURL copy action.
- AI panel should highlight exact API failure when available (e.g. request field mismatch).

---

## 7) Hooks and capture rules (latest)

In module hooks (`codebase/_hap_fe_*/tests/bdd/support/hooks.ts`):
- step-level screenshots are captured **only for passed steps**
- failed-step screenshot is handled by failure capture artifact (single source of truth)
- avoids stale screenshot confusion on dashboard
- failed network/API requests are captured and attached as JSON embeddings for post-run AI and dashboard rendering

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

- Run module test:
  - `_hap_fe_project` / `_hap_fe_auth` cucumber commands from `AGENT.md`
- Sync dashboard artifacts:
  - `node e2e/scripts/post-run-sync.mjs`
- Open dashboard:
  - `https://nkabhiraj-neo.github.io/happilee-test-platform/`

---

## 11) Current test suite status — _hap_fe_auth (April 26, 2026)

| MLR Tag | Scenario | Status | Last Run | Notes |
|---------|----------|--------|----------|-----------|
| MLR-201 | Login valid email → OTP page | ✅ PASSING | Apr 26, 2026 | Stable |
| MLR-202 | Login invalid email → error | ✅ PASSING | Apr 26, 2026 | Stable |
| MLR-203 | OTP via Yopmail → project page | ⚠️ INTERMITTENT | Apr 26, 2026 — PASSED | Passes when no CAPTCHA appears on Yopmail. Fails when CAPTCHA blocks OTP fetch. App Recording + Yopmail Recording both captured ✅. When it fails, Yopmail Recording shows the CAPTCHA blocking the OTP fetch. When it passes, it shows the full OTP email and code. |
| MLR-204 | Wrong OTP → error | ✅ PASSING | Apr 26, 2026 | Stable |
| MLR-209 | Multiple email attempts | ✅ PASSING | Apr 26, 2026 | Stable |

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

Read existing module tests first -> run targeted suite from current `codebase/_hap_fe_*` -> auto-clean old artifacts -> capture step/screenshot/video/network evidence -> run Claude analysis with network context -> sync to dashboard -> optionally create Jira/GitHub tickets -> review at `https://nkabhiraj-neo.github.io/happilee-test-platform/`.

---

## 14) AI Analysis System (as of April 26, 2026)

Auto-triggers in `post-run-sync.mjs` when any scenario fails.
Uses Claude (`claude-sonnet-4-20250514`) via Anthropic API.

### How it works
1. `post-run-sync.mjs` reads `docs/reports/_hap_fe_*.json` after sync
2. For each failed scenario: sends scenario name, MLR tag, failed step, error message, screenshot (base64) to Claude
3. Claude returns structured JSON: `type`, `confidence`, `severity`, `headline`, `what_happened`, `root_cause`, `where_to_look`, `how_to_fix`, `code_hint`, `prevention`, `ticket_worthy`, `ticket_title`, `ticket_body`
4. Analysis injected into `_hap_fe_auth.json` as `scenario.aiAnalysis`
5. Terminal prints full analysis
6. Asks: "Create Jira + GitHub tickets? (yes/no)"
7. Dashboard reads `el.aiAnalysis` and renders the AI panel automatically

AI prompt quality requirement:
- Include failed network context (top critical API failures with response snippet and cURL) so analysis can output exact root cause and actionable fix.

### Known analysis results
- MLR-203 CAPTCHA failure → **ENVIRONMENT_ISSUE** (HIGH confidence)
  - Not a real app bug
  - Root cause: Yopmail bot-detection CAPTCHA blocks automated OTP fetch
  - Fix: Replace Yopmail with Mailosaur API for deterministic OTP delivery in CI
  - ticket_worthy: false (environment issue, not a bug)

### Files
- `netlify/functions/analyze-failure.js` — Netlify function for dashboard Re-analyze button
- `e2e/scripts/post-run-sync.mjs` — auto-analysis after every sync run

### Setup required
- Local `.env` must have `ANTHROPIC_API_KEY` for terminal auto-analysis
- Netlify env vars must have `ANTHROPIC_API_KEY` for dashboard Re-analyze button
