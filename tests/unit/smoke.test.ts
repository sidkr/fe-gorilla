import { describe, it, expect } from "vitest";

// Smoke test for the test harness itself. If this fails, the wider suite is
// not going to load either. Keep it dumb on purpose.
describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("has localStorage shim from setup/global", () => {
    expect(typeof globalThis.localStorage).toBe("object");
    expect(globalThis.localStorage.getItem("anything")).toBeNull();
  });
});
