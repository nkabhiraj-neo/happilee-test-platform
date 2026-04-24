import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env") });

/**
 * Playwright lifecycle + API stubs for E2E.
 *
 * Video (full run, one .webm): E2E_RECORD_FULL_RUN=1 → one browser context for the whole run.
 * Video (per scenario):       E2E_RECORD_VIDEO=1 without E2E_RECORD_FULL_RUN → one file per scenario.
 * Headed browser:             E2E_HEADED=1
 *
 * After a full-run recording, open the newest file under e2e/reports/videos/.
 */
import { After, AfterAll, AfterStep, Before, BeforeAll, Status, type ITestCaseHookParameter } from "@cucumber/cucumber";
import { ensureFailureRunDir, recordScenarioFailure } from "./failureCapture";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import * as fs from "node:fs/promises";
import type { HappileeWorld } from "./world";

const videoDir = path.join(process.cwd(), "e2e", "reports", "videos");
const screenshotsDir = path.join(process.cwd(), "e2e", "reports", "screenshots");
const stepScreenshotsDir = path.join(screenshotsDir, "steps");

function sanitizeFilePart(value: string) {
  return value
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

let browser: Browser | undefined;
/** Single context for entire Cucumber run (one continuous video). */
let sharedRecordingContext: BrowserContext | undefined;

const useSharedRecording = process.env.E2E_RECORD_FULL_RUN === "1";
const usePerScenarioVideo =
  !useSharedRecording && (process.env.E2E_RECORD_VIDEO === "1" || process.env.E2E_RECORD_VIDEO === "true");

const emptyPaged = () =>
  JSON.stringify({ count: 0, next: null, previous: null, results: [] });

const leadFilterOptions = () =>
  JSON.stringify({
    sources: [{ value: "1", label: "Web" }],
    industries: [{ value: "1", label: "Technology" }],
    statuses: [
      { value: "open", label: "Open" },
      { value: "converted", label: "Converted" },
    ],
    stages: [{ value: "1", label: "Call" }],
    tags: [{ value: "1", label: "VIP" }],
  });

const clientFilterOptions = () =>
  JSON.stringify({
    client_types: [{ value: "c1", label: "Direct" }],
    plan_types: [{ value: "p1", label: "Standard" }],
    plan_statuses: [
      { value: "", label: "All" },
      { value: "paid", label: "Paid" },
      { value: "trial", label: "Free Trial" },
      { value: "churned", label: "Churned" },
    ],
    industries: [{ value: "1", label: "Retail" }],
  });

const partnerFilterOptions = () =>
  JSON.stringify({
    partner_types: [
      { value: "", label: "All Types" },
      { value: "reseller", label: "Reseller" },
      { value: "white_label", label: "White label" },
    ],
  });

function analyticsBody(pathname: string): string {
  if (pathname.includes("/ops/analytics/clients/counts-by-status/")) {
    return JSON.stringify({
      plan_type_counts: {},
      plan_status_counts: {},
      client_type_counts: {},
      user_id: 1,
      is_admin: true,
      timestamp: new Date().toISOString(),
    });
  }
  if (
    pathname.includes("/ops/analytics/clients/onboardings-trend/") ||
    pathname.includes("/ops/analytics/clients/churn-trend/")
  ) {
    return JSON.stringify({
      months: 0,
      from_month: null,
      to_month: null,
      buckets: [],
      timestamp: new Date().toISOString(),
    });
  }
  if (pathname.includes("/ops/analytics/leads/counts-by-status/")) {
    const z = { open: 0, converted: 0, follow_up: 0, lost: 0, won: 0, all: 0 };
    return JSON.stringify({
      global_counts: z,
      user_counts: z,
      user_id: 1,
      is_admin: false,
      timestamp: new Date().toISOString(),
    });
  }
  if (pathname.includes("/ops/analytics/partners/counts-by-type/")) {
    return JSON.stringify({
      partner_type_counts: { reseller: 0, white_label: 0 },
      timestamp: new Date().toISOString(),
    });
  }
  if (pathname.includes("/ops/analytics/clients/this-month-onboarded-count/")) {
    return JSON.stringify({ count: 0 });
  }
  if (pathname.includes("/ops/analytics/invoices/summary/")) {
    return JSON.stringify({
      this_month: { invoice_count: 0, pending_invoices: 0, revenue: "0", month: 1, year: 2026 },
      totals: { pending_receivables: "0" },
      timestamp: new Date().toISOString(),
    });
  }
  if (pathname.includes("/ops/analytics/invoices/revenue-trend/")) {
    return JSON.stringify({
      months: 6,
      from_month: null,
      to_month: null,
      buckets: [],
      timestamp: new Date().toISOString(),
    });
  }
  if (pathname.includes("/ops/analytics/leads/open-by-stage/")) {
    return JSON.stringify({ total_open: 0, buckets: [], timestamp: new Date().toISOString() });
  }
  return JSON.stringify({});
}

function isStubbedApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (port !== "8000" || !u.pathname.includes("/api/")) return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

async function installApiStubs(world: HappileeWorld) {
  const page = world.page;

  await page.route(isStubbedApiUrl, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    let pathname = "";
    try {
      pathname = new URL(url).pathname;
    } catch {
      return route.continue();
    }

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const json = (status: number, body: string) =>
      route.fulfill({ status, contentType: "application/json", body });

    if (method === "POST" && pathname.endsWith("/login/")) {
      let body: { username?: string; password?: string } = {};
      try {
        body = JSON.parse(req.postData() || "{}");
      } catch {
        /* ignore */
      }
      const ok =
        body.username === world.stubLoginEmail && body.password === world.stubLoginPassword;
      if (ok) {
        return json(200, JSON.stringify({ access: world.stubAccessToken, refresh: world.stubRefreshToken }));
      }
      return json(401, JSON.stringify({ detail: "No active account found with the given credentials" }));
    }

    if (method === "POST" && pathname.endsWith("/token_refresh/")) {
      return json(200, JSON.stringify({ access: world.stubAccessToken || "access-refreshed" }));
    }

    if (method === "GET" && pathname.includes("/ops/system-status/")) {
      return json(200, JSON.stringify({ admin_exists: world.systemAdminExists }));
    }

    if (method === "GET" && pathname.includes("/ops/me/")) {
      const role = world.stubLoginRole;
      const groups =
        role === "Admin" ? [{ id: 1, name: "Admin" }] : [{ id: 2, name: "Sales" }];
      return json(
        200,
        JSON.stringify({
          id: 1,
          first_name: "E2E",
          last_name: "User",
          email: world.stubLoginEmail || "e2e@neoito.com",
          groups,
        })
      );
    }

    if (method === "GET" && pathname.includes("/ops/leads/updates/")) {
      world.lastLeadUpdatesRequestUrl = url;
      return json(200, emptyPaged());
    }

    if (method === "GET" && pathname.includes("/ops/leads/filter-options/")) {
      return json(200, leadFilterOptions());
    }

    if (method === "GET" && /\/ops\/leads\/?(\?|$)/.test(pathname)) {
      world.lastLeadsListRequestUrl = url;
      return json(200, emptyPaged());
    }

    if (method === "GET" && pathname.includes("/ops/clients/filter-options/")) {
      return json(200, clientFilterOptions());
    }

    if (method === "GET" && /\/ops\/clients\/?(\?|$)/.test(pathname)) {
      world.lastClientsListRequestUrl = url;
      return json(200, emptyPaged());
    }

    if (method === "GET" && pathname.includes("/ops/partners/filter-options/")) {
      return json(200, partnerFilterOptions());
    }

    if (method === "GET" && /\/ops\/partners\/?(\?|$)/.test(pathname)) {
      world.lastPartnersListRequestUrl = url;
      return json(200, emptyPaged());
    }

    if (method === "GET" && (pathname.includes("/ops/sales-activities/") || pathname.includes("sales-activities"))) {
      return json(200, emptyPaged());
    }

    if (method === "GET" && pathname.includes("/ops/analytics/")) {
      return json(200, analyticsBody(pathname));
    }

    if (method === "GET" && pathname.includes("/ops/invoices/")) {
      return json(200, analyticsBody(pathname));
    }

    if (method === "GET") {
      return json(200, emptyPaged());
    }

    return json(200, JSON.stringify({}));
  });
}

