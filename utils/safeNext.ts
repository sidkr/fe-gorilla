// Open-redirect guard for post-auth `?next=` redirects.
//
// A safe `next` must be a SAME-SITE app path: a single leading slash, and NOT
// a protocol-relative URL (`//evil.com`) or a backslash-smuggled one
// (`/\evil.com`) that browsers normalize to a cross-origin redirect. Anything
// else — absolute URLs (`https://…`), `javascript:` schemes, empty strings,
// or non-string query values (arrays/objects from repeated `?next=`) — falls
// back to the dashboard.
export function safeNextPath(next: unknown, fallback = "/app/dashboard"): string {
  if (typeof next !== "string") return fallback;
  // Must be an absolute, same-site path.
  if (!next.startsWith("/")) return fallback;
  // Reject protocol-relative ("//host") and backslash-smuggled ("/\host")
  // forms, both of which browsers can resolve off-site.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
