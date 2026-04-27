# Test Monitoring Agent Instructions

## Your job
You are a test monitoring agent for the Happilee test platform.
Before doing ANYTHING, read this file completely.

## Step 1 — Clean before every run
Delete contents of:
- e2e/reports/failures/last-run/
- e2e/reports/videos/
- e2e/reports/screenshots/
- e2e/reports/analysis/

## Step 2 — Read the knowledge file
Read knowledge/flows/login.md before writing or running any auth test.
This tells you the exact selectors, URLs, and error messages.

## How to find selectors and flow for ANY feature

Before writing ANY test, always do this:

### 1. Check knowledge/ folder first
- Look in knowledge/flows/ for an existing flow file
- If it exists -> read it and use it directly, skip codebase reading
- If it does not exist -> read the codebase and CREATE it

### 2. If knowledge file does not exist, read codebase in this order:

For AUTH related tests:
- codebase/happilee_ops_frontend/src/pages/Login.tsx
- codebase/happilee_ops_frontend/src/api/auth.ts
- codebase/happilee_ops_frontend/src/context/AuthContext.tsx

For DASHBOARD related tests:
- codebase/happilee_ops_frontend/src/pages/Dashboard.tsx
- codebase/happilee_ops_frontend/src/pages/dashboards/AdminDashboard.tsx

For LEADS related tests:
- codebase/happilee_ops_frontend/src/pages/Leads.tsx
- codebase/happilee_ops_frontend/src/api/leads.ts
- codebase/happilee_ops_frontend/src/stores/useLeadFiltersStore.ts

For CLIENTS related tests:
- codebase/happilee_ops_frontend/src/pages/Clients.tsx
- codebase/happilee_ops_frontend/src/api/clients.ts

For INVOICES related tests:
- codebase/happilee_ops_frontend/src/pages/Invoices.tsx
- codebase/happilee_ops_frontend/src/api/invoices.ts

For ASSIGNMENTS related tests:
- codebase/happilee_ops_frontend/src/pages/Assignments.tsx

For ACCESS CONTROL related tests:
- codebase/happilee_ops_frontend/src/pages/AccessControl.tsx

For PERFORMANCE related tests:
- codebase/happilee_ops_frontend/src/pages/UserPerformance.tsx

For ANY feature - also always check:
- codebase/happilee_ops_frontend/src/components/ for UI components
- codebase/happilee_ops_frontend/src/api/ for API endpoints
- codebase/happilee_ops_frontend/src/stores/ for filter/state logic

### 3. After reading codebase, create knowledge file
Save to knowledge/flows/[feature-name].md with:
- Exact page URL
- All form field selectors (id, placeholder, label, role)
- All button selectors
- API endpoints called
- All possible error messages (exact strings)
- Success redirect URL
- Any role-based differences

### 4. Next time this feature is tested
- Only read knowledge/flows/[feature-name].md
- Do NOT re-read the codebase unless something unexpected happens
- If something unexpected happens -> update the knowledge file

## Rule
Never guess selectors. Always read from knowledge file or codebase first.

## Step 3 — Run the test
Run: npm run test:e2e:qa
This command runs the full _hap_fe_auth BDD suite (MLR-201 to MLR-209) and then runs post-run-sync.mjs to push results to the dashboard.
Watch the terminal output carefully.
Do not stop watching until the run completes.

## Current test status (as of April 26, 2026)

| Scenario | Tag     | Status       | Notes                                                                                         |
|----------|---------|--------------|-----------------------------------------------------------------------------------------------|
| Login valid email → OTP page | MLR-201 | ✅ PASSING | Stable |
| Login invalid email → error | MLR-202 | ✅ PASSING | Stable |
| OTP fetch via Yopmail → login | MLR-203 | ⚠️ INTERMITTENT | Sometimes fails due to Yopmail CAPTCHA (environment blocker). When it passes, full OTP flow is captured in the Yopmail Recording video. |
| Wrong OTP → error | MLR-204 | ✅ PASSING | Stable |
| Multiple email attempts | MLR-209 | ✅ PASSING | Stable |

