// Authed smoke test. Proves the `orgUser` fixture produces a working logged-in
// session: visiting /app/dashboard must NOT bounce to /login, and the app
// chrome (sidebar nav) must render.
import { test, expect } from "../setup/playwrightFixtures";

test("orgUser fixture boots an authenticated session on /app/dashboard", async ({
  page,
  orgUser,
}) => {
  expect(orgUser.sessionToken).toBeTruthy();
  expect(orgUser.orgId).toBeTruthy();

  await page.goto("/app/dashboard");

  // The auth-required middleware redirects anonymous users to /login. A working
  // session means we stay under /app/*.
  await expect(page).toHaveURL(/\/app\//);
  await expect(page).not.toHaveURL(/\/login/);

  // App chrome from layouts/app.vue: the primary sidebar with section nav.
  await expect(page.locator('aside[aria-label="Primary"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});
