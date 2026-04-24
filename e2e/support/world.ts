import { setDefaultTimeout, setWorldConstructor, World } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export type StubRole = "Admin" | "Sales";

export class HappileeWorld extends World {
  baseURL: string = process.env.E2E_BASE_URL ?? "http://localhost:5173";

  browser!: Browser;
  page!: Page;
  /** Own context per scenario, or shared context when E2E_RECORD_FULL_RUN=1 */
  _playwrightContext?: BrowserContext;

  systemAdminExists = true;

  stubLoginRole: StubRole = "Admin";
  stubLoginEmail = "";
  stubLoginPassword = "";

  stubAccessToken = "";
  stubRefreshToken = "";

  lastDialogText: string | null = null;

  lastClientsListRequestUrl: string | null = null;
  lastLeadsListRequestUrl: string | null = null;
  lastPartnersListRequestUrl: string | null = null;
  lastLeadUpdatesRequestUrl: string | null = null;
}

setDefaultTimeout(120_000);
setWorldConstructor(HappileeWorld);

export default HappileeWorld;
