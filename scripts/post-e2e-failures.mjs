/**
 * After Cucumber: build a human-readable failure report and optionally create Jira bugs.
 * Usage: node e2e/scripts/post-e2e-failures.mjs
 * Env: E2E_JIRA_CREATE=1 to create Jira issues (uses .env JIRA_*), E2E_JIRA_MAX=1 (default 1)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const lastRun = path.join(root, "e2e", "reports", "failures", "last-run");
const ndjsonPath = path.join(lastRun, "failures.ndjson");
const videosDir = path.join(root, "e2e", "reports", "videos");
const outMd = path.join(root, "e2e", "reports", "E2E-FAILURE-REPORT.md");
const outSummaryJson = path.join(root, "e2e", "reports", "failures", "last-run", "summary.json");
const outAnalysisDir = path.join(root, "e2e", "reports", "analysis");
const docsReportsDir = path.join(root, "docs", "reports");
const cucumberSources = [
  path.join(root, "codebase", "_hap_fe_project", "artifacts", "cucumber", "cucumber.json"),
  path.join(root, "codebase", "_hap_fe_auth", "artifacts", "cucumber", "cucumber.json"),
];

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function readNdjson() {
  if (!fs.existsSync(ndjsonPath)) return [];
  const text = fs.readFileSync(ndjsonPath, "utf8").trim();
  if (!text) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function parseJsonSafely(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function collectCucumberScenarios() {
  const all = [];
  for (const src of cucumberSources) {
    if (!fs.existsSync(src)) continue;
    const json = parseJsonSafely(fs.readFileSync(src, "utf8"), []);
    for (const feature of Array.isArray(json) ? json : []) {
      for (const scenario of feature.elements || []) {
        all.push({
          featureUri: feature.uri || "",
          featureName: feature.name || "",
          scenario,
        });
      }
    }
  }
  return all;
}

function findScenarioEvidence(failure, allScenarios) {
  const targetUri = String(failure.uri || "").replace(/\\/g, "/");
  const targetName = String(failure.scenarioName || "").trim().toLowerCase();
  return (
    allScenarios.find((row) => {
      const scenarioName = String(row.scenario?.name || "").trim().toLowerCase();
      const uri = String(row.featureUri || "").replace(/\\/g, "/");
      return scenarioName === targetName && (targetUri ? uri.endsWith(targetUri) : true);
    }) || null
  );
}

function extractNetworkEvidence(scenario) {
  const embeddings = [
    ...(scenario.before || []),
    ...(scenario.after || []),
    ...(scenario.steps || []),
  ].flatMap((x) => x.embeddings || []);
  const networkEmb = embeddings.find((e) => e.mime_type === "application/json");
  if (!networkEmb?.data) return null;
  const decoded = parseJsonSafely(Buffer.from(networkEmb.data, "base64").toString("utf8"), null);
  if (!decoded?.failed_requests?.length) return null;
  const ranked = [...decoded.failed_requests].sort((a, b) => {
    const scoreA = a.status >= 500 ? 3 : a.status >= 400 ? 2 : 1;
    const scoreB = b.status >= 500 ? 3 : b.status >= 400 ? 2 : 1;
    return scoreB - scoreA;
  });
  const exact = ranked[0];
  let responseMessage = "";
  if (exact?.responseBody && exact.responseBody !== "Could not read response") {
    const parsed = parseJsonSafely(exact.responseBody, null);
    responseMessage = parsed?.message || parsed?.status || String(exact.responseBody);
  }
  return {
    exact,
    responseMessage: String(responseMessage || "").slice(0, 1000),
    topFailures: ranked.slice(0, 5),
  };
}

function enrichFailuresFromCucumber(failures) {
  const allScenarios = collectCucumberScenarios();
  return failures.map((f) => {
    const match = findScenarioEvidence(f, allScenarios);
    if (!match) return f;
    const scenario = match.scenario || {};
    const failedStep = (scenario.steps || []).find((s) => s.result?.status === "failed");
    const network = extractNetworkEvidence(scenario);
    const expectedResult = "After creating a project, Project List should be visible and the new project should appear in listing.";
    const actualResult = network?.exact
      ? `API ${network.exact.method} ${network.exact.status} ${network.exact.url} failed, then UI timed out waiting for Project List heading.`
      : "Project List heading did not appear within timeout.";
    const stepTimeline = (scenario.steps || [])
      .filter((s) => !s.hidden)
      .map((s, idx) => {
        const status = String(s.result?.status || "unknown").toLowerCase();
        const durationNs = Number(s.result?.duration || 0);
        const screenshotEmbedding = (s.embeddings || []).find((e) => String(e.mime_type || "").startsWith("image/"));
        return {
          index: idx + 1,
          keyword: s.keyword || "",
          text: s.name || "",
          status,
          durationNs,
          durationMs: durationNs ? Math.round(durationNs / 1e6) : 0,
          hasScreenshot: Boolean(screenshotEmbedding?.data),
        };
      });

    return {
      ...f,
      failedStepText: failedStep ? `${failedStep.keyword || ""}${failedStep.name || ""}`.trim() : f.failedStepText,
      exactApiFailure: network?.exact
        ? {
            method: network.exact.method,
            status: network.exact.status,
            url: network.exact.url,
            responseMessage: network.responseMessage,
            curlCommand: network.exact.curlCommand || "",
          }
        : null,
      expectedResult,
      actualResult,
      stepTimeline,
    };
  });
}

function sumAiTokenUsage(failures) {
  const base = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const failure of failures || []) {
    const usage = failure?.aiTokenUsage || failure?.aiAnalysis?.tokenUsage || {};
    base.inputTokens += Number(usage.inputTokens || usage.input_tokens || 0) || 0;
    base.outputTokens += Number(usage.outputTokens || usage.output_tokens || 0) || 0;
    base.totalTokens += Number(usage.totalTokens || usage.total_tokens || 0) || 0;
  }
  if (!base.totalTokens) base.totalTokens = base.inputTokens + base.outputTokens;
  return base;
}

function runAiFailureAnalysis() {
  const scriptPath = path.join(root, "e2e", "scripts", "ai-analyze-failure.mjs");
  if (!fs.existsSync(scriptPath)) return;
  const res = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (typeof res.status === "number" && res.status !== 0) {
    console.warn("[post-e2e] AI analysis script exited non-zero.");
  }
}

function newestVideo() {
  if (!fs.existsSync(videosDir)) return null;
  const files = fs
    .readdirSync(videosDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => {
      const p = path.join(videosDir, f);
      return { p, t: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.t - a.t);
  return files[0]?.p ? path.relative(root, files[0].p).replace(/\\/g, "/") : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toReportsRelative(value) {
  const raw = String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!raw) return null;
  return raw.startsWith("e2e/reports/") ? raw.slice("e2e/reports/".length) : raw;
}

function buildBugAnalysis(summary) {
  const failures = Array.isArray(summary.failures) ? summary.failures : [];
  const status = failures.length ? "failed" : "passed";
  const aiUsage = sumAiTokenUsage(failures);
  const scenarioRows = failures.map((f) => {
    const where = f.failureExplanation?.whereItFailed || "";
    const screenshot = toReportsRelative(f.screenshotRelative);
    return {
      name: f.scenarioName || "Unnamed scenario",
      status: "failed",
      failedStep: f.failureExplanation?.whatHappened || "Scenario failed",
      errorMessage: f.error?.message || "",
      file: where.split(":").slice(0, -2).join(":") || where || "n/a",
      rootCause: f.failureExplanation?.whyItHappened || "n/a",
      suggestedFix: (f.developerSuggestions || []).join(" "),
      aiWhatHappened: f.aiAnalysis?.whatHappened || "",
      aiRootCause: f.aiAnalysis?.rootCause || "",
      aiSuggestions: Array.isArray(f.aiAnalysis?.developerSuggestions) ? f.aiAnalysis.developerSuggestions : [],
      aiSeverity: f.aiAnalysis?.severity || "medium",
      tokenUsage: f.aiTokenUsage || f.aiAnalysis?.tokenUsage || null,
      stepTimeline: Array.isArray(f.stepTimeline) ? f.stepTimeline : [],
      notes: [
        `Where failed: ${where || "n/a"}`,
        `Exact error: ${f.error?.fullMessage || f.error?.message || "n/a"}`,
        screenshot ? `Screenshot: ${screenshot}` : "Screenshot: n/a",
      ],
    };
  });

  return {
    generatedAt: summary.generatedAt || new Date().toISOString(),
    status,
    ticketSummary: "BUG-10 E2E dashboard status",
    command: "npm run test:e2e:qa",
    cucumberReport: "report.html",
    video: toReportsRelative(summary.videoRelative),
    failuresCount: failures.length,
    aiTokenUsage: aiUsage,
    scenarios: scenarioRows,
    notes: failures.length
      ? [
          `Total failures: ${failures.length}`,
          "Open report.html for cucumber details.",
          summary.videoRelative ? `Full flow video: ${toReportsRelative(summary.videoRelative)}` : "Full flow video: unavailable",
        ]
      : ["No failures in the latest run."],
  };
}

function writeUnifiedDashboardAssets(summary) {
  const bugData = buildBugAnalysis(summary);
  fs.mkdirSync(outAnalysisDir, { recursive: true });
  fs.writeFileSync(path.join(outAnalysisDir, "BUG-10.json"), JSON.stringify(bugData, null, 2), "utf8");
}

function mirrorDashboardTelemetry(summary) {
  const usage = summary?.aiTokenUsage || sumAiTokenUsage(summary?.failures || []);
  fs.mkdirSync(path.join(docsReportsDir, "failures", "last-run"), { recursive: true });
  fs.writeFileSync(
    path.join(docsReportsDir, "ai-usage.json"),
    JSON.stringify(
      {
        generatedAt: summary.generatedAt || new Date().toISOString(),
        source: "post-e2e-failures",
        ...usage,
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(path.join(docsReportsDir, "failures", "last-run", "summary.json"), JSON.stringify(summary, null, 2), "utf8");
}

function adfParagraph(text) {
  return {
    type: "paragraph",
    content: [{ type: "text", text: text.slice(0, 32000) }],
  };
}

function buildDescriptionAdf(failure, videoAbsPath = "") {
  const usage = failure.aiTokenUsage || failure.aiAnalysis?.tokenUsage || {};
  const usageText = `AI token usage: input=${Number(usage.inputTokens || usage.input_tokens || 0) || 0}, output=${Number(usage.outputTokens || usage.output_tokens || 0) || 0}, total=${Number(usage.totalTokens || usage.total_tokens || 0) || 0}`;
  const timelineLines = (failure.stepTimeline || []).map((s) => `#${s.index} [${s.status}] ${s.keyword || ""}${s.text || ""} (${s.durationMs || 0}ms)${s.hasScreenshot ? " [shot]" : ""}`);
  const parts = [
    `Scenario: ${failure.scenarioName}`,
    `When: ${failure.failedAt}`,
    `Feature / URI: ${failure.uri || "n/a"}`,
    `Failed step: ${failure.failedStepText || "n/a"}`,
    `Expected result: ${failure.expectedResult || "n/a"}`,
    `Actual result: ${failure.actualResult || "n/a"}`,
    failure.exactApiFailure
      ? `Exact API Failure: ${failure.exactApiFailure.method} ${failure.exactApiFailure.status} ${failure.exactApiFailure.url}`
      : "",
    failure.exactApiFailure?.responseMessage
      ? `API response message: ${failure.exactApiFailure.responseMessage}`
      : "",
    "Error:",
    failure.error?.fullMessage || failure.error?.message || "",
    "Developer suggestions:",
    ...(failure.developerSuggestions || []).map((s) => `• ${s}`),
    "AI analysis - what happened:",
    failure.aiAnalysis?.whatHappened || "",
    "AI analysis - root cause:",
    failure.aiAnalysis?.rootCause || "",
    "AI analysis - developer suggestions:",
    ...((failure.aiAnalysis?.developerSuggestions || []).map((s) => `• ${s}`)),
    `AI severity: ${failure.aiAnalysis?.severity || "medium"}`,
    usageText,
    "Step timeline:",
    ...(timelineLines.length ? timelineLines : ["No step timeline available"]),
    "Tracked URLs:",
    JSON.stringify(failure.lastTrackedRequests || {}, null, 2),
    failure.exactApiFailure?.curlCommand
      ? `Repro cURL:\n${failure.exactApiFailure.curlCommand}`
      : "",
    videoAbsPath ? `Full flow video file: ${videoAbsPath}` : "",
  ].filter((p) => String(p).trim().length > 0);
  return {
    type: "doc",
    version: 1,
    content: parts.map((p) => adfParagraph(String(p))),
  };
}

async function jiraCreateIssue(failure, screenshotAbsPath, videoAbsPath) {
  loadEnv();
  const base = process.env.JIRA_BASE_URL || "https://neoito-team-abhiraj.atlassian.net";
  const email = process.env.JIRA_EMAIL || "";
  const token = process.env.JIRA_API_TOKEN || "";
  const projectKey = process.env.E2E_JIRA_PROJECT_KEY || "BUG";
  if (!email || !token) {
    console.warn("[post-e2e] Skipping Jira: missing JIRA_EMAIL or JIRA_API_TOKEN in .env");
    return null;
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const summary = `[E2E] ${(failure.scenarioName || "Failure").slice(0, 200)}`;

  const body = {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: "Bug" },
      description: buildDescriptionAdf(failure, videoAbsPath),
      labels: process.env.E2E_JIRA_LABELS ? process.env.E2E_JIRA_LABELS.split(",") : ["e2e-automation"],
      assignee: { accountId: process.env.JIRA_ASSIGNEE_ACCOUNT_ID },
    },
  };

  const res = await fetch(`${base}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) {
    console.error("[post-e2e] Jira create failed:", res.status, txt.slice(0, 800));
    return null;
  }
  const data = JSON.parse(txt);
  const key = data.key;
  const selfUrl = data.self ? data.self.replace(/rest\/api\/3\/issue\/.*/, `browse/${key}`) : `${base}/browse/${key}`;

  if (screenshotAbsPath && fs.existsSync(screenshotAbsPath)) {
    const buf = fs.readFileSync(screenshotAbsPath);
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "image/png" }), path.basename(screenshotAbsPath));
    const att = await fetch(`${base}/rest/api/3/issue/${key}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "X-Atlassian-Token": "no-check",
      },
      body: form,
    });
    if (!att.ok) {
      const atxt = await att.text();
      console.warn("[post-e2e] Jira attachment failed:", att.status, atxt.slice(0, 400));
    }
  }

  if (videoAbsPath && fs.existsSync(videoAbsPath)) {
    const videoBuf = fs.readFileSync(videoAbsPath);
    const videoForm = new FormData();
    videoForm.append("file", new Blob([videoBuf], { type: "video/webm" }), path.basename(videoAbsPath));
    const videoAtt = await fetch(`${base}/rest/api/3/issue/${key}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "X-Atlassian-Token": "no-check",
      },
      body: videoForm,
    });
    if (!videoAtt.ok) {
      const vtxt = await videoAtt.text();
      console.warn("[post-e2e] Jira video attachment failed:", videoAtt.status, vtxt.slice(0, 400));
    }
  }

  console.log(`[post-e2e] Jira created: ${key} → ${selfUrl}`);
  return key;
}

