// Unit tests for the CSV-import safe-path guard (server/lib/importPaths.js).
// This is the gate that stops an arbitrary-file-read via a client-supplied path
// (P0 from the launch audit). Pure logic — no Parse/Mongo harness needed.
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { newImportPath, assertSafeImportPath, IMPORT_BASENAME_RE } = require("../../server/lib/importPaths");

const TMP = path.resolve(os.tmpdir());

describe("importPaths safe-path guard", () => {
  it("newImportPath mints a tmpdir path with a 32-hex token name", () => {
    const p = newImportPath();
    expect(path.dirname(p)).toBe(TMP);
    expect(IMPORT_BASENAME_RE.test(path.basename(p))).toBe(true);
  });

  it("newImportPath is unguessable (no collisions across calls)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newImportPath()));
    expect(seen.size).toBe(200);
  });

  it("accepts a freshly minted path and returns it canonicalized", () => {
    const p = newImportPath();
    expect(assertSafeImportPath(p)).toBe(p);
  });

  it("rejects absolute-path traversal to sensitive files", () => {
    for (const bad of [
      "/etc/passwd",
      "/home/sid/workspace/fe-gorilla/server/local.env",
      "/proc/self/environ",
    ]) {
      expect(() => assertSafeImportPath(bad)).toThrow();
    }
  });

  it("rejects ../ traversal even when it lands on a valid-looking name", () => {
    const sneaky = path.join(TMP, "..", "import-" + "a".repeat(32) + ".csv");
    // resolves OUT of the temp dir → must be rejected
    expect(() => assertSafeImportPath(sneaky)).toThrow();
  });

  it("rejects a valid name in a SUBdir of tmp (not directly inside)", () => {
    const sub = path.join(TMP, "evil", "import-" + "b".repeat(32) + ".csv");
    expect(() => assertSafeImportPath(sub)).toThrow();
  });

  it("rejects wrong basenames (extension, prefix, token length/charset)", () => {
    for (const base of [
      "import-" + "c".repeat(32) + ".txt", // wrong ext
      "import-" + "c".repeat(31) + ".csv", // short token
      "import-" + "c".repeat(33) + ".csv", // long token
      "import-" + "G".repeat(32) + ".csv", // non-hex
      "notimport-" + "c".repeat(32) + ".csv", // wrong prefix
      "import-.csv",
    ]) {
      expect(() => assertSafeImportPath(path.join(TMP, base))).toThrow();
    }
  });

  it("rejects empty / non-string input", () => {
    for (const bad of ["", null, undefined, 42, {}]) {
      // @ts-expect-error — exercising bad runtime input
      expect(() => assertSafeImportPath(bad)).toThrow();
    }
  });

  it("uses the caller-provided error factory", () => {
    class DomainError extends Error {}
    expect(() => assertSafeImportPath("/etc/passwd", (m) => new DomainError(m))).toThrow(DomainError);
  });
});
