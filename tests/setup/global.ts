// Global vitest setup. Loaded once per test file (per forked worker).
// Keep this lean — heavy setup (mongo, parse server) belongs in per-file
// beforeAll hooks so files that don't need it don't pay the cost.

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