## Video artifacts
Each scenario gets one App Recording video.
MLR-203 additionally gets a Yopmail Recording video showing the OTP fetch flow in the Yopmail tab.

- 🎬 App Recording — always present for every scenario
- 📧 Yopmail Recording — ONLY for MLR-203 (or any future scenario that opens a new browser tab)

Videos are matched to scenarios by mtime in post-run-sync.mjs and displayed in the dashboard at https://nkabhiraj-neo.github.io/happilee-test-platform/.

## Step 4 — Analyze terminal output
After test run, always run ai-analyze-failure.mjs before creating tickets.
After the run, check the terminal for:
- How many scenarios passed
- How many failed
- What was the exact error message
- Which step failed
- Which file and line number

## Step 5 — Decision making

### If ALL scenarios PASSED:
- Run: npm run test:e2e:report
- Run: npm run qa:dashboard
- Report in chat: "All tests passed. Dashboard updated. No tickets created."
- Stop here. Do NOT create any tickets.

### If ANY scenario FAILED:
- Take a screenshot of the failure state
- Read the failure details from e2e/reports/failures/last-run/failures.ndjson
- Ask in chat ONCE: "I found a failure in [scenario name]. Error: [exact error]. Should I create tickets in Jira and GitHub?"
- Wait for user response before creating tickets
- If user says yes → run: cross-env E2E_JIRA_CREATE=1 E2E_GITHUB_CREATE=1 node e2e/scripts/post-e2e-failures.mjs
- Run: npm run test:e2e:report
- Run: npm run qa:dashboard
- Report exactly what tickets were created with links

## Step 6 — Dashboard must always show
After every run (pass or fail):
- Step by step what happened
- Screenshots for each major step
- Video link if recorded
- Ticket links if created
- Dashboard is always at https://nkabhiraj-neo.github.io/happilee-test-platform/ — served from docs/index.html. Never generate a different dashboard.

## What to test: Auth flow
Feature: Login to dashboard
- Open https://staging-backoffice.happilee.io/
- Verify login page loads
- Enter email from E2E_TEST_EMAIL in .env
- Enter password from E2E_TEST_PASSWORD in .env  
- Click login button
- Verify redirect to dashboard /
- Verify dashboard heading is visible
- Verify "Hi, Sreekanth B" welcome message is visible
- Verify at least one KPI card is visible

## Credentials
Read from .env only. Never hardcode.

## Rules
- Never hardcode credentials
- Never create tickets without asking first (for now)
- Always update knowledge/flows/login.md with new observations
- Always clean reports before each run
- Always show dashboard after run
- Never modify files inside codebase/ without asking the user first and explaining why

## WHAT TO BUILD NEXT

### ✅ Feature 4: AI Failure Analysis — DONE
- `post-run-sync.mjs` auto-analyzes failures after every sync
- Prints full structured analysis in terminal (type, severity, headline, root cause, fix, prevention)
- Asks interactively: "Create tickets? (yes/no)" — yes runs post-e2e-failures.mjs
- AI panel auto-shown in dashboard on any failed scenario (reads from `el.aiAnalysis`)
- Re-analyze button in dashboard shows terminal instruction (node e2e/scripts/post-run-sync.mjs)
- AI analysis results are committed and pushed to GitHub Pages automatically

### ✅ Feature 5: Ticket Creation — PARTIALLY DONE
- Terminal asks yes/no after AI analysis prints
- `yes` → runs `post-e2e-failures.mjs` → creates Jira + GitHub tickets automatically
- Dashboard shows 🎫 Jira and 🐙 GitHub buttons (displays terminal command to run)
- 🔲 PENDING: Wire actual ticket links back into dashboard after creation