function normalizeGitHubRepo(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length >= 2) return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
      return "";
    } catch {
      return "";
    }
  }
  return raw.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
}

function githubHeaders(token, contentTypeJson = false) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (contentTypeJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function githubCreateIssue(failure, videoAbsPath) {
  loadEnv();
  const token = process.env.GITHUB_TOKEN || "";
  const repo = normalizeGitHubRepo(process.env.GITHUB_REPO || "hyremaster/happilee-test-platform");
  const assignee = String(process.env.GITHUB_ASSIGNEE_USERNAME || "").trim();
  if (!token) {
    console.warn("[post-e2e] Skipping GitHub: missing GITHUB_TOKEN in .env");
    return null;
  }
  if (!repo.includes("/")) {
    console.warn("[post-e2e] Skipping GitHub: invalid GITHUB_REPO in .env");
    return null;
  }

  const usage = failure.aiTokenUsage || failure.aiAnalysis?.tokenUsage || {};
  const timelineLines = (failure.stepTimeline || []).map((s) => `- #${s.index} [${s.status}] ${s.keyword || ""}${s.text || ""} (${s.durationMs || 0}ms)${s.hasScreenshot ? " [screenshot]" : ""}`);
  const apiHint = failure.exactApiFailure?.responseMessage
    ? ` - ${String(failure.exactApiFailure.responseMessage).slice(0, 80)}`
    : "";
  const title = `[E2E] ${(failure.scenarioName || "Failure").slice(0, 200)}${apiHint}`;
  const bodyLines = [
    `Scenario: ${failure.scenarioName || "Unnamed"}`,
    `When: ${failure.failedAt || "n/a"}`,
    `Feature / URI: ${failure.uri || "n/a"}`,
    `Failed step: ${failure.failedStepText || "n/a"}`,
    "",
    "Expected Result:",
    failure.expectedResult || "n/a",
    "",
    "Actual Result:",
    failure.actualResult || "n/a",
    ...(failure.exactApiFailure
      ? [
          "",
          "Exact API Failure Detected:",
          `${failure.exactApiFailure.method} ${failure.exactApiFailure.status} ${failure.exactApiFailure.url}`,
          failure.exactApiFailure.responseMessage
            ? `Response: ${failure.exactApiFailure.responseMessage}`
            : "Response: n/a",
        ]
      : []),
    "",
    "Error:",
    (failure.error?.fullMessage || failure.error?.message || "").slice(0, 8000),
    "",
    "Developer suggestions:",
    ...(failure.developerSuggestions || []).map((s) => `- ${s}`),
    "",
    "AI analysis:",
    `- whatHappened: ${failure.aiAnalysis?.whatHappened || "n/a"}`,
    `- rootCause: ${failure.aiAnalysis?.rootCause || "n/a"}`,
    `- severity: ${failure.aiAnalysis?.severity || "medium"}`,
    ...(Array.isArray(failure.aiAnalysis?.developerSuggestions)
      ? ["- AI developer suggestions:", ...failure.aiAnalysis.developerSuggestions.map((s) => `  - ${s}`)]
      : []),
    "",
    "AI token usage:",
    `- inputTokens: ${Number(usage.inputTokens || usage.input_tokens || 0) || 0}`,
    `- outputTokens: ${Number(usage.outputTokens || usage.output_tokens || 0) || 0}`,
    `- totalTokens: ${Number(usage.totalTokens || usage.total_tokens || 0) || 0}`,
    "",
    "Step timeline:",
    ...(timelineLines.length ? timelineLines : ["- n/a"]),
    "",
    "Tracked API URLs:",
    "```json",
    JSON.stringify(failure.lastTrackedRequests || {}, null, 2),
    "```",
  ];
  if (failure.screenshotRelative) {
    bodyLines.push("", `Screenshot: ${failure.screenshotRelative}`);
  }
  if (failure.exactApiFailure?.curlCommand) {
    bodyLines.push("", "Repro cURL:", "```bash", failure.exactApiFailure.curlCommand.slice(0, 8000), "```");
  }
  if (videoAbsPath) {
    bodyLines.push("", `Full flow video file: ${videoAbsPath}`);
  }
  const body = bodyLines.join("\n");

  const existingRes = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100`, {
    headers: githubHeaders(token, false),
  });
  const existingTxt = await existingRes.text();
  if (!existingRes.ok) {
    console.error("[post-e2e] GitHub list failed:", existingRes.status, existingTxt.slice(0, 800));
    return null;
  }
  const existing = JSON.parse(existingTxt);
  const duplicate = Array.isArray(existing)
    ? existing.find((it) => !it.pull_request && String(it.title || "").trim() === title)
    : null;
  if (duplicate) {
    console.log(`[post-e2e] GitHub exists: #${duplicate.number} (${title})`);
    return duplicate.number;
  }

  const createRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: githubHeaders(token, true),
    body: JSON.stringify({
      title,
      body,
      labels: ["e2e-automation", "jira-sync"],
      assignees: assignee ? [assignee] : [],
    }),
  });
  const createTxt = await createRes.text();
  if (!createRes.ok) {
    console.error("[post-e2e] GitHub create failed:", createRes.status, createTxt.slice(0, 800));
    return null;
  }
  const created = JSON.parse(createTxt);
  console.log(`[post-e2e] GitHub created: #${created.number} → ${created.html_url}`);
  return created.number;
}

