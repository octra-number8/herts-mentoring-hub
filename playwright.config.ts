import { defineConfig, devices } from "@playwright/test";

// Each run gets its own output folder: several suites may run at once, and
// Playwright clears its output folder at the start of a run.
process.env.PW_RUN_ID ??= String(Date.now());

export default defineConfig({
  testDir: "./e2e",
  outputDir: `test-results/run-${process.env.PW_RUN_ID}`,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["json", { outputFile: "playwright-report/results.json" }]] : "list",
  timeout: 60_000,
  use: { baseURL: process.env.APP_URL ?? "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: { command: process.env.CI ? "npm run start" : "npm run dev", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 180_000 },
});
