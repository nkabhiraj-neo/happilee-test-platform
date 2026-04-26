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

Videos are matched to scenarios by mtime in post-run-sync.mjs and displayed in the dashboard at qadash.netlify.app.

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
- Dashboard is always at localhost:4000/dashboard — served from e2e/reports/dashboard.html generated by run-e2e-with-report.mjs ONLY. Never generate a different dashboard.

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

### 🔲 Feature 4: AI Failure Analysis
- When a scenario fails, an "🤖 Analyze" button should appear in the dashboard
- Clicking it calls `netlify/functions/analyze-failure.js`
- That function sends the failed step, error message, and screenshot to Claude (Anthropic)
- Claude returns a plain-English explanation of what went wrong and suggested fixes
- Response is shown inline in the dashboard under the failed step
- Trigger: only on failure (not on pass)

### 🔲 Feature 5: Ticket Automation
- After AI analysis, offer "Create Jira ticket" and "Create GitHub issue" buttons
- Use `e2e/scripts/post-e2e-failures.mjs` as the backend
- Only ask once per failure — do not auto-create
- Include: failed step, error, screenshot link, AI analysis summary

### 🔲 Feature 6: Smart Selective Testing (CATALOG.md)
- Read CATALOG.md to understand which scenarios are stable vs intermittent
- Skip stable scenarios that have not changed since last run
- Only re-run scenarios tagged INTERMITTENT or NEW
- This reduces run time significantly in CI

