// Unit tests for the pure open-redirect guard. No DOM, no Nuxt — plain fn.
// (Import via relative path: vitest does not resolve the "~" alias.)
import { describe, expect, it } from "vitest";
import { safeNextPath } from "../../utils/safeNext";

const FALLBACK = "/app/dashboard";

describe("safeNextPath", () => {
  it("passes a normal same-site app path through unchanged", () => {
    expect(safeNextPath("/app/x")).toBe("/app/x");
    expect(safeNextPath("/app/dashboard")).toBe("/app/dashboard");
    expect(safeNextPath("/app/campaigns/123?tab=stats")).toBe("/app/campaigns/123?tab=stats");
  });

  it("rejects absolute off-site URLs", () => {
    expect(safeNextPath("https://evil.com")).toBe(FALLBACK);
    expect(safeNextPath("http://evil.com")).toBe(FALLBACK);
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNextPath("//evil.com")).toBe(FALLBACK);
    expect(safeNextPath("//evil.com/app/dashboard")).toBe(FALLBACK);
  });

  it("rejects backslash-smuggled URLs", () => {
    expect(safeNextPath("/\\evil.com")).toBe(FALLBACK);
  });

  it("rejects javascript: and other schemes", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe(FALLBACK);
    expect(safeNextPath("data:text/html,<script>")).toBe(FALLBACK);
  });

  it("rejects the empty string and non-leading-slash values", () => {
    expect(safeNextPath("")).toBe(FALLBACK);
    expect(safeNextPath("app/dashboard")).toBe(FALLBACK);
  });

  it("rejects non-string query values (arrays/objects/undefined)", () => {
    expect(safeNextPath(["/app/x", "/app/y"])).toBe(FALLBACK);
    expect(safeNextPath({ path: "/app/x" })).toBe(FALLBACK);
    expect(safeNextPath(undefined)).toBe(FALLBACK);
    expect(safeNextPath(null)).toBe(FALLBACK);
  });

  it("honors a custom fallback", () => {
    expect(safeNextPath("https://evil.com", "/login")).toBe("/login");
  });
});
