import { defineConfig, devices } from "@playwright/test";

// Playwright config. E2E specs live in tests/e2e/.
//
// baseURL targets the running dev server (Nuxt on :3001, which proxies /api/**
// to Parse). Override with E2E_BASE_URL. The dev server is expected to already
// be running (`npm run dev`); `webServer` reuses it rather than booting a
// second, port-conflicting instance.
//
// Single worker on purpose: the dev MongoDB is shared, so parallel specs
// would step on each other's audiences/campaigns. When we move to a
// throwaway Mongo per spec we can crank up workers.
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3001";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    // Always reuse the already-running dev server; never boot a conflicting one.
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