async function main() {
  loadEnv();
  let failures = readNdjson();
  if (failures.length) {
    runAiFailureAnalysis();
    failures = readNdjson();
  }
  failures = enrichFailuresFromCucumber(failures);
  const video = newestVideo();
  const fullVideoPath = video ? path.join(root, video) : "";
  const lines = [];
  lines.push("# E2E failure report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  if (video) {
    lines.push("## Screen recording");
    lines.push(`Latest video (full run): \`${video}\``);
    lines.push("");
  }
  if (!failures.length) {
    lines.push("No failures recorded in `e2e/reports/failures/last-run/failures.ndjson`.");
  } else {
    lines.push(`## Failures (${failures.length})`);
    lines.push("");
    let i = 1;
    for (const f of failures) {
      lines.push(`### ${i++}. ${f.scenarioName || "Unnamed"}`);
      lines.push("");
      lines.push(`- **When:** ${f.failedAt}`);
      lines.push(`- **Feature / URI:** ${f.uri || "n/a"}`);
      if (f.screenshotRelative) lines.push(`- **Screenshot:** \`${f.screenshotRelative}\``);
      lines.push("");
      lines.push("**Error**");
      lines.push("```");
      lines.push((f.error?.fullMessage || f.error?.message || "").slice(0, 8000));
      lines.push("```");
      lines.push("");
      lines.push("**Developer suggestions**");
      for (const s of f.developerSuggestions || []) lines.push(`- ${s}`);
      lines.push("");
      lines.push("**Last tracked API URLs (from stubs)**");
      lines.push("```json");
      lines.push(JSON.stringify(f.lastTrackedRequests || {}, null, 2));
      lines.push("```");
      lines.push("");
    }
  }

  fs.writeFileSync(outMd, lines.join("\n"), "utf8");
  console.log("[post-e2e] Wrote", path.relative(root, outMd));

  const summary = {
    generatedAt: new Date().toISOString(),
    videoRelative: video,
    failures,
    aiTokenUsage: sumAiTokenUsage(failures),
  };
  fs.mkdirSync(path.dirname(outSummaryJson), { recursive: true });
  fs.writeFileSync(outSummaryJson, JSON.stringify(summary, null, 2), "utf8");
  console.log("[post-e2e] Wrote", path.relative(root, outSummaryJson));
  writeUnifiedDashboardAssets(summary);
  mirrorDashboardTelemetry(summary);

  const jiraEnabled = process.env.E2E_JIRA_CREATE === "1" || process.env.E2E_JIRA_CREATE === "true";
  const githubEnabled = process.env.E2E_GITHUB_CREATE === "1" || process.env.E2E_GITHUB_CREATE === "true";
  if (!jiraEnabled && !githubEnabled) {
    console.log("[post-e2e] Set E2E_JIRA_CREATE=1 and/or E2E_GITHUB_CREATE=1 to create tickets for failures.");
    process.exit(failures.length ? 1 : 0);
  }

  const jiraMax = Math.min(Number(process.env.E2E_JIRA_MAX || "1") || 1, failures.length);
  const githubMax = Math.min(Number(process.env.E2E_GITHUB_MAX || "1") || 1, failures.length);

  if (jiraEnabled) {
    for (let j = 0; j < jiraMax; j++) {
      const f = failures[j];
      const shot = f.screenshotRelative ? path.join(root, f.screenshotRelative) : null;
      await jiraCreateIssue(f, shot, fullVideoPath);
    }
  }
  if (githubEnabled) {
    for (let j = 0; j < githubMax; j++) {
      const f = failures[j];
      await githubCreateIssue(f, fullVideoPath);
    }
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
