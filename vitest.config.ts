import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// Default environment is node (cloud functions, worker jobs, SES adapter,
// pure logic). Component tests under tests/components/** opt into happy-dom
// by declaring `// @vitest-environment happy-dom` at the top of the file.
//
// Each test file runs in its own forked process so Parse SDK + Agenda
// singletons reset between files. Don't switch to `pool: 'threads'` — Parse
// SDK isn't thread-safe.
// @vitejs/plugin-vue lets real .vue SFCs compile in tests; the resolve.alias
// maps Nuxt's `~`/`@` root aliases so SFCs importing `~/composables/...`
// resolve. The `test` block is unchanged.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "~": root,
      "@": root,
    },
  },
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
