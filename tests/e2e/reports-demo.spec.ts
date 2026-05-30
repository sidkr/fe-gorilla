// Secondary E2E — Reports demo dismiss + persistence (docs/testing/e2e.md §4).
//
// A fresh org has sent nothing, so /app/reports drops into DEMO mode: a sample-
// data onboarding card over the four widgets. This spec proves:
//   1. demo mode renders for a fresh org;
//   2. "Dismiss sample data" unmounts the onboarding + flips the localStorage
//      flag;
//   3. the dismissal survives a reload (no demo flash on first paint).
//
// The §4 "auto-vanish after a real send" half needs a seeded sent campaign with
// counters; the golden-path spec already drives a real send through the editor,
// so this file stays focused on the dismiss/persist behavior that's reachable
// from a clean zero-state.

import { test, expect } from "../setup/playwrightFixtures";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test("reports demo mode renders, dismisses, and stays dismissed across reload", async ({
  page,
  orgUser,
}) => {
  // orgUser is freshly provisioned with no sends → reports is in demo mode.
  void orgUser;

  await page.goto("/app/reports");
  await expect(page).toHaveURL(/\/app\/reports/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  // ── Demo mode: the sample-data onboarding card is present. ─────────────────
  const onboarding = page.getByRole("region", { name: /Reports tutorial/i });
  await expect(onboarding).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/This is a preview of your Reports/i),
  ).toBeVisible();

  // ── Dismiss. ──────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: /Dismiss sample data/i }).click();

  // Onboarding unmounts.
  await expect(onboarding).toBeHidden({ timeout: 10_000 });
  // The dismiss flag is persisted in localStorage.
  await expect
    .poll(
      () => page.evaluate(() => window.localStorage.getItem("reports_demo_dismissed")),
      { timeout: 10_000 },
    )
    .toBe("1");

  // ── Persistence: reload → demo stays gone on first paint. ──────────────────
  await page.reload();
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  await expect(onboarding).toBeHidden({ timeout: 10_000 });
});
