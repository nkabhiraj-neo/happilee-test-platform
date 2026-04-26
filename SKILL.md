---
name: universal-e2e-dashboard-jira
description: Set up and improve E2E failure dashboards with readable error explanations, root-cause guidance, and actionable developer suggestions across any project. Use when users ask for test dashboards, failure reports, AI suggestions from test failures, Playwright/Cucumber/Jest report UX improvements, or Jira-linked test triage. Always analyze current project first and propose a plan before changes. Ask before enabling Jira or requesting Jira credentials.
---

# Universal E2E Dashboard + Jira Assistant

## Purpose
Use this skill to make test failure output understandable and actionable in any codebase.

Primary goals:
- Clean unreadable failure text (including ANSI escape sequences).
- Explain each failure as:
  - what happened
  - why it happened
  - where it failed
- Generate specific developer suggestions tied to failure type and likely fix location.
- Optionally connect Jira workflows, but only after explicit user confirmation.

## Required behavior
When this skill is invoked:

1. **Analyze first, do not edit immediately**
   - Detect current testing stack and report artifacts.
   - Identify candidate files for:
     - failure capture
     - report/dashboard rendering
     - post-processing scripts
   - Propose exact changes before implementation.

2. **Ask before Jira**
   - Never assume Jira is available.
   - Ask whether user wants Jira integration.
   - If yes, ask for required env/config names and preferred behavior:
     - create issues from failures
     - reverse sync local analysis back to Jira comments
     - both

3. **Make suggestions specific**
   - Suggestions must reference likely file/function areas.
   - Avoid generic advice when failure pattern is recognized.
   - Prefer numbered actionable steps.

## Project analysis checklist
Run this checklist before proposing changes:

- Test framework: Cucumber / Playwright / Jest / Vitest / Cypress / other
- Failure source files and artifacts:
  - json, ndjson, junit, html, markdown, screenshots, video
- Dashboard/report UI location:
  - static html, React page, CLI markdown, or no dashboard yet
- Current error readability issues:
  - ANSI escape codes
  - only first-line error shown
  - missing stack and step location
- Existing Jira scripts and env usage:
  - package scripts
  - sync scripts
  - `.env` keys

## Output contract for each failed test/scenario
Ensure structured failure output includes:

- `whatHappened`: short plain-English summary
- `whyItHappened`: root-cause statement from observed error pattern
- `whereItFailed`: best location from stack trace (file:line:col when possible)
- `developerSuggestions`: ordered list of concrete actions
- raw error fields:
  - short message
  - full message (cleaned)

Also ensure UI/report displays:
- short error line
- expandable full details
- links to screenshot/video if available

## Failure pattern mapping (default)
Use these defaults unless project already defines better rules:

- **Connection refused / URL unreachable**
  - Explain environment not reachable before app assertion runs.
  - Suggest starting app, validating base URL, and waiting for server readiness.

- **Strict locator collision**
  - Explain ambiguous selector.
  - Suggest exact matching, scoped selectors, or test IDs.

- **Visibility timeout / element not found**
  - Explain expected element never appeared.
  - Suggest checking expectation text, role context, and async readiness points.

- **Filter/query clear mismatch**
  - Explain clear action did not remove param or did not refetch.
  - Suggest query serialization fix + invalidation/refetch path.

- **Dropdown did not close**
  - Explain close behavior not triggered.
  - Suggest close-on-select/outside-click and event handler cleanup.

## Jira workflow guardrails
If user enables Jira integration:

- Ask for required env keys and confirm they are present.
- Support two explicit modes:
  - Jira -> local ticket sync
  - local analysis -> Jira reverse sync
- Do not post to Jira silently.
- Provide dry-run option when possible.
- On failure, include actionable auth/permission diagnostics.

## Proposal format (before any edits)
Use this exact structure:

```markdown
## Detected Stack
- Tests: ...
- Reports: ...
- Dashboard: ...

## Gaps Found
- ...

## Proposed Changes
1. File `...`: ...
2. File `...`: ...

## Jira (Optional)
- Current status: detected/not detected
- If enabled, I will add: ...
```

## Implementation quality checks
After edits:
- Run lints for touched files.
- Verify no ANSI codes remain in rendered errors.
- Verify dashboard/report shows full details and structured explanation.
- Verify developer suggestions are numbered and specific.
- If Jira enabled, verify script entrypoints and safe prompts exist.

## Notes
- Keep implementation framework-agnostic and reuse existing project conventions.
- Prefer extending current report pipeline over replacing it.

## Video artifact system (as of April 26, 2026)

Video files per scenario produced by the _hap_fe_auth test suite:

- **App video**: `<timestamp>-MLR-<tag>-<status>.webm`
  - Recorded by Playwright on the main browser tab
  - Shows the full app flow: login page → OTP page → result
  - Always present for every scenario

- **Yopmail tab video**: `<timestamp>-MLR-<tag>-yopmail.webm`
  - Only exists for scenarios that open a new browser tab (currently MLR-203 only)
  - Recorded by Playwright on the secondary tab that navigates to yopmail.com
  - Shows: Yopmail inbox loading → OTP email appearing → 6-digit code visible
  - When CAPTCHA appears, this video shows the CAPTCHA blocking the OTP fetch

### Dashboard display
- 🎬 App Recording — always shown, for every scenario
- 📧 Yopmail Recording — shown only for MLR-203 (or any future scenario that opens a new tab)

### How matching works (post-run-sync.mjs)
Playwright records one `.webm` per page. Named videos (e.g. `1777...-MLR-203-passed.webm`) are produced when the main page context closes. Hash-named videos (e.g. `page@abc123.webm`) are produced for secondary tabs.

The sync script finds the first named video whose mtime comes immediately AFTER the hash video's mtime — that is the scenario that opened the tab — and assigns the hash video to it as the Yopmail recording.
