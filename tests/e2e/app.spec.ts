/**
 * End-to-end flows on seeded emulator data (npm run seed). Tests run in order and share data.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "password123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/sprints\/s14/);
}

async function newSession(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return { ctx, page };
}

// Rows carry data-task-key (the Task ID column is hidden by default).
const row = (page: Page, key: string) => page.locator(`tr[data-task-key="${key}"]`);
/** Column index in the default layout (Sr No, App Type, Type, Module, Title, Description, Assigned to, Priority, …). */
const COL = { srNo: 0, priority: 7, status: 11 } as const;

test.describe.configure({ mode: "serial" });

test("unauthenticated users are redirected to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" }).or(page.getByText("Sign in").first())).toBeVisible();
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("dev1@example.com");
  await page.getByLabel("Password").fill("nope-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("Task ID column is hidden by default and can be shown", async ({ page }) => {
  await login(page, "dev3@example.com");
  await expect(page.getByRole("columnheader", { name: /Task ID/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Task ID" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: /Task ID/ })).toBeVisible();
  await expect(row(page, "TSK-9")).toContainText("TSK-9");
});

test("login lands on the active sprint with its tasks", async ({ page }) => {
  await login(page, "dev1@example.com");
  await expect(page.getByRole("heading", { name: "Sprint 14" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText("25 tasks")).toBeVisible();
  // carried-over tasks show the badge
  await expect(page.getByTitle("Carried over 1 time").first()).toBeVisible();
});

test("developers don't see admin nav or sprint controls", async ({ page }) => {
  await login(page, "dev1@example.com");
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close sprint" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page.getByText("Admins only")).toBeVisible();
});

test("inline edit syncs to another user's tab in real time", async ({ browser }) => {
  const qa = await newSession(browser, "qa1@example.com");
  const dev = await newSession(browser, "dev1@example.com");

  const qaRow = row(qa.page, "TSK-10");
  // Priority cell → pick "Critical"
  await qaRow.locator("td").nth(COL.priority).click();
  await qa.page.getByRole("option", { name: "Critical" }).click();
  await expect(qaRow.locator("td").nth(COL.priority)).toContainText("Critical");

  // The other session updates without reload
  await expect(row(dev.page, "TSK-10").locator("td").nth(COL.priority)).toContainText("Critical");

  // Activity is recorded with a human-readable label
  await qaRow.locator("td").nth(COL.srNo).click();
  await expect(qa.page).toHaveURL(/task=TSK-10/);
  await qa.page.getByRole("tab", { name: "Activity" }).click();
  await expect(qa.page.getByText(/changed priority from .* to Critical/)).toBeVisible();

  await qa.ctx.close();
  await dev.ctx.close();
});

test("presence shows other viewers of the sprint", async ({ browser }) => {
  const qa = await newSession(browser, "qa2@example.com");
  const dev = await newSession(browser, "dev2@example.com");
  await expect(qa.page.getByLabel(/other people viewing/)).toBeVisible();
  await qa.ctx.close();
  await dev.ctx.close();
});

test("quick add creates a task with the next global key", async ({ page }) => {
  await login(page, "dev1@example.com");
  const input = page.getByLabel("Quick add task");
  await input.fill("E2E quick added task");
  await input.press("Enter");
  await expect(page.getByText("TSK-32 created")).toBeVisible();
  await expect(row(page, "TSK-32")).toContainText("E2E quick added task");
});

test("side panel: comment + bug fields", async ({ page }) => {
  await login(page, "qa1@example.com");
  await row(page, "TSK-9").locator("td").nth(COL.srNo).click();
  const panel = page.getByRole("dialog", { name: /TSK-9/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Steps to reproduce")).toBeVisible(); // TSK-9 is a bug

  await panel.getByLabel("New comment").fill("Reproduced on staging\nsecond line");
  await panel.getByRole("button", { name: "Comment" }).click();
  await expect(panel.getByText("Reproduced on staging")).toBeVisible();

  // shareable URL
  await expect(page).toHaveURL(/task=TSK-9/);
  await panel.getByRole("button", { name: "Close panel" }).click();
  await expect(page).not.toHaveURL(/task=/);
});

test("attachments: upload via picker shows a thumbnail and bumps the count", async ({ page }) => {
  await login(page, "qa1@example.com");
  await row(page, "TSK-9").locator("td").nth(COL.srNo).click();
  const panel = page.getByRole("dialog", { name: /TSK-9/ });
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await panel.locator('input[type="file"]').setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer: png });
  await expect(panel.getByRole("button", { name: "Open screenshot.png" })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("(1/10)")).toBeVisible();
  await panel.getByRole("button", { name: "Open screenshot.png" }).click();
  // Download enables once the full image has been reassembled from its Firestore chunks
  await expect(page.getByRole("button", { name: "Download" })).toBeEnabled();
  await expect(page.getByRole("img", { name: "screenshot.png" }).last()).toHaveAttribute("src", /^data:image\/(webp|png);base64,/);
  await page.keyboard.press("Escape");
});

test("filters persist in the URL", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.getByRole("button", { name: /^Type/ }).first().click(); // toolbar filter (header sort button comes later)
  await page.getByRole("menuitemcheckbox", { name: "Bug" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/type=bug/);
  await page.reload();
  await expect(page.getByText(/of 26 tasks/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/type=bug/);
});

test("dashboard renders live metrics", async ({ page }) => {
  await login(page, "dev2@example.com");
  await page.goto("/dashboard");
  await expect(page.getByText("Completion", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Workload by person")).toBeVisible();
  await expect(page.getByText("Tasks by status")).toBeVisible();
});

test("dashboard: detailed progress card, and admin exports a date-range Excel report", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "admin@example.com");
  await page.goto("/dashboard");
  await expect(page.getByText("Sprint progress")).toBeVisible();
  await expect(page.getByLabel("Progress legend")).toContainText("In QA");
  await expect(page.getByText(/Sprint time: day \d+ of 14/)).toBeVisible();
  await expect(page.getByText("Critical open")).toBeVisible();

  await page.getByRole("button", { name: "Export report" }).click();
  const dialog = page.getByRole("dialog", { name: "Export report" });
  await dialog.getByRole("radio", { name: "Custom dates" }).click();
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await dialog.getByLabel("From").fill(iso(monthAgo));
  await dialog.getByLabel("To").fill(iso(today));
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^Sprint-report_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.xlsx$/);

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Completed", "Created", "Open now", "By person", "By app"]);
  const completed = wb.getWorksheet("Completed")!;
  expect(completed.getRow(1).getCell(1).value).toBe("Task ID");
  expect(completed.rowCount).toBeGreaterThan(1); // seed has status changes to Done in the last month
  expect(String(completed.getRow(2).getCell(1).value)).toMatch(/^TSK-\d+$/);
});

test("developers don't get the export button", async ({ page }) => {
  await login(page, "dev2@example.com");
  await page.goto("/dashboard");
  await expect(page.getByText("Sprint progress")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export report" })).toHaveCount(0);
});

test("admin creates a user through the Admin API", async ({ page }) => {
  test.setTimeout(150_000); // dev server: the first Admin API call compiles the route and boots the Admin SDK
  await login(page, "admin@example.com");
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Name").fill("Nina New");
  await page.getByLabel("Email", { exact: true }).fill(`nina.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Add & send invite" }).click();
  // the first API call compiles the route in dev, so allow longer
  await expect(page.getByText(/^Invite sent to nina\./)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("row", { name: /Nina New/ })).toHaveCount(1);
});

test("deactivating a user kicks out their open session", async ({ browser }) => {
  const dev = await newSession(browser, "dev4@example.com");
  const admin = await newSession(browser, "admin@example.com");
  await admin.page.goto("/admin/users");
  await admin.page.getByRole("button", { name: "Actions for Sara Kim" }).click();
  await admin.page.getByRole("menuitem", { name: "Deactivate" }).click();
  await admin.page.getByRole("button", { name: "Deactivate" }).click();

  // 1) the Admin API call finishes (can be slow on a busy dev machine), then
  // 2) the open session must be kicked out promptly by its live profile listener.
  test.setTimeout(150_000);
  await expect(admin.page.getByRole("alertdialog")).toBeHidden({ timeout: 60_000 });
  await expect(admin.page.getByRole("row", { name: /Sara Kim/ }).getByText("Deactivated")).toBeVisible();
  await expect(dev.page).toHaveURL(/\/login/, { timeout: 20_000 });

  // and they can't sign back in
  await dev.page.getByLabel("Email").fill("dev4@example.com");
  await dev.page.getByLabel("Password").fill(PASSWORD);
  await dev.page.getByRole("button", { name: "Sign in" }).click();
  await expect(dev.page.getByText("This account has been deactivated.")).toBeVisible();

  // reactivate for later runs
  await admin.page.getByRole("button", { name: "Actions for Sara Kim" }).click();
  await admin.page.getByRole("menuitem", { name: "Reactivate" }).click();
  await admin.page.getByRole("button", { name: "Reactivate" }).click();
  await expect(admin.page.getByRole("row", { name: /Sara Kim/ }).getByText("Active")).toBeVisible();
  await dev.ctx.close();
  await admin.ctx.close();
});

test("starting a second sprint while one is active is blocked", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.goto("/sprints/s15");
  await page.getByRole("button", { name: "Start sprint" }).click();
  await page.getByRole("button", { name: "Start sprint" }).last().click();
  await expect(page.getByText(/already active/)).toBeVisible();
});

test("close sprint carries tasks forward and produces a report", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.getByRole("button", { name: "Close sprint" }).click();
  const dialog = page.getByRole("dialog", { name: "Close Sprint 14" });
  await expect(dialog).toBeVisible();
  // leave TSK-10 behind
  await dialog.getByRole("checkbox", { name: "Carry TSK-10" }).click();
  await dialog.getByRole("button", { name: "Close sprint" }).click();
  await expect(page.getByText(/completed, \d+ carried to Sprint 15, 1 left incomplete/)).toBeVisible({ timeout: 30_000 });

  // closed sprint is read-only and has a report
  await expect(page.getByRole("link", { name: "View report" })).toBeVisible();
  await expect(page.getByLabel("Quick add task")).toHaveCount(0);
  await page.getByRole("link", { name: "View report" }).click();
  await page.waitForURL(/\/report/);
  await expect(page.getByText("Sprint 14: Sprint report")).toBeVisible({ timeout: 120_000 }); // first visit compiles the route in dev
  await expect(page.getByText(/Left incomplete \(1\)/)).toBeVisible();

  // carried tasks keep their key in the next sprint
  await page.goto("/sprints/s15");
  await expect(row(page, "TSK-9")).toBeVisible();
  await expect(row(page, "TSK-10")).toHaveCount(0);
});
