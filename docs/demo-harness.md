# Homepage live-demo harness

The homepage (`/`, prerendered marketing) shows a **live, video-like product tour**
of the authed app. It is NOT a recorded video — it is **real screenshots of the
running app plus an animation timeline**, played back by a marketing component.

```
scripts/demo/seed.mjs        seed a rich, deterministic demo org (audiences, contacts,
                             designed + "sent" campaigns w/ realistic counters, a
                             segment, an installed automation). Writes .seed-context.json.
tests/demo/tour.config.ts    AUTHORED scene list: route, caption, which selectors to
                             spotlight, cursor targets. The narrative.
tests/demo/capture.spec.ts   Playwright (via playwright.demo.config.ts): logs in as the
                             seed user, walks each scene, screenshots → public/demo/frames/
                             NN-id.jpg, resolves the authored selectors → pixel rects,
                             writes public/demo/manifest.json.
tests/demo/verify-home.spec.ts  smoke test: the homepage mounts the player + loads the manifest.
components/marketing/DemoPlayer.vue   reads manifest.json, plays it back (cursor,
                             spotlight, captions, Ken Burns, chapter rail, autoplay-on-scroll,
                             reduced-motion fallback). Wired into pages/index.vue (#demo).
```

## Why this pattern

- **Fidelity** — frames are the real app, so the demo can never lie about the product.
- **Prerender-safe & light** — `/` is static HTML; WebP frames + a small client player
  beat a multi-MB MP4 with blurry text and no a11y.
- **Crisp / accessible / SEO** — captions are real DOM text; honors `prefers-reduced-motion`.
- **Maintainable** — `npm run demo:capture` regenerates everything from a fixed seed.

## Regenerate

```bash
npm run dev                # stack must be up (Parse :8090, web :3001)
npm run demo:capture       # seed → capture → writes public/demo/{frames,manifest.json}
```

`demo:capture` = `node scripts/demo/seed.mjs && playwright test -c playwright.demo.config.ts`
(the dedicated config keeps capture out of the `npm test` / `npm run e2e` suites). Frames +
manifest are committed so the prerendered homepage ships them without a build-time Parse
dependency.

## manifest.json schema (the harness ⇄ player contract)

```jsonc
{
  "version": 1,
  "viewport": { "width": 1440, "height": 900, "scale": 2 },   // capture viewport (CSS px) + DPR
  "generatedAt": "2026-05-30T…Z",
  "chapters": [ { "id": "audience", "label": "Build your audience" }, … ],
  "scenes": [
    {
      "id": "dashboard",
      "chapter": "overview",
      "title": "Your command center",
      "caption": "Every campaign, audience, and dollar of revenue — one view.",
      "image": "/demo/frames/01-dashboard.jpg",
      "w": 1440, "h": 900,            // intrinsic CSS-px size of the frame
      "hold": 3400,                   // ms the scene is on screen
      "kenburns": { "scaleFrom": 1.0, "scaleTo": 1.06, "panTo": [-40, -24] },  // optional
      "hotspots": [                   // spotlight rings (pixel rects in CSS px)
        { "x": 32, "y": 120, "w": 372, "h": 88, "label": "Live KPIs" }
      ],
      "cursor": [                     // optional scripted pointer path
        { "x": 196, "y": 164, "t": 500, "click": true }
      ]
    }
  ]
}
```

- `hotspots[].label` is optional; when present the player draws a small caption tag by the ring.
- `cursor[].t` is ms-from-scene-start; `click:true` triggers a ripple.
- All coordinates are in the manifest `viewport` CSS-px space; the player scales them to the
  rendered frame size. Capture fills `image/w/h/hotspots`; everything else comes from
  `tour.config.mjs`.