### 🔲 Feature 6: Smart Selective Testing — NOT YET BUILT
- Read CATALOG.md to understand which scenarios are stable vs intermittent
- Skip stable scenarios that have not changed since last run
- Only re-run scenarios tagged INTERMITTENT or NEW
- This reduces run time significantly in CI

---

## GitHub Pages Deployment

The dashboard is deployed to GitHub Pages from the `docs` folder of the `main` branch.

To update:
1. Run tests
2. Run `node e2e/scripts/post-run-sync.mjs` (this auto-pushes to GitHub)
3. Wait 1-2 minutes for GitHub Pages to deploy.

Dashboard URL: https://nkabhiraj-neo.github.io/happilee-test-platform/

---

## PERMANENT PLATFORM RULES — NEVER REPEAT THESE FIXES

### GitHub Pages
- Always add `docs/.nojekyll` file when using GitHub Pages.
- Files starting with `_` are ignored by Jekyll without `.nojekyll`.
- This must exist in every deployment: `docs/.nojekyll`.

### Video Recording
- Each scenario gets its own video (one BrowserContext per scenario).
- Yopmail opens as a new tab → creates a second `page@*.webm` file.
- The `page@*.webm` is the Yopmail tab recording.
- Match it to the scenario by mtime window between scenarios.
- CAPTCHA appears randomly — video captures whatever happened:
  → If passed: video shows Yopmail inbox + OTP email
  → If failed: video shows CAPTCHA blocking page
  Both are correct — do not try to fix this.

### Screenshots
- `AfterStep` hook captures every step's screenshot via `this.attach()`.
- `After` hook captures ALL pages in context (main + Yopmail tab).
- This must be in `hooks.ts` for EVERY new microfrontend added.
- Do not add screenshot logic anywhere else.

### AI Analysis
- Runs automatically in `post-run-sync.mjs` for ALL failed scenarios.
- Generic — scans all `docs/reports/*.json` files.
- Injects `aiAnalysis` into scenario JSON.
- Dashboard reads it automatically — no extra wiring needed.
- Model: `claude-sonnet-4-5` (required by this environment).

### New Microfrontend Checklist
When adding any new `_hap_fe_*` module, always do ALL of these:
  1. Check `hooks.ts` has `AfterStep` screenshot capture.
  2. Check `hooks.ts` has `After` hook multi-page screenshot capture.
  3. Check `hooks.ts` saves video with MLR tag rename (not delete).
  4. Check `playwrightContext.ts` has `recordVideo` configured.
  5. Add module to `BLOCKS` array in `docs/index.html`.
  6. Add module JSON path to `post-run-sync.mjs` scan list.
  7. Run `post-run-sync.mjs` once to generate initial reports.
  8. Verify `docs/.nojekyll` exists.
  9. Add scenarios to `CATALOG.md`.

### Post-Run Sync
- Always run: `node e2e/scripts/post-run-sync.mjs`.
- Never manually copy files.
- Script handles: screenshots, videos, AI analysis, run history.
- Auto-commits and pushes to GitHub → GitHub Pages auto-deploys.

### Ticket Creation
- ALWAYS ask in chat before creating tickets.
- Never auto-create tickets.
- One ticket per root cause, not one per scenario.
- Environment issues (Yopmail CAPTCHA) → no ticket needed.

### Data Freshness
- All `fetch()` calls use `?t=Date.now()` + `cache: 'no-store'`.
- Dashboard auto-refreshes every 60s when Live is ON.
- `post-run-sync.mjs` always pushes fresh data with `_meta` timestamp.
- Never rely on browser cache for report data.

### WHEN ASKED TO TEST SOMETHING
Full test flow (always in this order):
1. Clear artifacts (videos, screenshots, cucumber JSON)
2. Run tests fresh
3. Run `post-run-sync.mjs`
4. Report results in chat with AI analysis
5. Ask about tickets

