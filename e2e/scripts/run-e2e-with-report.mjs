/**
 * Runs Cucumber then always generates e2e/reports/E2E-FAILURE-REPORT.md.
 * Exits with Cucumber's exit code so CI still fails on test failures.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const reportsDir = path.join(root, "e2e", "reports");
const stepShotsDir = path.join(reportsDir, "screenshots", "steps");
const videosDir = path.join(reportsDir, "videos");
const failuresLastRunDir = path.join(reportsDir, "failures", "last-run");

function clearDirectoryFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry);
    const stat = fs.statSync(entryPath);
    if (stat.isFile()) {
      fs.unlinkSync(entryPath);
      continue;
    }
    if (stat.isDirectory()) {
      fs.rmSync(entryPath, { recursive: true, force: true });
    }
  }
}

function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function newestFile(dirPath, ext) {
  if (!fs.existsSync(dirPath)) return null;
  const entries = fs.readdirSync(dirPath)
    .filter((f) => f.toLowerCase().endsWith(ext))
    .map((f) => {
      const p = path.join(dirPath, f);
      return { file: f, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return entries[0]?.file || null;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDuration(ns) {
  const n = Number(ns || 0);
  if (!n) return "-";
  const ms = Math.round(n / 1e6);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function findShotForStep(stepShots, stepText) {
  const words = slug(stepText).split("-").filter(Boolean);
  if (!words.length) return null;
  const matches = stepShots.filter((name) => words.every((w) => name.toLowerCase().includes(w)));
  return matches[matches.length - 1] || null;
}

function toDashboardRelativePath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  return normalized.replace(/^e2e\/reports\//, "");
}

function generateStaticDashboard() {
  const cucumberPath = path.join(reportsDir, "cucumber.json");
  const summaryPath = path.join(reportsDir, "failures", "last-run", "summary.json");

  const cucumber = safeReadJson(cucumberPath, []);
  const summary = safeReadJson(summaryPath, { failures: [] });
  const latestVideo = newestFile(videosDir, ".webm");
  const stepShots = fs.existsSync(stepShotsDir)
    ? fs.readdirSync(stepShotsDir).filter((f) => f.toLowerCase().endsWith(".png")).sort()
    : [];

  const feature = Array.isArray(cucumber) ? cucumber[0] : null;
  const scenarios = feature?.elements || [];
  const allSteps = scenarios.flatMap((s) => s.steps || []);
  const passed = allSteps.filter((s) => s.result?.status === "passed").length;
  const failed = allSteps.filter((s) => s.result?.status === "failed").length;

  const failuresByScenario = new Map((summary.failures || []).map((f) => [f.scenarioName || "", f]));

  const scenariosHtml = scenarios.map((scenario) => {
    const steps = scenario.steps || [];
    const hasFail = steps.some((s) => s.result?.status === "failed");
    const ticket = (scenario.name || "").match(/\b(BUG-\d+)\b/i)?.[1]?.toUpperCase() || "";
    const failureMeta = failuresByScenario.get(scenario.name || "");
    const stepRows = steps.map((step) => {
      const status = step.result?.status || "unknown";
      const normalizedStatus = String(status).toLowerCase();
      const stepStatusLabel =
        normalizedStatus === "skipped" || normalizedStatus === "pending"
          ? "skipped"
          : normalizedStatus;
      const passedShot = normalizedStatus === "passed" ? findShotForStep(stepShots, step.name || "") : null;
      const failedShot = normalizedStatus === "failed"
        ? toDashboardRelativePath(failureMeta?.screenshotRelative || "")
        : "";
      return `
        <div class="step">
          <div class="step-row">
            <div class="step-left">
              <span class="dot ${escapeHtml(stepStatusLabel)}"></span>
              <span class="step-text"><strong>${escapeHtml((step.keyword || "").trim())}</strong> ${escapeHtml(step.name || "")}</span>
            </div>
            <div class="step-right">
              <span class="status-label ${escapeHtml(stepStatusLabel)}">${escapeHtml(stepStatusLabel)}</span>
              <span class="dur">${escapeHtml(fmtDuration(step.result?.duration))}</span>
              ${
                passedShot
                  ? `<a class="thumb" href="screenshots/steps/${encodeURIComponent(passedShot)}" target="_blank"><img src="screenshots/steps/${encodeURIComponent(passedShot)}" alt="step screenshot"></a>`
                  : ""
              }
              ${
                failedShot
                  ? `<a class="thumb failure-shot" href="${escapeHtml(failedShot)}" target="_blank">
                      <span class="failure-shot-label">📸 Failure screenshot</span>
                      <img src="${escapeHtml(failedShot)}" alt="failure screenshot">
                    </a>`
                  : ""
              }
            </div>
          </div>
          ${step.result?.error_message ? `<div class="err">${escapeHtml(step.result.error_message)}</div>` : ""}
        </div>
      `;
    }).join("");

    const ai = failureMeta?.aiAnalysis || null;
    const severity = String(ai?.severity || "medium").toLowerCase();
    const severityClass = severity === "high" ? "sev-high" : severity === "low" ? "sev-low" : "sev-medium";
    const visibleUiError = String(failureMeta?.visibleUIError || "").trim();
    const aiHtml = ai
      ? `
        <div class="ai-panel">
          <div class="ai-head">
            <span>🤖 AI Analysis</span>
            <span class="sev ${severityClass}">${escapeHtml(severity.toUpperCase())}</span>
          </div>
          ${visibleUiError ? `<div class="ai-onscreen">👁️ On screen: ${escapeHtml(visibleUiError)}</div>` : ""}
          <div class="ai-what">${escapeHtml(ai.whatHappened || "")}</div>
          <div class="ai-root"><strong>Root cause:</strong> ${escapeHtml(ai.rootCause || "")}</div>
          <ol class="ai-list">${(Array.isArray(ai.developerSuggestions) ? ai.developerSuggestions : []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
        </div>
      `
      : "";

    return `
      <div class="scenario">
        <div class="scenario-head">
          <div>
            <div>${escapeHtml(scenario.name || "Unnamed scenario")}</div>
            ${failureMeta?.error?.message ? `<div class="meta">Failure: ${escapeHtml(failureMeta.error.message)}</div>` : ""}
          </div>
          <div>
            <span class="badge ${hasFail ? "failed" : "passed"}">${hasFail ? "FAILED" : "PASSED"}</span>
            ${ticket ? `<a class="meta" href="https://neoito-team-abhiraj.atlassian.net/browse/${escapeHtml(ticket)}" target="_blank">Jira ${escapeHtml(ticket)}</a>` : ""}
          </div>
        </div>
        <div class="steps">${stepRows || `<div class="empty">No step data.</div>`}</div>
        ${aiHtml}
      </div>
    `;
  }).join("");

  const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Happilee QA Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Segoe UI, system-ui, sans-serif; background: #0b1220; color: #e2e8f0; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
    .title { font-size: 22px; font-weight: 700; }
    .meta { color: #94a3b8; font-size: 13px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 14px; margin-bottom: 14px; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .stat h4 { margin: 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: .08em; }
    .stat .v { margin-top: 6px; font-size: 28px; font-weight: 700; }
    .ok { color: #22c55e; }
    .bad { color: #ef4444; }
    .scenario { border-top: 1px solid #1f2937; padding-top: 12px; margin-top: 12px; }
    .scenario:first-child { border-top: none; margin-top: 0; padding-top: 0; }
    .scenario-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 8px; }
    .badge { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
    .badge.passed { background: #14532d; color: #dcfce7; }
    .badge.failed { background: #7f1d1d; color: #fee2e2; }
    .steps { margin-top: 8px; display: grid; gap: 8px; }
    .step { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 10px; }
    .step-row { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .step-left { display: flex; gap: 8px; align-items: center; min-width: 0; }
    .step-right { display: flex; gap: 8px; align-items: center; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot.passed { background: #22c55e; }
    .dot.failed { background: #ef4444; }
    .dot.skipped { background: #f59e0b; }
    .dot.pending { background: #f59e0b; }
    .step-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #e5e7eb; }
    .status-label { font-size: 11px; text-transform: lowercase; border-radius: 999px; padding: 2px 8px; border: 1px solid #334155; color: #cbd5e1; }
    .status-label.passed { color: #22c55e; border-color: #166534; background: #052e16; }
    .status-label.failed { color: #ef4444; border-color: #7f1d1d; background: #450a0a; }
    .status-label.skipped, .status-label.pending { color: #f59e0b; border-color: #92400e; background: #451a03; }
    .dur { font-size: 12px; color: #94a3b8; white-space: nowrap; }
    .err { margin-top: 8px; color: #fecaca; font-size: 12px; white-space: pre-wrap; }
    .thumb { display: inline-flex; }
    .thumb img { height: 100px; width: auto; border-radius: 8px; border: 1px solid #334155; }
    .failure-shot { display: inline-flex; flex-direction: column; gap: 6px; text-decoration: none; }
    .failure-shot-label { color: #fca5a5; font-size: 12px; font-weight: 700; }
    .failure-shot img { width: 300px; max-width: 100%; height: auto; border-radius: 8px; border: 3px solid #ef4444; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3); }
    .links a { color: #60a5fa; margin-right: 12px; }
    .video-wrap video { width: 100%; max-height: 380px; border-radius: 8px; border: 1px solid #334155; background: #000; }
    .empty { color: #94a3b8; font-size: 14px; }
    .ai-panel { margin-top: 10px; padding: 10px; border: 1px solid #334155; border-radius: 10px; background: #0b1324; }
    .ai-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 700; }
    .sev { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
    .sev-high { background: #7f1d1d; color: #fecaca; }
    .sev-medium { background: #78350f; color: #fde68a; }
    .sev-low { background: #14532d; color: #bbf7d0; }
    .ai-onscreen { margin-bottom: 8px; padding: 8px 10px; border-radius: 8px; background: #fef08a; color: #3f2f00; font-size: 13px; font-weight: 700; }
    .ai-what { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #e2e8f0; }
    .ai-root { font-size: 13px; margin-bottom: 6px; color: #cbd5e1; }
    .ai-list { margin: 0; padding-left: 18px; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="title">Happilee QA Dashboard</div>
      <div class="meta">Generated: ${escapeHtml(new Date().toLocaleString())}</div>
    </div>

    <div class="card stats">
      <div class="stat"><h4>Total Scenarios</h4><div class="v">${scenarios.length}</div></div>
      <div class="stat"><h4>Total Steps</h4><div class="v">${allSteps.length}</div></div>
      <div class="stat"><h4>Passed</h4><div class="v ok">${passed}</div></div>
      <div class="stat"><h4>Failed</h4><div class="v bad">${failed}</div></div>
    </div>

    <div class="card video-wrap">
      <h3>Run Video</h3>
      ${
        latestVideo
          ? `<video controls src="videos/${escapeHtml(latestVideo)}"></video>
             <div style="margin-top:8px"><a href="videos/${escapeHtml(latestVideo)}" target="_blank">Download video</a></div>`
          : `<div class="empty">No video found.</div>`
      }
    </div>

    <div class="card links">
      <a href="./report.html" target="_blank">Open Cucumber Report</a>
      <a href="./cucumber.json" target="_blank">Open cucumber.json</a>
      <a href="./failures/last-run/summary.json" target="_blank">Open summary.json</a>
    </div>

    <div class="card">
      <h3>Scenarios and Steps</h3>
      ${scenariosHtml || `<div class="empty">No scenarios found in cucumber.json</div>`}
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(reportsDir, "dashboard.html"), dashboardHtml, "utf8");
}

const extraArgs = process.argv.slice(2);

clearDirectoryFiles(stepShotsDir);
clearDirectoryFiles(videosDir);
clearDirectoryFiles(failuresLastRunDir);

const cucumberArgs = [
  "cucumber-js",
  "--config",
  "e2e/cucumber.config.cjs",
  "--format",
  "progress",
  "--format",
  "json:e2e/reports/cucumber.json",
  ...extraArgs,
];

const r = spawnSync("npx", cucumberArgs, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

spawnSync(process.execPath, [path.join(__dirname, "post-e2e-failures.mjs")], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

generateStaticDashboard();

const code = typeof r.status === "number" ? r.status : 1;
process.exit(code);
