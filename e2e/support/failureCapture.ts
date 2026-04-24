import type { ITestCaseHookParameter } from "@cucumber/cucumber";
import { Status } from "@cucumber/cucumber";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { HappileeWorld } from "./world";

const lastRunDir = path.join(process.cwd(), "e2e", "reports", "failures", "last-run");

export async function ensureFailureRunDir(): Promise<void> {
  await fs.rm(lastRunDir, { recursive: true, force: true });
  await fs.mkdir(lastRunDir, { recursive: true });
}

type FailureAnalysis = {
  shortReason: string;
  whyItFailed: string;
  whereItFailed: string;
  actionableFix: string[];
};

function stripAnsi(text: string): string {
  return String(text || "").replace(/\x1B\[[0-9;]*m/g, "");
}

function extractStepLocation(errorMessage: string): string {
  const m = errorMessage || "";
  const worldMatch = m.match(/at HappileeWorld\.<anonymous>\s+\(([^)]+)\)/i);
  if (worldMatch?.[1]) return worldMatch[1];
  const loginPageMatch = m.match(/at LoginPage\.\w+\s+\(([^)]+)\)/i);
  if (loginPageMatch?.[1]) return loginPageMatch[1];
  const genericTs = m.match(/\(([A-Za-z]:\\[^)]+\.ts:\d+:\d+)\)/i);
  if (genericTs?.[1]) return genericTs[1];
  return "Step definition location unavailable";
}

function analyzeFailure(errorMessage: string): FailureAnalysis {
  const m = stripAnsi(errorMessage || "");
  const location = extractStepLocation(m);
  const locationFile = location.split(":").slice(0, -2).join(":") || location;

  if (/ERR_CONNECTION_REFUSED/i.test(m) || /net::ERR_CONNECTION_REFUSED/i.test(m)) {
    return {
      shortReason: "Application URL is unreachable",
      whyItFailed:
        "Playwright could not open the app URL, so the scenario stopped before business assertions executed.",
      whereItFailed: location,
      actionableFix: [
        "Start frontend before tests: `npm run dev` and verify `http://localhost:5173/login` loads in browser.",
        "If your app runs on another port/host, set `E2E_BASE_URL` to that exact URL.",
        "Avoid running many suites while the dev server is restarting; wait for Vite to be fully ready.",
      ],
    };
  }

  if (/strict mode violation/i.test(m)) {
    return {
      shortReason: "Locator matched multiple elements",
      whyItFailed:
        "The test used an ambiguous Playwright locator name, so strict mode rejected it.",
      whereItFailed: location,
      actionableFix: [
        `Open step file: ${locationFile}.`,
        "Use exact name matching: `getByRole(..., { name, exact: true })`.",
        "If labels overlap (for example Assigned/Unassigned), add a scoped locator or `data-testid`.",
        "Prefer role + exact name + container scoping in dropdown assertions.",
      ],
    };
  }

  if (/toBeVisible\(\)/i.test(m) && /element\(s\) not found/i.test(m)) {
    const locatorMatch = m.match(/Locator:\s+([^\n]+)/i);
    const locator = locatorMatch?.[1] || "target locator";
    return {
      shortReason: "Expected UI element was not found",
      whyItFailed:
        `Assertion waited for visibility but the element never appeared (${locator}).`,
      whereItFailed: location,
      actionableFix: [
        `Open step file: ${locationFile} and validate this assertion matches actual UI text.`,
        "Confirm scenario expectation is correct for the logged-in role and page state.",
        "Check whether UI text changed; update step assertion to the new visible label if intended.",
        "If element appears after async load, wait on the actual API/render completion before asserting.",
      ],
    };
  }

  if (/dropdown/i.test(m) && (/not closed|still open|expected.*hidden/i.test(m) || /toBeHidden\(\)/i.test(m))) {
    return {
      shortReason: "Dropdown close behavior did not occur",
      whyItFailed:
        "After click/select/outside action, dropdown remained visible instead of closing.",
      whereItFailed: location,
      actionableFix: [
        `Open failing step and UI component referenced around ${locationFile}.`,
        "In dropdown component, close menu on option select and on outside click (set open state to false).",
        "If using document click handlers, ensure cleanup and event target checks are correct.",
      ],
    };
  }

  if (/query param/i.test(m) && /empty or absent/i.test(m)) {
    return {
      shortReason: "Cleared filter still persisted in request URL",
      whyItFailed:
        "After a clear action, request tracking still observed the old query param or no refetch happened.",
      whereItFailed: location,
      actionableFix: [
        `Start from step file ${locationFile}, then trace the page query builder used by this scenario.`,
        "When selecting an 'All' option, remove that key from serialized query params.",
        "Trigger list/refetch after clear so `last*RequestUrl` updates with the new URL.",
        "Verify filter state and request builder use the same source-of-truth field.",
      ],
    };
  }

  return {
    shortReason: "Unhandled assertion/runtime failure",
    whyItFailed:
      "The scenario failed with a non-classified error pattern; inspect stack and scenario context.",
    whereItFailed: location,
    actionableFix: [
      `Open failing step definition first: ${locationFile}.`,
      "Review screenshot/video + full error stack to confirm expected vs actual behavior.",
      "Add a stable locator or explicit wait only after confirming real app timing dependency.",
    ],
  };
}

