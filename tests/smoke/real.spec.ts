/**
 * Smoke test against the REAL Firebase project (.env.local with NEXT_PUBLIC_USE_EMULATORS=false).
 * Verifies the deployed rules, indexes, Admin API credentials and real-time sync end to end.
 *
 *   npm run test:smoke   (= smoke setup → this spec → smoke cleanup)
 *
 * Everything it creates is tagged [SMOKE] and removed by `scripts/smoke.ts cleanup`.
 */
import fs from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

const creds = JSON.parse(fs.readFileSync(".smoke-creds.json", "utf8")) as Record<
  "admin" | "dev",
  { email: string; password: string }
>;
const T = "[SMOKE]";
const stamp = Date.now().toString(36);
const APP = `${T} App ${stamp}`;
const SPRINT = `${T} Sprint ${stamp}`;
const TASK = `${T} task ${stamp}`;

async function login(browser: Browser, who: "admin" | "dev"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds[who].email);
  await page.getByLabel("Password").fill(creds[who].password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

test.describe.configure({ mode: "serial" });

let sprintUrl = "";
let taskKey = "";

test("admin sets up master data and a sprint", async ({ browser }) => {
  const page = await login(browser, "admin");

  await page.goto("/admin/app-types");
  await page.getByRole("button", { name: "New App Type" }).first().click();
  await page.getByLabel("Name").fill(APP);
  await page.getByLabel("Short code").fill("SMK");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("App Type created")).toBeVisible();

  await page.goto("/admin/modules");
  await page.getByRole("button", { name: `Add module to ${APP}` }).click();
  await page.getByLabel("Name").fill(`${T} Module`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Module created")).toBeVisible();

  await page.goto("/sprints");
  await page.getByRole("button", { name: "New Sprint" }).first().click();
  await page.getByLabel("Name").fill(SPRINT);
  await page.getByRole("button", { name: "Create sprint" }).click();
  await page.waitForURL(/\/sprints\/[^/]+$/);
  sprintUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: SPRINT })).toBeVisible();
  await page.context().close();
});

test("tasks: key transaction, inline edit, comment, Firestore-stored screenshot", async ({ browser }) => {
  const page = await login(browser, "admin");
  await page.goto(sprintUrl);

  // Pick the smoke App Type in the full form so the task is tagged correctly.
  await page.getByRole("button", { name: "New Task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(TASK);
  await dialog.getByRole("combobox", { name: "App Type" }).click();
  await page.getByRole("option", { name: new RegExp(APP.replace(/[[\]]/g, "\\$&")) }).click();
  await dialog.getByRole("button", { name: "Create task" }).click();
  const created = page.getByText(/^TSK-\d+ created$/);
  await expect(created).toBeVisible({ timeout: 30_000 });
  taskKey = (await created.textContent())!.replace(" created", "");
  await expect(page).toHaveURL(new RegExp(`task=${taskKey}`));

  const panel = page.getByRole("dialog", { name: new RegExp(taskKey) });
  await panel.getByRole("combobox", { name: "Priority" }).click();
  await page.getByRole("option", { name: "Critical" }).click();

  await panel.getByLabel("New comment").fill(`${T} comment`);
  await panel.getByRole("button", { name: "Comment" }).click();
  await expect(panel.getByText(`${T} comment`).first()).toBeVisible();

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await panel.locator('input[type="file"]').setInputFiles({ name: "smoke.png", mimeType: "image/png", buffer: png });
  await expect(panel.getByRole("button", { name: "Open smoke.png" })).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Open smoke.png" }).click();
  await expect(page.getByRole("button", { name: "Download" })).toBeEnabled({ timeout: 30_000 });
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(panel.getByText(/changed priority from Medium to Critical/)).toBeVisible();
  await expect(panel.getByText(/added attachment smoke.png/)).toBeVisible();
  await page.context().close();
});

test("real-time sync + developer permissions (rules + indexes)", async ({ browser }) => {
  const admin = await login(browser, "admin");
  const dev = await login(browser, "dev");
  await admin.goto(sprintUrl);
  await dev.goto(sprintUrl);

  const devRow = dev.locator("tr", { has: dev.getByText(taskKey, { exact: true }) });
  await expect(devRow).toBeVisible();
  // Everyone can edit every task in an open sprint (team decision)
  await expect(devRow.locator("td[aria-readonly='false']").first()).toBeVisible();
  await expect(dev.getByRole("link", { name: "Users" })).toHaveCount(0);

  // Admin changes status; the developer sees it without reloading
  const adminRow = admin.locator("tr", { has: admin.getByText(taskKey, { exact: true }) });
  await adminRow.locator("td").nth(12).click();
  await admin.getByRole("option", { name: "In Progress" }).click();
  await expect(devRow).toContainText("In Progress", { timeout: 20_000 });

  // My Tasks query (sprintId + assigneeId index) loads for the developer
  await dev.goto("/my-tasks");
  await expect(dev.getByRole("heading", { name: "My Tasks" })).toBeVisible();
  await admin.context().close();
  await dev.context().close();
});

test("Admin API creates a user with the real service account", async ({ browser }) => {
  const page = await login(browser, "admin");
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Name").fill(`${T} Temp User`);
  await page.getByLabel("Email", { exact: true }).fill(`smoke-temp-${stamp}@smoke-test.invalid`);
  // Manual password path (no real email is sent to the fake smoke domain)
  await page.getByRole("switch").click();
  await page.getByLabel("Initial password").fill(`Smoke-${stamp}-pw`);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText(`${T} Temp User can now sign in`)).toBeVisible({ timeout: 30_000 });
  await page.context().close();
});
