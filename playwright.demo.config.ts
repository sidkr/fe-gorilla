import { defineConfig, devices } from "@playwright/test";

// Dedicated config for the homepage demo-capture harness (tests/demo/). Kept
// separate from playwright.config.ts so `npm test` / `npm run e2e` never run the
// capture, and the capture never inherits the e2e suite's settings. Reuses the
// already-running dev stack (web :3001 → Parse :8090). Retina scale for crisp
// frames; failure screenshots off (the frames ARE the output).
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3001";

export default defineConfig({
  testDir: "./tests/demo",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    deviceScaleFactor: 2,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
