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
  // Hide the dev-only Nuxt DevTools button so the preview shot is clean.
  await page.addStyleTag({ content: "#nuxt-devtools-anchor,.nuxt-devtools-frame,[data-v-inspector],#__nuxt-devtools__{display:none!important}" });
  const section = page.locator("#demo");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { name: /ninety seconds/i })).toBeVisible();

  await manifestResp; // the player fetched the manifest
  // Device chrome + frame + spotlight + annotation coachmark + chapter rail + rail.
  await expect(section.locator(".demo-device")).toBeVisible();
  await expect(section.locator(".demo-shot").first()).toBeVisible();
  await expect(section.locator(".demo-spot")).toBeVisible();
  await expect(section.locator(".demo-anno-title")).toBeVisible();
  await expect(section.locator(".demo-chip").first()).toBeVisible();
  await expect(section.locator(".demo-seg")).toHaveCount(9);

  await page.waitForTimeout(1200);
  await section.screenshot({ path: path.join(ROOT, "test-results/home-preview.jpg"), type: "jpeg", quality: 90 });
});
