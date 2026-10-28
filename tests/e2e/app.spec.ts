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
  await page.waitForURL(/\/releases\/s14/);
}

async function newSession(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return { ctx, page };
}

// Rows carry data-task-key (the Task ID column is hidden by default).
const row = (page: Page, key: string) => page.locator(`tr[data-task-key="${key}"]`);
/** Column index in the default layout (Sr No, App Type, Category, Module, Task, Assignees, Priority, Est, Actual, Status, Remarks, …). */
const COL = { srNo: 0, category: 2, task: 4, assignees: 5, priority: 6, status: 9, remarks: 10 } as const;

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

test("login lands on the active release with its tasks", async ({ page }) => {
  await login(page, "dev1@example.com");
  await expect(page.getByRole("heading", { name: "Release 14" })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Tasks" })).toBeVisible();
  // the header and the grid agree on the count
  await expect(page.getByText(/^25 tasks · \d+% complete$/)).toBeVisible();
  await expect(page.getByText(/^25 tasks · Arrow keys/)).toBeVisible();
  // carried-over tasks show the badge
  await expect(page.getByTitle("Carried over 1 time").first()).toBeVisible();
});

test("developers don't see admin nav or release controls", async ({ page }) => {
  await login(page, "dev1@example.com");
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close release" })).toHaveCount(0);
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

test("anyone can edit Remarks inline, and others see it live", async ({ browser }) => {
  const dev = await newSession(browser, "dev2@example.com"); // TSK-9 is assigned to dev1, not dev2
  const qa = await newSession(browser, "qa2@example.com");
  const cell = (page: Page) => row(page, "TSK-9").locator("td").nth(COL.remarks);
  await cell(dev.page).click();
  const box = cell(dev.page).locator("textarea"); // the editor opens inside the cell
  await box.fill("Reproduced on staging");
  await box.press("Shift+Enter");
  await box.pressSequentially("needs backend fix");
  await box.press("Enter");
  await expect(cell(dev.page)).toContainText("needs backend fix");
  await expect(cell(qa.page)).toContainText("Reproduced on staging");
  await qa.ctx.close();
  await dev.ctx.close();
});

test("a task can have several assignees, and it shows in each one's My Tasks", async ({ browser }) => {
  test.setTimeout(120_000); // two sessions
  const qa = await newSession(browser, "qa1@example.com");
  const dev = await newSession(browser, "dev2@example.com");
  const cell = (page: Page) => row(page, "TSK-12").locator("td").nth(COL.assignees); // seeded with Sara Kim only
  await cell(qa.page).click();
  await qa.page.getByRole("option", { name: "Maya Chen" }).click();
  await qa.page.keyboard.press("Escape"); // closing the picker saves once
  await expect(cell(qa.page)).toContainText("Sara Kim, Maya Chen");
  await expect(cell(dev.page)).toContainText("Maya Chen");

  await dev.page.goto("/my-tasks");
  await expect(row(dev.page, "TSK-12")).toBeVisible();

  await row(qa.page, "TSK-12").locator("td").nth(COL.srNo).click();
  await qa.page.getByRole("tab", { name: "Activity" }).click();
  await expect(qa.page.getByText(/changed assignees from Sara Kim to Sara Kim, Maya Chen/)).toBeVisible();
  await qa.ctx.close();
  await dev.ctx.close();
});

test("statuses include On Hold, Released and Duplicate; the old Description column is gone", async ({ page }) => {
  await login(page, "qa2@example.com");
  await expect(page.getByRole("columnheader", { name: "Task", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Category" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Description" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Severity" })).toHaveCount(0);
  const status = row(page, "TSK-11").locator("td").nth(COL.status);
  await status.click();
  for (const name of ["Open", "On Hold", "Fixed", "Testing in Progress", "Ready to Release", "Released", "Cancelled", "Duplicate"]) {
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("option", { name: "On Hold", exact: true }).click();
  await expect(status).toContainText("On Hold");
});

test("anyone can drag tasks into a new order (or use Alt+arrows), and others see it live", async ({ browser }) => {
  const dev = await newSession(browser, "dev4@example.com");
  const qa = await newSession(browser, "qa2@example.com");
  const keys = (page: Page) => page.locator("tbody tr[data-task-key]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-task-key")));
  const before = await keys(dev.page);
  const [first, second, third] = before as string[];

  // drag the 3rd task onto the top half of the 1st → it becomes first
  const target = row(dev.page, first).locator("td").nth(COL.task);
  await row(dev.page, third).locator("[data-drag-handle]").dragTo(target, { targetPosition: { x: 20, y: 2 } });
  await expect.poll(() => keys(dev.page)).toEqual([third, first, second, ...before.slice(3)]);
  await expect.poll(() => keys(qa.page)).toEqual([third, first, second, ...before.slice(3)]);
  await expect(row(dev.page, third).locator("td").nth(COL.srNo)).toContainText("1");

  // keyboard: Alt+↓ on the first row moves it back down one place
  await row(dev.page, third).locator("td").nth(COL.priority).focus();
  await dev.page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => keys(dev.page)).toEqual([first, third, second, ...before.slice(3)]);

  // sorted by another column → no drag handles
  await dev.page.getByRole("columnheader", { name: "Priority" }).getByRole("button").click();
  await expect(dev.page.locator("[data-drag-handle]")).toHaveCount(0);
  await expect(dev.page.getByText("Sort by Sr No to reorder")).toBeVisible();
  await qa.ctx.close();
  await dev.ctx.close();
});

test("columns can be reordered from the menu or by dragging headers, and the order is remembered", async ({ page }) => {
  await login(page, "dev1@example.com");
  const headers = () => page.locator("thead th[data-column]").evaluateAll((ths) => ths.map((th) => th.getAttribute("data-column")));
  const before = (await headers()) as string[];
  expect(before.slice(0, 3)).toEqual(["srNo", "appTypeId", "type"]);

  // menu: move Priority left once (it swaps with Assignees)
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitem", { name: "Move Priority left" }).click();
  await page.keyboard.press("Escape");
  const afterMenu = (await headers()) as string[];
  expect(afterMenu.indexOf("priority")).toBe(afterMenu.indexOf("assigneeIds") - 1);

  // drag: Task onto the left half of App Type → Task becomes the first movable column
  const target = page.locator('thead th[data-column="appTypeId"]');
  await page.locator('thead th[data-column="title"]').dragTo(target, { targetPosition: { x: 4, y: 10 } });
  await expect.poll(async () => ((await headers()) as string[]).slice(0, 3)).toEqual(["srNo", "title", "appTypeId"]);

  // remembered after a reload
  await page.reload();
  await expect.poll(async () => ((await headers()) as string[]).slice(0, 3)).toEqual(["srNo", "title", "appTypeId"]);

  // reset
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitem", { name: "Reset column order" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(headers).toEqual(before);
});

test("people pick their avatar colour; admins can set anyone's", async ({ browser }) => {
  test.setTimeout(150_000); // two sessions + first compile of /admin/users in dev
  const dev = await newSession(browser, "dev3@example.com");
  const accountAvatar = dev.page.getByRole("button", { name: "Account menu" }).locator("[data-avatar-color]");
  await dev.page.getByRole("button", { name: "Account menu" }).click();
  await dev.page.getByRole("menuitem", { name: "Avatar colour" }).click();
  await dev.page.getByRole("radio", { name: "Colour #16a34a" }).click();
  await dev.page.getByRole("button", { name: "Save" }).click();
  await expect(accountAvatar).toHaveAttribute("data-avatar-color", "#16a34a");
  await dev.page.reload();
  await expect(accountAvatar).toHaveAttribute("data-avatar-color", "#16a34a");

  const admin = await newSession(browser, "admin@example.com");
  await admin.page.goto("/admin/users");
  await admin.page.getByRole("button", { name: "Actions for Leo Garcia" }).click();
  await admin.page.getByRole("menuitem", { name: "Avatar colour" }).click();
  await admin.page.getByRole("button", { name: "Use automatic colour" }).click();
  await admin.page.getByRole("button", { name: "Save" }).click();
  // the developer's own header updates live
  await expect(accountAvatar).toHaveAttribute("data-avatar-color", "auto");
  await admin.ctx.close();
  await dev.ctx.close();
});

test("suggestion box: anyone shares one with a picture; QA adds it to a release as a task", async ({ browser }) => {
  test.setTimeout(180_000);
  const dev = await newSession(browser, "dev2@example.com");
  await dev.page.getByRole("link", { name: "Suggestions" }).click();
  await expect(dev.page.getByRole("heading", { name: "Suggestions" })).toBeVisible({ timeout: 90_000 }); // first visit compiles the route in dev
  await expect(dev.page.getByText("Show due dates on My Tasks")).toBeVisible(); // seeded, visible to everyone

  await dev.page.getByRole("button", { name: "Share a suggestion" }).first().click();
  const form = dev.page.getByRole("dialog", { name: "Share a suggestion" });
  await form.getByRole("button", { name: "Send suggestion" }).click();
  await expect(form.getByText("Please write your suggestion in a few words.")).toBeVisible();
  await form.getByLabel("1. What’s your suggestion?").fill("Bigger text in the task panel");
  await form.getByRole("radio", { name: /Looks or ease of use/ }).click();
  await form.getByLabel(/Tell us more/).fill("Hard to read on my laptop.");
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await form.getByLabel("Choose pictures").setInputFiles({ name: "screen.png", mimeType: "image/png", buffer: png });
  await expect(form.getByRole("img", { name: "Picture 1" })).toBeVisible();
  await form.screenshot({ path: "test-results/suggestion-form.png" });
  await form.getByRole("button", { name: "Send suggestion" }).click();
  await expect(dev.page.getByText("Thanks! Your suggestion was sent.")).toBeVisible({ timeout: 30_000 });
  const card = (page: Page) => page.locator("li[data-suggestion]", { hasText: "Bigger text in the task panel" });
  await expect(card(dev.page)).toContainText("1 picture");
  await expect(card(dev.page)).toContainText("New");
  await expect(card(dev.page).getByRole("button", { name: /Actions for/ })).toHaveCount(0); // developers don't triage

  const qa = await newSession(browser, "qa1@example.com");
  await expect(qa.page.getByRole("link", { name: /Suggestions/ })).toContainText("2"); // two new
  await qa.page.goto("/suggestions");
  await card(qa.page).getByRole("button", { name: /Actions for/ }).click();
  await qa.page.getByRole("menuitem", { name: "Add to a release…" }).click();
  const add = qa.page.getByRole("dialog", { name: "Add to a release" });
  await expect(add.getByRole("combobox", { name: "Release" })).toContainText("Release 14 (active)");
  await add.screenshot({ path: "test-results/add-to-release.png" });
  await add.getByRole("button", { name: "Add to release" }).click();
  await expect(qa.page.getByText(/Added to Release 14 as TSK-\d+/)).toBeVisible({ timeout: 30_000 });
  await expect(card(qa.page)).toContainText(/Added to Release 14 · TSK-\d+/);
  await expect(card(dev.page)).toContainText(/Added to Release 14 · TSK-\d+/); // the author sees it live

  // the task carries the details, who suggested it, and the picture
  await card(qa.page).click();
  await qa.page.getByRole("link", { name: /Open task TSK-\d+/ }).click();
  await expect(qa.page.getByText("Suggested by Maya Chen")).toBeVisible({ timeout: 30_000 });
  await expect(qa.page.getByRole("link", { name: "A suggestion (open it)" })).toBeVisible();
  await expect(qa.page.getByRole("heading", { name: /Attachments/ })).toContainText("(1/");
  await qa.ctx.close();
  await dev.ctx.close();
});

test("Backlog and All Tasks: QA moves tasks between a release and the Backlog; counts stay per release", async ({ browser }) => {
  test.setTimeout(240_000);
  const qa = await newSession(browser, "qa2@example.com");
  const page = qa.page;
  const footer = page.getByText(/^\d+ (of \d+ )?tasks · Arrow keys/);
  await expect(row(page, "TSK-11")).toBeVisible();
  const releaseTotal = Number((await footer.textContent())!.match(/^(\d+)/)![1]);

  // tick two tasks in the release and move them to the Backlog
  await row(page, "TSK-11").getByRole("checkbox", { name: "Select TSK-11" }).check();
  await row(page, "TSK-12").getByRole("checkbox", { name: "Select TSK-12" }).check(); // TSK-13 is Ready to Release: not allowed
  await expect(page.getByRole("region", { name: "Selected tasks" })).toContainText("2 tasks selected");
  await page.getByRole("button", { name: "Move to…" }).click();
  const move = page.getByRole("dialog", { name: "Move 2 tasks to…" });
  await move.getByRole("radio", { name: /Backlog/ }).click();
  await move.getByRole("button", { name: "Move 2 tasks" }).click();
  await expect(page.getByText("Moved 2 tasks to Backlog")).toBeVisible({ timeout: 30_000 });
  await expect(row(page, "TSK-11")).toHaveCount(0);
  await expect(footer).toHaveText(new RegExp(`^${releaseTotal - 2} tasks`)); // the release count only counts its own tasks

  // Backlog page lists them (+ the 3 seeded); move one back from the task panel
  await page.getByRole("link", { name: "Backlog" }).click();
  await expect(page.getByRole("heading", { name: "Backlog" })).toBeVisible({ timeout: 90_000 });
  await expect(row(page, "TSK-11")).toBeVisible();
  await expect(footer).toHaveText(/^5 tasks/);
  await row(page, "TSK-11").locator("td").nth(COL.srNo + 0).getByText(/^\d+$/).click();
  await page.getByRole("button", { name: "Move to…" }).click();
  await page.getByRole("dialog", { name: "Move TSK-11 to…" }).getByRole("radio", { name: /Release 14/ }).click();
  await page.getByRole("button", { name: "Move 1 task" }).click();
  await expect(page.getByText("Moved 1 task to Release 14")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: /TSK-11/ }).getByText(/moved this task from Backlog to Release 14/)).toHaveCount(0); // activity tab not open
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(row(page, "TSK-11")).toHaveCount(0);

  // All Tasks: everything, with a Release column and filter
  await page.getByRole("link", { name: "All Tasks" }).click();
  await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("columnheader", { name: "Release", exact: true })).toBeVisible();
  await expect(row(page, "TSK-1")).toBeVisible(); // a task from the closed Release 13
  await page.getByRole("button", { name: /^Release/ }).first().click();
  await page.getByRole("menuitemcheckbox", { name: "Backlog" }).click();
  await page.keyboard.press("Escape");
  // the Release filter runs in the database: the page holds just the 4 Backlog tasks
  await expect(footer).toHaveText(/^4 tasks/);
  await expect(page.getByLabel("Pages")).toContainText("Showing 1–4 of 4");
  await expect(page.getByLabel("Pages")).toContainText("Page 1 of 1");
  await page.getByRole("button", { name: "Clear filters" }).click();

  // a task number finds the task anywhere (here: TSK-1, in the closed Release 13)
  await page.getByLabel("Search tasks").fill("1");
  await expect(page.getByLabel("Pages")).toContainText("Showing task TSK-1 from any release");
  await expect(row(page, "TSK-1")).toBeVisible();
  await expect(page.locator("tbody tr[data-task-key]")).toHaveCount(1);
  await page.getByLabel("Search tasks").fill("");

  // a developer sees no tick boxes / Move
  const dev = await newSession(browser, "dev1@example.com");
  await expect(dev.page.getByRole("checkbox", { name: /^Select TSK-/ })).toHaveCount(0);
  await dev.ctx.close();
  await qa.ctx.close();
});

test("dashboard: pick any release; numbers only cover that release", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa1@example.com");
  await page.goto("/dashboard");
  const picker = page.getByRole("combobox", { name: "Release shown on the dashboard" });
  await expect(picker).toContainText("Release 14", { timeout: 60_000 });
  await picker.click();
  const options = page.getByRole("option");
  await expect(options.first()).toContainText("Release 14 (active)"); // the active one first
  await page.getByRole("option", { name: /Release 13/ }).click();
  await expect(page.getByText(/closed: carried-over tasks have moved on/)).toBeVisible();
  await expect(page.getByText(/^\d+ tasks in this release/).or(page.getByText(/\d+ tasks in this release/)).first()).toBeVisible();
});

