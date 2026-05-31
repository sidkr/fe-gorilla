// Smoke test for the homepage demo player: the section mounts, the manifest loads,
// the device frame + first frame + caption + chapter rail render. Also captures a
// reference screenshot to test-results/ (gitignored) for eyeballing.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("homepage renders the live demo player", async ({ page }) => {
  const manifestResp = page.waitForResponse((r) => r.url().includes("/demo/manifest.json") && r.ok());
  await page.goto("/");
  const section = page.locator("#demo");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { name: /ninety seconds/i })).toBeVisible();

  await manifestResp; // the player fetched the manifest
  // Device chrome + first frame + caption + chapter rail are present.
  await expect(section.locator(".demo-device")).toBeVisible();
  await expect(section.locator(".demo-shot")).toBeVisible();
  await expect(section.locator(".demo-title")).toBeVisible();
  await expect(section.locator(".demo-chip").first()).toBeVisible();
  await expect(section.locator(".demo-seg")).toHaveCount(9);

  await page.waitForTimeout(800);
  await section.screenshot({ path: path.join(ROOT, "test-results/home-preview.jpg"), type: "jpeg", quality: 90 });
});
