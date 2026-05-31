// Demo capture harness. Logs in as the seeded demo user (scripts/demo/seed.mjs),
// walks the authored tour (tour.config.ts), screenshots each scene to
// public/demo/frames/NN-id.jpg, resolves the authored spotlight/cursor selectors to
// pixel rects, and writes public/demo/manifest.json — the file the homepage
// DemoPlayer plays back.
//
// Run via the dedicated config (NOT part of the e2e suite):
//   npm run demo:capture        (seed first, then this)
//   npx playwright test -c playwright.demo.config.ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, CHAPTERS, type SeedCtx } from "./tour.config";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const APP_ID = process.env.PARSE_APP_ID || "gorilla";
const VIEWPORT = { width: 1440, height: 900 };
const FRAMES_DIR = path.join(ROOT, "public/demo/frames");
const MANIFEST = path.join(ROOT, "public/demo/manifest.json");

function loadCtx(): SeedCtx & { user: { objectId: string; username: string; sessionToken: string } } {
  const p = path.join(ROOT, "scripts/demo/.seed-context.json");
  if (!fs.existsSync(p)) {
    throw new Error("No scripts/demo/.seed-context.json — run `node scripts/demo/seed.mjs` first.");
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Hide dev-only chrome + freeze animations so frames are clean and deterministic.
const STABILIZE_CSS = `
  #nuxt-devtools-anchor, .nuxt-devtools-frame, [data-v-inspector], #nuxt-devtools-container,
  .nuxt-devtools__anchor, #__nuxt-devtools__ { display: none !important; }
  *, *::before, *::after { transition: none !important; animation: none !important;
    scroll-behavior: auto !important; caret-color: transparent !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`;

test.describe.configure({ mode: "serial", timeout: 300_000 });

test("capture the homepage product tour", async ({ page }) => {
  const ctx = loadCtx();
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  page.on("pageerror", (e) => console.log(`  ! pageerror: ${e.message}`));

  await page.setViewportSize(VIEWPORT);

  // Seed the Parse session into localStorage (same shape as the e2e fixture) so the
  // app boots already logged-in, then keep the stabilizer CSS on every navigation.
  await page.goto("/");
  await page.evaluate(
    ({ appId, blob }) => window.localStorage.setItem(`Parse/${appId}/currentUser`, JSON.stringify(blob)),
    { appId: APP_ID, blob: { objectId: ctx.user.objectId, username: ctx.user.username, name: (ctx.user as any).name, sessionToken: ctx.user.sessionToken, className: "_User" } },
  );
  await page.addStyleTag({ content: STABILIZE_CSS });

  const scenesOut: any[] = [];

  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    const num = String(i + 1).padStart(2, "0");
    const rel = `/demo/frames/${num}-${scene.id}.jpg`;
    const abs = path.join(ROOT, "public", rel.replace(/^\//, ""));

    await page.goto(scene.path(ctx));
    // Page is loaded once the scene's `ready` selector is visible.
    const found = await page.locator(scene.ready).first()
      .waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false);
    console.log(`  · ${num} ${scene.id}: url=${new URL(page.url()).pathname} ready=${found}`);
    await page.addStyleTag({ content: STABILIZE_CSS }).catch(() => {});
    await page.waitForTimeout(900); // let charts/lazy content settle

    // Resolve spotlight selectors → pixel rects (skip any that aren't present).
    const hotspots: any[] = [];
    for (const s of scene.spotlights || []) {
      const box = await page.locator(s.sel).first().boundingBox({ timeout: 2500 }).catch(() => null);
      if (box && box.width > 4 && box.height > 4) {
        hotspots.push({ x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), label: s.label });
      }
    }

    // Resolve cursor steps → points (selector center, or explicit coords).
    const cursor: any[] = [];
    for (const c of scene.cursor || []) {
      let pt: { x: number; y: number } | null = null;
      if (c.sel) {
        const box = await page.locator(c.sel).first().boundingBox({ timeout: 2500 }).catch(() => null);
        if (box) pt = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
      } else if (c.x != null && c.y != null) {
        pt = { x: c.x, y: c.y };
      }
      if (pt) cursor.push({ ...pt, t: c.t, click: !!c.click });
    }

    await page.screenshot({ path: abs, type: "jpeg", quality: 88, clip: { x: 0, y: 0, ...VIEWPORT } });
    expect(fs.existsSync(abs), `frame ${rel} written`).toBeTruthy();

    scenesOut.push({
      id: scene.id, chapter: scene.chapter, title: scene.title, caption: scene.caption,
      image: rel, w: VIEWPORT.width, h: VIEWPORT.height, hold: scene.hold,
      kenburns: scene.kenburns, hotspots, cursor,
    });
    console.log(`  ✓ ${num} ${scene.id} — ${hotspots.length} hotspot(s), ${cursor.length} cursor step(s)`);
  }

  const manifest = {
    version: 1,
    viewport: { ...VIEWPORT, scale: 2 },
    generatedAt: ctx.user ? new Date(ctx["generatedAt"] || Date.now()).toISOString() : null,
    chapters: CHAPTERS,
    scenes: scenesOut,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`→ wrote ${path.relative(ROOT, MANIFEST)} (${scenesOut.length} scenes)`);
});