test("bugs need an environment; Production makes a task Critical; Environment filter", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa2@example.com");
  await page.getByRole("button", { name: "New Task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Task", { exact: true }).fill("Checkout crashes on submit");
  await form.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Bug" }).click();
  await expect(form.getByText("Environment (required for bugs)")).toBeVisible();
  await form.getByRole("button", { name: "Create task" }).click();
  await expect(form.getByText("Choose where the bug was found (Staging or Production)")).toBeVisible();

  await form.getByRole("combobox", { name: "Environment" }).click();
  await page.getByRole("option", { name: "Production", exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Priority" })).toContainText("Critical"); // default for Production
  await form.getByRole("button", { name: "Create task" }).click();
  const toast = page.getByText(/^TSK-\d+ created$/);
  await expect(toast).toBeVisible({ timeout: 30_000 });
  const key = (await toast.textContent())!.replace(" created", "");

  // changing an existing task to Production also makes it Critical
  await row(page, "TSK-15").locator("td").nth(COL.srNo).getByText(/^\d+$/).click();
  const panel = page.getByRole("dialog", { name: /TSK-15/ });
  await panel.getByRole("combobox", { name: "Environment" }).click();
  await page.getByRole("option", { name: "Production", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Priority" })).toContainText("Critical");
  await panel.getByRole("button", { name: "Close panel" }).click();

  // filter: Environment → Production lists the new bug and TSK-15 only among production work
  await page.getByRole("button", { name: /^Environment/ }).first().click();
  await page.getByRole("menuitemcheckbox", { name: "Production" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/env=Production/);
  await expect(row(page, key)).toBeVisible();
  await expect(row(page, "TSK-15")).toBeVisible();
  await expect(row(page, "TSK-9")).toHaveCount(0);
});

test("admins can keep a user out of the Assignees list; the Move dialog lists the selected tasks", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, "admin@example.com");
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Actions for Leo Garcia" }).click({ timeout: 90_000 });
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("switch", { name: "Can be assigned tasks" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("not assigned tasks")).toBeVisible();

  await page.goto("/releases/s14");
  await row(page, "TSK-9").locator("td").nth(COL.assignees).click(); // TSK-9: Dev Patel only
  await expect(page.getByRole("option", { name: "Dev Patel" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Leo Garcia" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // the Move dialog shows what's selected
  await row(page, "TSK-9").getByRole("checkbox", { name: "Select TSK-9" }).check();
  await row(page, "TSK-10").getByRole("checkbox", { name: "Select TSK-10" }).check();
  await page.getByRole("button", { name: "Move to…" }).click();
  const list = page.getByRole("dialog", { name: "Move 2 tasks to…" }).getByRole("list", { name: "Tasks to move" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("TSK-9");
  await expect(list).toContainText("TSK-10");
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("Release date and Environment (Staging/Production), plus old /sprints links redirect", async ({ page }) => {
  await login(page, "dev3@example.com");
  // old bookmark-style link still opens the task
  await page.goto("/sprints/s14?task=TSK-9");
  await expect(page).toHaveURL(/\/releases\/s14\?task=TSK-9/);
  const panel = page.getByRole("dialog", { name: /TSK-9/ });
  await panel.getByLabel("Release date").fill("2026-11-15");
  await panel.getByLabel("Release date").blur();
  await panel.getByRole("combobox", { name: "Environment" }).click();
  await expect(page.getByRole("option", { name: "Staging", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Production", exact: true }).click();
  await panel.getByRole("button", { name: "Close panel" }).click();
  await expect(row(page, "TSK-9")).toContainText("2026-11-15");
  await expect(row(page, "TSK-9")).toContainText("Production");
});

test("presence shows other viewers of the release", async ({ browser }) => {
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
  // the next key depends on earlier flows (e.g. a suggestion added to the release), so read it from the toast
  const toast = page.getByText(/^TSK-\d+ created$/);
  await expect(toast).toBeVisible();
  const key = (await toast.textContent())!.replace(" created", "");
  await expect(row(page, key)).toContainText("E2E quick added task");
});

test("side panel: comment + bug fields", async ({ page }) => {
  await login(page, "qa1@example.com");
  await row(page, "TSK-9").locator("td").nth(COL.srNo).click();
  const panel = page.getByRole("dialog", { name: /TSK-9/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Steps to reproduce")).toBeVisible(); // TSK-9 is a bug

  await panel.getByLabel("New comment").fill("QA comment: seen again today\nsecond line"); // distinct from the Remarks flow's text
  await panel.getByRole("button", { name: "Comment" }).click();
  await expect(panel.getByText("QA comment: seen again today")).toBeVisible();

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
  await page.getByRole("button", { name: /^Category/ }).first().click(); // toolbar filter (header sort button comes later)
  await page.getByRole("menuitemcheckbox", { name: "Bug" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/type=bug/);
  await page.reload();
  await expect(page.getByText(/^\d+ of \d+ tasks/)).toBeVisible(); // the total varies with earlier flows
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/type=bug/);
});

test("date filter: pick which date and a range, in the grid (kept in the URL) and on the dashboard", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa2@example.com");
  const footer = page.getByText(/^\d+ (of \d+ )?tasks · Arrow keys/);
  await expect(row(page, "TSK-9")).toBeVisible(); // grid loaded (the footer says "0 tasks" while loading)
  const total = Number((await footer.textContent())!.match(/^(\d+)/)![1]);

  await page.getByRole("button", { name: "Filter by date" }).click();
  await expect(page.getByRole("radio", { name: "Due date" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("From", { exact: true }).fill("2000-01-01");
  await page.getByLabel("To", { exact: true }).fill("2100-12-31");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/date=due&from=2000-01-01&to=2100-12-31/);
  // only tasks that have a due date are left (the seed gives every 4th task one)
  await expect(footer).toHaveText(new RegExp(`^\\d+ of ${total} tasks`));
  const shown = Number((await footer.textContent())!.match(/^(\d+)/)![1]);
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(total);

  // switching to Created keeps the range and applies it to the other date
  await page.getByRole("button", { name: /Date filter: Due date/ }).click();
  await page.getByRole("radio", { name: "Created" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/date=created/);
  await expect(footer).toHaveText(new RegExp(`^${total} tasks`)); // every task has a created date, so nothing is hidden

  await page.reload();
  await expect(page.getByRole("button", { name: /Date filter: Created/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear date filter" }).click();
  await expect(page).not.toHaveURL(/date=/);

  // dashboard
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Filter by date" }).click();
  await expect(page.getByRole("radio", { name: "Created" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Date filter: Created: Last 7 days" })).toBeVisible();
  await expect(page.getByText("Release progress")).toBeVisible();
});

test("dashboard renders live metrics", async ({ page }) => {
  await login(page, "dev2@example.com");
  await page.goto("/dashboard");
  await expect(page.getByText("Completion", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Workload by person")).toBeVisible();
  await expect(page.getByText("Tasks by status")).toBeVisible();
});

test("dashboard: bugs / improvements / tasks breakdown, weekly trend and category filter", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "qa1@example.com");
  await page.goto("/dashboard");
  const card = page.getByText("Bugs, improvements and tasks in detail").locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(card.getByRole("tab", { name: /Bugs/ })).toHaveAttribute("aria-selected", "true");
  await expect(card.getByText("By App Type")).toBeVisible();
  await expect(card.getByText("Oldest remaining bugs")).toBeVisible();
  await expect(card.getByLabel("Bugs by stage")).toBeVisible();

  await card.getByRole("tab", { name: /Improvements/ }).click();
  await expect(card.getByText("Oldest remaining improvements")).toBeVisible();
  await card.getByRole("button", { name: /Show weekly trend/ }).click();
  await expect(card.getByText(/Last 8 weeks, this release: \d+ reported, \d+ completed/)).toBeVisible({ timeout: 30_000 });
  await card.screenshot({ path: "test-results/dashboard-breakdown.png" });

  // category filter narrows the whole dashboard to one category
  await page.getByLabel("Filter dashboard by category").click();
  await page.getByRole("option", { name: "Bug", exact: true }).click();
  await expect(page.getByText("Bugs in detail")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Improvements/ })).toHaveCount(0);
});

test("dashboard: detailed progress card, and admin exports a date-range Excel report", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "admin@example.com");
  await page.goto("/dashboard");
  await expect(page.getByText("Release progress")).toBeVisible();
  await expect(page.getByLabel("Progress legend")).toContainText("Fixed (to test)");
  await expect(page.getByLabel("Progress legend")).toContainText("Testing");
  await expect(page.getByText(/Release time: day \d+ of 14/)).toBeVisible();
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
  expect(download.suggestedFilename()).toMatch(/^Release-report_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.xlsx$/);

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
  await expect(page.getByText("Release progress")).toBeVisible();
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

test("starting a second release while one is active is blocked", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.goto("/releases/s15");
  await page.getByRole("button", { name: "Start release" }).click();
  await page.getByRole("button", { name: "Start release" }).last().click();
  await expect(page.getByText(/already active/)).toBeVisible();
});

test("close release: every unfinished task goes to the next release or the Backlog; report", async ({ page }) => {
  await login(page, "qa1@example.com");
  await page.getByRole("button", { name: "Close release" }).click();
  const dialog = page.getByRole("dialog", { name: "Close Release 14" });
  await expect(dialog).toBeVisible();
  // Ready to Release tasks can't be sent to the Backlog
  await expect(dialog.getByRole("radio", { name: /: Backlog$/ }).and(dialog.locator("[disabled]")).first()).toBeVisible();
  // send TSK-10 to the Backlog, everything else to the next release
  await dialog.getByRole("radio", { name: "TSK-10: Backlog" }).click();
  await expect(dialog.getByText(/\d+ to next release · 1 to Backlog/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close release" }).click();
  await expect(page.getByText(/finished, \d+ carried to Release 15, 1 moved to the Backlog/)).toBeVisible({ timeout: 30_000 });

  // closed sprint is read-only and has a report
  await expect(page.getByRole("link", { name: "View report" })).toBeVisible();
  await expect(page.getByLabel("Quick add task")).toHaveCount(0);
  await page.getByRole("link", { name: "View report" }).click();
  await page.waitForURL(/\/report/);
  await expect(page.getByText("Release 14: Release report")).toBeVisible({ timeout: 120_000 }); // first visit compiles the route in dev
  await expect(page.getByText(/Moved to the Backlog \(1\)/)).toBeVisible();
  await expect(page.getByText(/Left incomplete/)).toHaveCount(0);

  // carried tasks keep their key in the next release; TSK-10 waits in the Backlog
  await page.goto("/releases/s15");
  await expect(row(page, "TSK-9")).toBeVisible();
  await expect(row(page, "TSK-10")).toHaveCount(0);
  await page.goto("/backlog");
  await expect(row(page, "TSK-10")).toBeVisible({ timeout: 60_000 });
});
