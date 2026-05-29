import { defineConfig } from "vitest/config";

// Default environment is node (cloud functions, worker jobs, SES adapter,
// pure logic). Component tests under tests/components/** opt into happy-dom
// by declaring `// @vitest-environment happy-dom` at the top of the file.
//
// Each test file runs in its own forked process so Parse SDK + Agenda
// singletons reset between files. Don't switch to `pool: 'threads'` — Parse
// SDK isn't thread-safe.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/global.ts"],
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.{js,ts}"],
    exclude: ["tests/e2e/**", "node_modules/**", ".nuxt/**", ".output/**"],
    reporters: ["default"],
  },
});
