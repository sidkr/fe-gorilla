// Global vitest setup. Loaded once per test file (per forked worker).
// Keep this lean — heavy setup (mongo, parse server) belongs in per-file
// beforeAll hooks so files that don't need it don't pay the cost.

// Hermetic env. The cloud bundle loads server/local.env via dotenv (see
// server/lib/env.js) the moment any module reads an env var, so a developer's
// machine config would otherwise leak into the suite. dotenv does NOT override
// vars already present in process.env, so setting these here BEFORE any cloud
// module loads pins them regardless of local.env.
//   - NODE_ENV=test: standard test marker.
//   - AWS_SES_MODE=mock: the send pipeline MUST resolve the mock SES adapter so
//     it writes MockSentMessage for assertions. A dev with AWS_SES_MODE=smtp or
//     real in local.env (e.g. for the maildev preview) would otherwise break
//     every send test. Per-case overrides (webhook tests flip to "real") still
//     work and restore afterward.
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.AWS_SES_MODE = "mock";

// Silence Parse SDK's "current user" warning when no localStorage is wired.
// Tests that exercise auth set up their own Parse.User mocks.
import { vi } from "vitest";

if (typeof globalThis.localStorage === "undefined") {
  // Some Parse calls touch localStorage even in node tests. Give them a
  // no-op shim so they don't blow up.
  // @ts-expect-error — adding to global
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
}
