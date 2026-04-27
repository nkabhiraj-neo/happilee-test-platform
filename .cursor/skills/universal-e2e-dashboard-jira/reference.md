# Reference: Reusable Detection Heuristics

## Typical files to inspect
- `package.json` scripts for test/report/jira commands
- test hooks/support files where failures are captured
- report rendering files (`dashboard.html`, `index.html`, React report pages)
- generated artifacts (`reports/`, `failures/`, screenshots, videos)

## Suggested normalized failure JSON shape
```json
{
  "scenarioName": "string",
  "failedAt": "ISO timestamp",
  "error": {
    "message": "short message",
    "fullMessage": "full cleaned message"
  },
  "failureExplanation": {
    "whatHappened": "string",
    "whyItHappened": "string",
    "whereItFailed": "file:line:col"
  },
  "developerSuggestions": ["step 1", "step 2"],
  "screenshotRelative": "optional path",
  "videoRelative": "optional path"
}
```

## UI rendering recommendations
- Keep short error line visible in collapsed view.
- Add a "View full error details" expandable panel.
- Escape HTML and sanitize text before render.
- Show failure explanation in 3 rows: what/why/where.
- Show numbered developer suggestions.

## Jira questions to ask user before setup
1. Do you want Jira integration now?
2. Which mode?
   - Create issues from failures
   - Reverse sync analysis back to Jira
   - Both
3. Which env keys are used in this project?
4. Should we support dry-run mode?
