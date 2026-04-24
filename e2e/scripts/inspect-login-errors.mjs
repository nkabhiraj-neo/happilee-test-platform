import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

function extractInterestingLines(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set(lines.filter((line) => /invalid|password|email|login|failed|incorrect|active account/i.test(line)))];
}

async function captureCase(name, email, password, screenshotPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://staging-backoffice.happilee.io/login", { waitUntil: "domcontentloaded" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  const fieldErrors = await page.locator(".field-error").allTextContents();
  const bodyText = await page.locator("body").innerText();
  const interesting = extractInterestingLines(bodyText);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();

  return { name, fieldErrors, interesting, screenshotPath };
}

const wrongPassword = await captureCase(
  "wrong_password",
  "sreekanth@neoito.com",
  "wrongpassword123",
  "e2e/reports/screenshots/login-wrong-password-live.png"
);

const nonExistentEmail = await captureCase(
  "non_existent_email",
  "notexist@fake.com",
  "anything123",
  "e2e/reports/screenshots/login-non-existent-email-live.png"
);

console.log(JSON.stringify({ wrongPassword, nonExistentEmail }, null, 2));
