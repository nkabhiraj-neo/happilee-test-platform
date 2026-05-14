
import * as fs from 'fs';
import * as path from 'path';

async function createTickets() {
  const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://neoito-team-abhiraj.atlassian.net";
  const JIRA_EMAIL = process.env.JIRA_EMAIL;
  const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
  const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "BUG";
  const JIRA_ASSIGNEE_ACCOUNT_ID = process.env.JIRA_ASSIGNEE_ACCOUNT_ID;

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO || "nkabhiraj-neo/happilee-test-platform";
  const GITHUB_ASSIGNEE = process.env.GITHUB_ASSIGNEE_USERNAME || "nkabhiraj-neo";

  const title = "[_hap_fe_project] All scenarios failing — Login timeout during OTP phase (7 scenarios affected)";
  const bodyText = `Root cause: TEST_ISSUE — timeout during login/OTP step
Affected: MLR-901, MLR-902, MLR-903, MLR-904, MLR-906, MLR-907, MLR-908
All 7 scenarios fail at the same point: login timeout during OTP entry phase.

AI Analysis: Login timeout blocked all downstream scenarios. This is a systemic issue — fix login flow first, all other scenarios will likely pass after.

Dashboard: https://nkabhiraj-neo.github.io/happilee-test-platform/

Screenshots and videos available in dashboard.`;

  // 1. Create Jira Ticket
  console.log("Creating Jira ticket...");
  const jiraAuth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  const jiraBody = {
    fields: {
      project: { key: JIRA_PROJECT_KEY },
      summary: title,
      description: {
        type: "doc",
        version: 1,
        content: bodyText.split('\n').map(line => ({
          type: "paragraph",
          content: [{ type: "text", text: line }]
        }))
      },
      issuetype: { name: "Bug" },
      assignee: { accountId: JIRA_ASSIGNEE_ACCOUNT_ID },
      labels: ["e2e-automation"]
    }
  };

  const jiraRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${jiraAuth}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(jiraBody)
  });

  const jiraData = await jiraRes.json();
  if (jiraRes.ok) {
    console.log(`Jira Created: ${JIRA_BASE_URL}/browse/${jiraData.key}`);
  } else {
    console.error("Jira Error:", JSON.stringify(jiraData, null, 2));
  }

  // 2. Create GitHub Ticket
  console.log("\nCreating GitHub ticket...");
  const githubRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: title,
      body: bodyText,
      assignees: [GITHUB_ASSIGNEE],
      labels: ["bug", "e2e-automation"]
    })
  });

  const githubData = await githubRes.json();
  if (githubRes.ok) {
    console.log(`GitHub Created: ${githubData.html_url}`);
  } else {
    console.error("GitHub Error:", JSON.stringify(githubData, null, 2));
  }
}

createTickets().catch(console.error);
