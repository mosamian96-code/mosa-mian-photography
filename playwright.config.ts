import { defineConfig, devices } from "@playwright/test";

/** Browser tests against a running app + worker (see .github/workflows/ci.yml for how
 * CI provides them, and e2e/seed.ts for the data they expect). */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
