exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    const {
      scenarioName,
      mlrTag,
      failedStep,
      errorMessage,
      screenshot,
      videoAvailable,
      knownBlockers
    } = JSON.parse(event.body)

    const systemPrompt = `You are a senior QA engineer and developer.
Analyze test failures and provide detailed, actionable reports.
A developer reading your report should immediately understand:
- Exactly what failed and where
- Why it failed (root cause)
- Whether it is a real bug, environment issue, or test issue
- Exactly what to check in the code
- How to fix it with specific guidance

Always respond with valid JSON only. No markdown. No explanation outside JSON.`

    const userContent = []

    // Add screenshot if available
    if (screenshot) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: screenshot
        }
      })
    }

    const knownBlockerContext = knownBlockers?.length
      ? `\n\nKNOWN ENVIRONMENT BLOCKERS:\n${knownBlockers.join('\n')}`
      : ''

    userContent.push({
      type: 'text',
      text: `FAILED TEST DETAILS:
Scenario: ${scenarioName}
Tag: ${mlrTag}
Failed Step: "${failedStep}"
Full Error Message:
${errorMessage}

Video recorded: ${videoAvailable ? 'YES - full flow video available in dashboard' : 'NO'}
${knownBlockerContext}

${screenshot ? 'A screenshot of the failure state is attached above.' : ''}

Analyze this failure completely. Return ONLY this JSON structure:
{
  "type": "REAL_BUG" | "ENVIRONMENT_ISSUE" | "TEST_ISSUE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "headline": "One sentence: what failed",
  "what_happened": "Plain English explanation of what the test was doing when it failed. 2-3 sentences. Anyone reading this should understand the flow.",
  "root_cause": "Technical explanation of WHY it failed. Be specific about the error type, what caused it, and what component/system is involved.",
  "is_app_bug": true | false,
  "app_component": "Which part of the app is affected (e.g. OTP validation, email input, Yopmail integration) or null if not an app bug",
  "where_to_look": "Specific files, functions, or areas a developer should check. Be as specific as possible.",
  "how_to_fix": "Step by step fix instructions. If environment issue: what to change in the test setup. If real bug: what code to check and what the fix likely is.",
  "code_hint": "If applicable: specific function name, file path, or code pattern that is likely causing this",
  "prevention": "How to prevent this in future (better test data, environment setup, code guard)",
  "ticket_worthy": true | false,
  "ticket_title": "Suggested Jira/GitHub ticket title if ticket_worthy is true",
  "ticket_body": "Full ticket description with error, steps to reproduce, and expected vs actual behavior"
}`
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Claude API error: ${JSON.stringify(data)}`)
    }

    const text = data.content?.[0]?.text || '{}'

    const clean = text
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const analysis = JSON.parse(clean)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysis)
    }

  } catch (err) {
    console.error('Analysis error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
        type: 'UNKNOWN',
        headline: 'Analysis failed — check function logs'
      })
    }
  }
}
