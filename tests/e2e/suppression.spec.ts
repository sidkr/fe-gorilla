// Suppression management settings (docs/testing/e2e.md §6.5).
//
// Surfaces under test:
//   pages/app/settings/suppression.vue        — list / search / add modal / remove
//   server/cloud/suppression.js               — listSuppressions / addSuppressions / removeSuppression
//   server/lib/suppression.js                 — addSuppression upsert + reason ranking
//
// What the suppression UI supports today (from reading the page + cloud fns):
//   • Empty state when the org has no rows.
//   • Manual add via a modal (paste/CSV textarea) → reason is hard-coded "manual".
//     A success toast reports "Added N, skipped M already-suppressed."
//   • Debounced search box that filters by `contains(email)` (org-scoped).
//   • Per-row "Remove" link gated behind a native window.confirm(), which writes a
//     SuppressionAuditLog row then destroys the Suppression.
//
// The irrevocable rule (hard_bounce/complaint must NOT be un-suppressible) is now
// enforced on the management surface: removeSuppression rejects those reasons with
// OPERATION_FORBIDDEN, and the page renders a "🔒 Permanent" lock instead of a
// Remove link for them. The reason-ranking guard in server/lib (which prevents a
// softer reason from DOWNGRADING a harder one) is a separate, complementary layer.
//
// Seeding: a hard_bounce row can't be produced through this UI (manual add is
// always reason "manual"), so we insert one via a master-key REST write into the
// per-tenant Suppression class, stamping organization + the org members-role ACL
// exactly the way the cloud layer would.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type APIRequestContext, type OrgUser } from "../setup/playwrightFixtures";

// ESM context (repo is "type": "module") — __dirname is undefined; derive it.
const HERE = path.dirname(fileURLToPath(import.meta.url));

test.describe.configure({ mode: "serial", timeout: 120_000 });

// RESOLVED 2026-05-30: pages/app/automations/[id].vue compiles again (the nested
// `{{ "{{…}}" }}` mustache that threw "Unterminated string constant" and poisoned
// the whole /app/* client bundle is fixed via v-pre, commit b19cb6f). The app
// shell boots, so the browser bodies below render and this guard is lifted.
const APP_SHELL_BROKEN = false;
test.skip(
  APP_SHELL_BROKEN,
  "Blocked: pages/app/automations/[id].vue fails to compile, so no /app/* page renders (see header).",
);

const APP_ID = process.env.PARSE_APP_ID || "gorilla";

function masterKey(): string {
  if (process.env.PARSE_MASTER_KEY) return process.env.PARSE_MASTER_KEY;
  const txt = fs.readFileSync(path.resolve(HERE, "../../server/local.env"), "utf8");
  const m = txt.match(/^PARSE_MASTER_KEY=(.+)$/m);
  if (!m) throw new Error("PARSE_MASTER_KEY not found in env or server/local.env");
  return m[1].trim();
}

