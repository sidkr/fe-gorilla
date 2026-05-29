import { defineConfig, devices } from "@playwright/test";

// Playwright config. E2E specs live in tests/e2e/.
//
// `webServer` boots `npm run dev` (Express + Worker + Nuxt) once per run and
// reuses if already running locally. CI gets a fresh boot. The first call
// takes ~30s on this stack — we give it 120s headroom.
//
// Single worker on purpose: the dev MongoDB is shared, so parallel specs
// would step on each other's audiences/campaigns. When we move to a
// throwaway Mongo per spec we can crank up workers.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
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
