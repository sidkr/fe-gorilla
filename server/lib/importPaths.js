// ─────────────────────────────────────────────────────────────────────────────
// Safe temp-path handling for CSV import. CommonJS.
//
// SECURITY: the import flow uploads a CSV to a server-chosen temp path, then a
// later `startContactImport` cloud call references it and the worker reads it
// off disk. The path therefore crosses the trust boundary (browser → cloud fn →
// worker). If the cloud fn trusted a client-supplied path verbatim, any signed-in
// user could point the worker at `/etc/passwd`, `server/local.env` (master key!),
// another tenant's leftover upload, etc. — an arbitrary-file-read → full
// compromise.
//
// Defense: every import file lives DIRECTLY in the OS temp dir with the exact
// name `import-<32 hex>.csv`. The 32-hex segment is a 128-bit random token
// (unguessable, so it also blocks cross-tenant reads of a leftover file). Any
// path that doesn't resolve to exactly that shape is rejected. The route mints
// paths with newImportPath(); the cloud fn + worker re-validate with
// assertSafeImportPath() before storing/reading.
// ─────────────────────────────────────────────────────────────────────────────

const os = require("os");
const path = require("path");
const crypto = require("crypto");

// import-<32 lowercase hex>.csv — nothing else.
const IMPORT_BASENAME_RE = /^import-[0-9a-f]{32}\.csv$/;

function importDir() {
  // Resolve so the comparison in assertSafeImportPath is canonical (handles
  // symlinks/trailing slashes consistently on the platform).
  return path.resolve(os.tmpdir());
}

// Mint a fresh, safe import path for a new upload.
function newImportPath() {
  const token = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  return path.join(importDir(), `import-${token}.csv`);
}

// Validate a (possibly client-supplied) path and return its canonical form, or
// throw. A valid import path:
//   - resolves to a basename matching IMPORT_BASENAME_RE, and
//   - sits DIRECTLY inside the OS temp dir (no subdirs, no traversal).
// `throwError` (optional) lets callers raise a domain-specific error type; the
// default is a plain Error.
function assertSafeImportPath(input, throwError) {
  const fail = (msg) => {
    if (typeof throwError === "function") return throwError(msg);
    return new Error(msg);
  };

  if (typeof input !== "string" || !input) {
    throw fail("Invalid import file reference.");
  }
  const resolved = path.resolve(input);
  const base = path.basename(resolved);
  if (!IMPORT_BASENAME_RE.test(base)) {
    throw fail("Invalid import file reference.");
  }
  // Must live directly in the temp dir — not a subdir, not elsewhere.
  if (path.dirname(resolved) !== importDir()) {
    throw fail("Invalid import file reference.");
  }
  return resolved;
}

module.exports = { IMPORT_BASENAME_RE, importDir, newImportPath, assertSafeImportPath };