// Master-key REST insert of a Suppression row for a given org. Mirrors what the
// pipeline would write (server/lib/suppression.js): lowercased email, reason,
// firstSuppressedAt/lastEventAt, eventCount, and the org members-role ACL so the
// authed user can read it back through the org-scoped query.
async function seedSuppression(
  request: APIRequestContext,
  org: OrgUser,
  email: string,
  reason: string,
): Promise<string> {
  const role = `role:org_${org.orgId}_members`;
  const now = new Date().toISOString();
  const res = await request.post(`/api/classes/Suppression`, {
    headers: {
      "X-Parse-Application-Id": APP_ID,
      "X-Parse-Master-Key": masterKey(),
      "Content-Type": "application/json",
    },
    data: {
      email: email.toLowerCase(),
      reason,
      organization: { __type: "Pointer", className: "Organization", objectId: org.orgId },
      firstSuppressedAt: { __type: "Date", iso: now },
      lastEventAt: { __type: "Date", iso: now },
      eventCount: 1,
      ACL: { [role]: { read: true, write: true } },
    },
  });
  expect(res.ok(), `seed Suppression failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()).objectId as string;
}

// A row in the suppression table addressed by its email cell.
function rowFor(page: import("@playwright/test").Page, email: string) {
  return page.locator("tbody tr", { hasText: email }).first();
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — a fresh org has suppressed nothing.
// ─────────────────────────────────────────────────────────────────────────────
test("fresh org sees the empty suppression state", async ({ page, orgUser }) => {
  void orgUser;
  await page.goto("/app/settings/suppression");
  await expect(page).toHaveURL(/\/app\/settings\/suppression/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByRole("heading", { name: /No suppressed addresses/i })).toBeVisible({
    timeout: 15_000,
  });
  // No data table while empty.
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Add → list → search → remove, the manual lifecycle.
// ─────────────────────────────────────────────────────────────────────────────
test("manually add an address, find it via search, then remove it", async ({ page, orgUser }) => {
  void orgUser;
  const stamp = Date.now().toString(36);
  const target = `keep_${stamp}@example.com`;
  const noise = `other_${stamp}@example.org`;

  await page.goto("/app/settings/suppression");
  await expect(page.getByRole("heading", { name: /No suppressed addresses/i })).toBeVisible({
    timeout: 15_000,
  });

  // ── Add two addresses through the modal (reason is hard-coded "manual"). ────
  await page.getByRole("button", { name: "Add addresses" }).click();
  const addModal = page.getByRole("dialog");
  await expect(addModal.getByText(/Add suppressed addresses/i)).toBeVisible({ timeout: 10_000 });
  await addModal.getByRole("textbox").fill(`${target}, ${noise}`);
  await addModal.getByRole("button", { name: "Add", exact: true }).click();

  // Modal closes; both rows land, newest-first, with a "manual" reason pill.
  await expect(addModal).toBeHidden({ timeout: 15_000 });
  await expect(rowFor(page, target)).toBeVisible({ timeout: 15_000 });
  await expect(rowFor(page, noise)).toBeVisible();
  await expect(rowFor(page, target).getByText("manual", { exact: true })).toBeVisible();

  // ── Search filters by email contains. ───────────────────────────────────────
  await page.getByRole("searchbox", { name: /Search suppressions/i }).fill(`keep_${stamp}`);
  await expect(rowFor(page, target)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(rowFor(page, noise)).toBeHidden();

  // Clear the search → both rows return.
  await page.getByRole("searchbox", { name: /Search suppressions/i }).fill("");
  await expect(rowFor(page, noise)).toBeVisible({ timeout: 15_000 });

  // ── Remove the target through the confirm gate. ─────────────────────────────
  // The page uses a native window.confirm(); accept it.
  page.once("dialog", (d) => d.accept());
  await rowFor(page, target).getByRole("button", { name: "Remove" }).click();

  // Row is gone; the other manual entry survives.
  await expect(rowFor(page, target)).toBeHidden({ timeout: 15_000 });
  await expect(rowFor(page, noise)).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// A manual entry can be removed, but a hard_bounce / complaint entry must not be
// un-suppressible (the irrevocable rule). We seed a hard_bounce row via master
// key (the manual-add UI can't produce one), then assert the management surface
// blocks its removal.
//
// ENFORCED: the page renders a "🔒 Permanent" lock instead of a Remove link for
// hard_bounce/complaint rows, and removeSuppression rejects those reasons with
// OPERATION_FORBIDDEN even if the call is forced. Both legs are asserted below.
// ─────────────────────────────────────────────────────────────────────────────
test("a hard_bounce entry surfaces a (danger) reason pill in the list", async ({
  page,
  orgUser,
  request,
}) => {
  const hardEmail = `bounced_${Date.now().toString(36)}@example.com`;
  await seedSuppression(request, orgUser, hardEmail, "hard_bounce");

  await page.goto("/app/settings/suppression");
  await expect(rowFor(page, hardEmail)).toBeVisible({ timeout: 15_000 });
  // The reason renders as a "hard_bounce" pill (danger tone in the page).
  await expect(rowFor(page, hardEmail).getByText("hard_bounce", { exact: true })).toBeVisible();
});

test("a hard_bounce / complaint entry is NOT removable (irrevocable rule)", async ({
  page,
  orgUser,
  request,
}) => {
  const hardEmail = `bounced_${Date.now().toString(36)}@example.com`;
  const supId = await seedSuppression(request, orgUser, hardEmail, "hard_bounce");

  await page.goto("/app/settings/suppression");
  const row = rowFor(page, hardEmail);
  await expect(row).toBeVisible({ timeout: 15_000 });

  // UI: no Remove affordance — a "Permanent" lock renders in its place.
  await expect(row.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(row.getByText(/Permanent/i)).toBeVisible();

  // Defense-in-depth: forcing the cloud call is rejected (OPERATION_FORBIDDEN),
  // so the row survives. Call removeSuppression directly as the org user.
  const res = await request.post(`/api/functions/removeSuppression`, {
    headers: {
      "X-Parse-Application-Id": APP_ID,
      "X-Parse-Session-Token": orgUser.sessionToken,
      "Content-Type": "application/json",
    },
    data: { id: supId },
  });
  expect(res.ok(), "removeSuppression should reject an irrevocable reason").toBeFalsy();
  const body = await res.json();
  expect(body.code, `expected OPERATION_FORBIDDEN (119), got ${JSON.stringify(body)}`).toBe(119);

  // The row is still present after a reload.
  await page.reload();
  await expect(rowFor(page, hardEmail)).toBeVisible({ timeout: 15_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tenant isolation — a second org never sees the first org's suppressions.
// ─────────────────────────────────────────────────────────────────────────────
test("a second org sees an empty suppression list (tenant isolation)", async ({
  page,
  orgUser,
  request,
}) => {
  // Seed a suppression for org A (the fixture's org).
  const leak = `leak_${Date.now().toString(36)}@example.com`;
  await seedSuppression(request, orgUser, leak, "manual");

  // Sanity: org A can see its own row.
  await page.goto("/app/settings/suppression");
  await expect(rowFor(page, leak)).toBeVisible({ timeout: 15_000 });

  // ── Provision a SECOND org via the same cloud fn and reseat the session. ────
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const res = await request.post(`/api/functions/signUpWithOrg`, {
    headers: { "X-Parse-Application-Id": APP_ID, "Content-Type": "application/json" },
    data: {
      username: `orgB_${stamp}`,
      password: "test-password-1234",
      email: `orgB_${stamp}@test.gorilla.local`,
      name: `Test B ${stamp}`,
      company: `Co B ${stamp}`,
    },
  });
  expect(res.ok(), `org B signup failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const orgB = (await res.json()).result as { sessionToken: string; userId: string };

  // Swap org B's session into localStorage and reload so the SDK rehydrates.
  await page.evaluate(
    ({ appId, blob }) => {
      window.localStorage.setItem(`Parse/${appId}/currentUser`, JSON.stringify(blob));
    },
    {
      appId: APP_ID,
      blob: {
        objectId: orgB.userId,
        username: `orgB_${stamp}`,
        sessionToken: orgB.sessionToken,
        className: "_User",
      },
    },
  );

  await page.goto("/app/settings/suppression");
  // Org B is fresh: empty state, and crucially A's seeded row is absent.
  await expect(page.getByRole("heading", { name: /No suppressed addresses/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(rowFor(page, leak)).toBeHidden();

  // Teardown org B (org A's user is torn down by the fixture).
  await request
    .delete(`/api/users/${orgB.userId}`, {
      headers: { "X-Parse-Application-Id": APP_ID, "X-Parse-Master-Key": masterKey() },
    })
    .catch(() => {});
});