/** Fresh scenario without hitting the app (avoids requiring Vite during Before). */
async function resetBrowserState(context: BrowserContext, page: HappileeWorld["page"]) {
  await context.clearCookies();
  await page.goto("about:blank");
}

BeforeAll(async () => {
  await ensureFailureRunDir();
  await fs.mkdir(videoDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });
  await fs.mkdir(stepScreenshotsDir, { recursive: true });
  browser = await chromium.launch({
    headless: process.env.E2E_HEADED === "1" || process.env.E2E_HEADED === "true" ? false : true,
  });

  if (useSharedRecording) {
    sharedRecordingContext = await browser.newContext({
      recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    });
    // eslint-disable-next-line no-console
    console.log(
      `[e2e] E2E_RECORD_FULL_RUN=1 — one continuous video will be written to ${videoDir} when the run finishes.`
    );
  }
});

AfterAll(async () => {
  if (sharedRecordingContext) {
    await sharedRecordingContext.close().catch(() => {});
    sharedRecordingContext = undefined;
    // eslint-disable-next-line no-console
    console.log(`[e2e] Full-run video saved under: ${videoDir}`);
  }
  await browser?.close();
  browser = undefined;
});

After(async function (this: HappileeWorld, arg: ITestCaseHookParameter) {
  const scenarioVideo = this.page?.video?.();

  try {
    if (this.page) {
      const scenarioName = sanitizeFilePart(arg.pickle.name || "scenario");
      const timestamp = Date.now();
      const screenshotPath = path.join(screenshotsDir, `${timestamp}-${scenarioName}.png`);
      const screenshot = await this.page.screenshot({ path: screenshotPath, fullPage: true });
      await this.attach(screenshot, "image/png");
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[e2e] scenario screenshot capture error:", e);
  }

  try {
    if (arg.result?.status === Status.FAILED) {
      await recordScenarioFailure(this, arg);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[e2e] recordScenarioFailure error:", e);
  }
  await this.page?.close().catch(() => {});
  if (!useSharedRecording) {
    await this._playwrightContext?.close().catch(() => {});
  }

  // Attach per-scenario video into Cucumber HTML report.
  // This works for non-shared recording mode where each scenario has its own context video file.
  if (!useSharedRecording && scenarioVideo) {
    try {
      const videoPath = await scenarioVideo.path();
      const videoBytes = await fs.readFile(videoPath);
      await this.attach(videoBytes, "video/webm");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[e2e] scenario video attach error:", e);
    }
  }

  this._playwrightContext = undefined;
});

AfterStep(async function (this: HappileeWorld, arg: { result?: { status?: Status }; pickleStep?: { text?: string; keyword?: string } }) {
  if (arg.result?.status !== Status.PASSED) return;
  if (!this.page || this.page.isClosed()) return;
  try {
    const stepKeyword = sanitizeFilePart(((arg.pickleStep as { keyword?: string })?.keyword || "step").toLowerCase());
    const stepTextSlug = sanitizeFilePart(arg.pickleStep?.text || "unknown-step");
    const screenshotPath = path.join(stepScreenshotsDir, `${Date.now()}-${stepKeyword}-${stepTextSlug}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[e2e] passed-step screenshot capture error:", e);
  }
});

Before({ timeout: 120_000 }, async function (this: HappileeWorld) {
  if (!browser) throw new Error("Browser not started");

  this.lastClientsListRequestUrl = null;
  this.lastLeadsListRequestUrl = null;
  this.lastPartnersListRequestUrl = null;
  this.lastLeadUpdatesRequestUrl = null;

  let context: BrowserContext;

  if (useSharedRecording && sharedRecordingContext) {
    context = sharedRecordingContext;
    this._playwrightContext = context;
  } else {
    const videoOpts =
      usePerScenarioVideo ? ({ recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } } as const) : {};
    context = await browser.newContext({ ...videoOpts });
    this._playwrightContext = context;
  }

  const page = await context.newPage();
  this.browser = browser;
  this.page = page;

  await installApiStubs(this);
  await resetBrowserState(context, page);
});
