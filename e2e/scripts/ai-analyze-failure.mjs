import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const lastRunDir = path.join(root, "e2e", "reports", "failures", "last-run");
const ndjsonPath = path.join(lastRunDir, "failures.ndjson");
const analysisDir = path.join(root, "e2e", "reports", "analysis");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function parseNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function toTicketKey(failure) {
  const fromUri = String(failure?.uri || "").match(/\b(BUG-\d+)\b/i)?.[1];
  const fromScenario = String(failure?.scenarioName || "").match(/\b(BUG-\d+)\b/i)?.[1];
  return (fromUri || fromScenario || "BUG-UNKNOWN").toUpperCase();
}

function parseClaudeJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const block = raw.match(/\{[\s\S]*\}/);
    if (!block) return null;
    try {
      return JSON.parse(block[0]);
    } catch {
      return null;
    }
  }
}

function fallbackAnalysis(failure) {
  return {
    whatHappened: failure?.failureExplanation?.whatHappened || "Test failed during scenario execution.",
    rootCause: failure?.failureExplanation?.whyItHappened || "Unknown root cause from captured data.",
    developerSuggestions: Array.isArray(failure?.developerSuggestions) ? failure.developerSuggestions : [],
    severity: "medium",
  };
}

function normalizeUsage(usage) {
  const inputTokens = Number(usage?.input_tokens ?? usage?.inputTokens ?? 0) || 0;
  const outputTokens = Number(usage?.output_tokens ?? usage?.outputTokens ?? 0) || 0;
  const totalTokens = Number(usage?.total_tokens ?? usage?.totalTokens ?? inputTokens + outputTokens) || (inputTokens + outputTokens);
  return { inputTokens, outputTokens, totalTokens };
}

function buildPrompt(failure) {
  return `You are a senior QA engineer analyzing a test failure. Analyze everything below and give a detailed, specific report.

SCENARIO: ${failure.scenarioName}
FAILED STEP: ${failure.failureExplanation?.whereItFailed}

TERMINAL ERROR:
${failure.error?.fullMessage}

VISIBLE UI ERROR ON SCREEN:
${failure.visibleUIError || "not captured"}

EXACT ERROR MESSAGE VISIBLE ON SCREEN: ${failure.visibleUIError || "not captured"}

EXISTING BASIC SUGGESTIONS:
${(failure.developerSuggestions || []).join("\n")}

Based on ALL of this:
1. Write exactly what happened in plain English (be specific, and explicitly include the EXACT ERROR MESSAGE VISIBLE ON SCREEN text)
2. Write the root cause (why did this happen technically)  
3. Write 3-5 specific actionable developer suggestions (reference actual files, env vars, specific things to check)
4. Severity: high/medium/low and why

Return ONLY valid JSON, no markdown:
{
  "whatHappened": "specific description mentioning actual error",
  "rootCause": "technical root cause",
  "developerSuggestions": ["specific step 1", "specific step 2", "specific step 3"],
  "severity": "high/medium/low",
  "severityReason": "why this severity"
}`;
}

async function analyzeWithClaude(client, failure) {
  console.log("[ai-analyze] Calling Claude API...");
  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 900,
    temperature: 0.2,
    messages: [{ role: "user", content: buildPrompt(failure) }],
  });
  console.log("[ai-analyze] Claude response received");
  const text = message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const parsed = parseClaudeJson(text);
  if (!parsed) return fallbackAnalysis(failure);

  const sev = String(parsed.severity || "medium").toLowerCase();
  const usage = normalizeUsage(message?.usage);
  return {
    whatHappened: String(parsed.whatHappened || fallbackAnalysis(failure).whatHappened),
    rootCause: String(parsed.rootCause || fallbackAnalysis(failure).rootCause),
    developerSuggestions: Array.isArray(parsed.developerSuggestions) ? parsed.developerSuggestions.map(String) : fallbackAnalysis(failure).developerSuggestions,
    severity: ["low", "medium", "high"].includes(sev) ? sev : "medium",
    tokenUsage: usage,
  };
}

async function main() {
  loadEnv();
  const failures = parseNdjson(ndjsonPath);
  if (!failures.length) {
    console.log("[ai-analyze] No failures found.");
    return;
  }

  fs.mkdirSync(analysisDir, { recursive: true });
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  console.log(`[ai-analyze] ANTHROPIC_API_KEY loaded: ${apiKey ? "yes" : "no"}`);
  const hasApi = apiKey && apiKey !== "your_key_here";
  console.log(`[ai-analyze] Claude API enabled: ${hasApi ? "yes" : "no"}`);
  const client = hasApi ? new Anthropic({ apiKey }) : null;

  const analyzed = [];
  const usageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  for (const failure of failures) {
    let aiAnalysis = fallbackAnalysis(failure);
    if (client) {
      try {
        aiAnalysis = await analyzeWithClaude(client, failure);
      } catch (err) {
        console.error("[ai-analyze] Claude API call failed:", err);
        aiAnalysis = fallbackAnalysis(failure);
      }
    }
    const enriched = { ...failure, aiAnalysis };
    const usage = normalizeUsage(aiAnalysis?.tokenUsage);
    enriched.aiTokenUsage = usage;
    usageTotals.inputTokens += usage.inputTokens;
    usageTotals.outputTokens += usage.outputTokens;
    usageTotals.totalTokens += usage.totalTokens;
    analyzed.push(enriched);

    const ticket = toTicketKey(failure);
    const analysisPath = path.join(analysisDir, `${ticket}.json`);
    const existing = fs.existsSync(analysisPath)
      ? JSON.parse(fs.readFileSync(analysisPath, "utf8"))
      : { ticketKey: ticket, failures: [] };
    const next = {
      ...existing,
      ticketKey: ticket,
      generatedAt: new Date().toISOString(),
      failures: [...(Array.isArray(existing.failures) ? existing.failures : []), {
        scenarioName: failure.scenarioName,
        whereItFailed: failure?.failureExplanation?.whereItFailed || "",
        errorMessage: failure?.error?.message || "",
        screenshotRelative: failure?.screenshotRelative || "",
        aiAnalysis,
        aiTokenUsage: usage,
      }],
    };
    fs.writeFileSync(analysisPath, JSON.stringify(next, null, 2), "utf8");
  }

  fs.writeFileSync(ndjsonPath, analyzed.map((f) => JSON.stringify(f)).join("\n") + "\n", "utf8");
  fs.writeFileSync(
    path.join(lastRunDir, "ai-usage.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: "claude-sonnet-4-5",
        ...usageTotals,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`[ai-analyze] Updated failures: ${ndjsonPath}`);
}

main().catch((err) => {
  console.error("[ai-analyze] Failed:", err?.message || err);
  process.exit(1);
});
