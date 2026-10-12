import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the local emulators + dev server.
 * Prereqs (see README "Testing"):
 *   1. npm run emulators      2. npm run seed      3. (optional) npm run dev:emulator, else webServer starts it
 *   4. npm run test:e2e
 * The suite mutates seeded data (it closes the active sprint at the end), so re-seed before re-running.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3001", // emulator-only server (scripts/dev-emulator.ts)
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npm run dev:emulator",
    url: "http://localhost:3001/login",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