/** Heuristic suggestions for developers (no app `src/` changes). */
export function developerSuggestions(errorMessage: string): string[] {
  return analyzeFailure(errorMessage).actionableFix;
}

function safeSlug(s: string, max = 60): string {
  return s
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max) || "scenario";
}

async function captureVisibleUiError(page: HappileeWorld["page"]): Promise<string> {
  const selectors = [
    // Login password validation message (exact path from Login.tsx structure)
    '.field-stack:has(#login-password) .field-error',
    // Generic fallback for other forms
    ".field-error",
    '[class*="error"]',
  ];

  for (const selector of selectors) {
    try {
      const text = (await page.locator(selector).first().innerText({ timeout: 1500 })).trim();
      if (text) return text;
    } catch {
      // Continue trying other selectors.
    }
  }
  return "";
}

export async function recordScenarioFailure(
  world: HappileeWorld,
  arg: ITestCaseHookParameter
): Promise<void> {
  if (arg.result?.status !== Status.FAILED) return;
  const page = world.page;
  if (!page || page.isClosed()) return;

  const errMsg = stripAnsi(arg.result.message || "");
  const lines = errMsg.split("\n").filter(Boolean);
  const headline = lines[0] || "Unknown error";

  await fs.mkdir(lastRunDir, { recursive: true });
  const slug = safeSlug(arg.pickle.name || "scenario");
  const base = `${Date.now()}-${slug}`;
  const pngPath = path.join(lastRunDir, `${base}.png`);
  const jsonPath = path.join(lastRunDir, `${base}.json`);

  let screenshotRelative = "";
  try {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: pngPath, fullPage: true });
    screenshotRelative = path.relative(process.cwd(), pngPath).replace(/\\/g, "/");
  } catch {
    /* ignore */
  }

  const uri =
    (arg.pickle as { uri?: string }).uri ||
    (arg.gherkinDocument as { uri?: string }).uri ||
    "";
  const analysis = analyzeFailure(headline + "\n" + errMsg);
  const visibleUIError = await captureVisibleUiError(page);
  const record = {
    scenarioName: arg.pickle.name,
    uri: uri || null,
    failedAt: new Date().toISOString(),
    error: {
      message: headline,
      fullMessage: errMsg.slice(0, 12_000),
    },
    failureExplanation: {
      whatHappened: analysis.shortReason,
      whyItHappened: analysis.whyItFailed,
      whereItFailed: analysis.whereItFailed,
    },
    screenshotRelative: screenshotRelative || null,
    visibleUIError: visibleUIError || null,
    videoHint:
      "Full-run recording: set E2E_RECORD_FULL_RUN=1 and check e2e/reports/videos/ for the newest .webm after the run ends.",
    developerSuggestions: developerSuggestions(headline + "\n" + errMsg),
    lastTrackedRequests: {
      lastClientsListRequestUrl: world.lastClientsListRequestUrl,
      lastLeadsListRequestUrl: world.lastLeadsListRequestUrl,
      lastPartnersListRequestUrl: world.lastPartnersListRequestUrl,
      lastLeadUpdatesRequestUrl: world.lastLeadUpdatesRequestUrl,
    },
  };

  await fs.writeFile(jsonPath, JSON.stringify(record, null, 2), "utf8");

  const ndjsonPath = path.join(lastRunDir, "failures.ndjson");
  await fs.appendFile(ndjsonPath, JSON.stringify(record) + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.error(`\n[e2e] FAILED: ${arg.pickle.name}\n  → ${headline}\n  → ${screenshotRelative || "(no screenshot)"}\n  → ${path.relative(process.cwd(), jsonPath)}\n`);
}
