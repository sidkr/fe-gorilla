// Secondary E2E — campaign list row-action gating (docs/testing/e2e.md §3).
//
// The campaigns list mirrors the server status-guard matrix in the row kebab so
// a forbidden op can't even be initiated. The full status matrix (sent/sending/
// scheduled) needs cloud staging; what's reachable purely through the UI from a
// fresh org is the DRAFT row, which must expose the complete action set:
//   Edit · Rename · Duplicate · Archive · Delete.
//
// We create a draft by hitting /app/campaigns/new (which provisions a draft
// Campaign and redirects into the editor), then return to the list and inspect
// the kebab. This proves §3 row 2 ("draft → all actions present") plus the
// rename inline-validation guard (row 5: blank name is rejected client-side).

import { test, expect } from "../setup/playwrightFixtures";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test("draft campaign row exposes the full action menu and guards rename", async ({
  page,
  orgUser,
}) => {
  void orgUser;

  // ── Create a draft via the bootstrap route (redirects into the editor). ────
  await page.goto("/app/campaigns/new");
  await expect(page).toHaveURL(/\/app\/campaigns\/[^/]+\/edit/, { timeout: 25_000 });
  // Editor mounted → the draft exists server-side.
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible({
    timeout: 25_000,
  });

  // ── Back to the campaigns list; the draft row renders. ─────────────────────
  await page.goto("/app/campaigns");
  await expect(page.getByRole("heading", { name: "Campaigns", level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  // The draft is named "Untitled campaign" by the bootstrap route.
  const draftRow = page.locator(".ct-body", { hasText: "Untitled campaign" }).first();
  await expect(draftRow).toBeVisible({ timeout: 15_000 });
  // Status pill confirms it's a draft.
  await expect(draftRow.getByText(/draft/i)).toBeVisible();

  // ── Open the kebab → the full draft action set is present. ──────────────────
  await draftRow.getByRole("button", { name: /Actions for/i }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible({ timeout: 10_000 });

  for (const action of ["Edit", "Rename", "Duplicate", "Archive", "Delete"]) {
    await expect(
      menu.getByRole("menuitem", { name: action, exact: true }),
    ).toBeVisible();
  }

  // ── Rename guard: blank name is rejected inline with no cloud call. ────────
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const renameModal = page.getByRole("dialog");
  await expect(renameModal.getByText(/Rename campaign/i)).toBeVisible({ timeout: 10_000 });

  // Clear the field and confirm → inline "Name can't be empty." (no navigation).
  await renameModal.getByPlaceholder("Campaign name").fill("");
  await renameModal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Name can't be empty\./i)).toBeVisible({ timeout: 10_000 });

  // A valid rename succeeds + updates the row optimistically.
  const renamed = `Renamed ${Date.now().toString(36)}`;
  await renameModal.getByPlaceholder("Campaign name").fill(renamed);
  await renameModal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(renameModal).toBeHidden({ timeout: 10_000 });
  await expect(page.locator(".ct-body", { hasText: renamed }).first()).toBeVisible({
    timeout: 15_000,
  });
});
