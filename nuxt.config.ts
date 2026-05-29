// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: true },

  modules: ["@pinia/nuxt"],

  // The `server/` directory is the standalone Express + Parse backend (run as
  // its own `node ./server/index.js` process), NOT Nitro server routes. Without
  // this, Nitro auto-scans `server/routes/*.js` and registers them as its own
  // handlers — they export `{ mount }` (not an event handler), so the matched
  // route (e.g. `/` ← server/routes/index.js) 500s with "Invalid lazy handler
  // result". Ignoring the tree keeps Nitro out of the backend entirely.
  ignore: ["server/**"],

  css: ["~/assets/css/tokens.css"],

  // Auto-import components by directory. Subdirectory prefixes self-document
  // which side a component belongs to:
  //   components/shared/Button.vue       → <Button />
  //   components/marketing/Hero.vue      → <MarketingHero />
  //   components/app/Sidebar.vue         → <AppSidebar />
  // The shared/ directory is unprefixed because primitives don't care which
  // side they're rendered on; the prefix would just be noise.
  components: [
    { path: "~/components/shared",    pathPrefix: false },
    { path: "~/components/marketing", prefix: "Marketing" },
    { path: "~/components/app",       prefix: "App" },
  ],

  app: {
    head: {
      htmlAttrs: { lang: "en" },
      titleTemplate: (titleChunk) =>
        titleChunk ? `${titleChunk} · Fe-Mail Gorilla` : "Fe-Mail Gorilla — Email that hits like iron.",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
      ],
    },
  },

  runtimeConfig: {
    public: {
      parseAppId: process.env.NUXT_PUBLIC_PARSE_APP_ID || "gorilla",
      apiUrl:     process.env.NUXT_PUBLIC_API_URL     || "/api",
    },
  },

  // Per-route render mode.
  //
  // Marketing pages live at top-level paths and prerender to static HTML at
  // build time for best SEO + speed.
  //
  // The authed product lives entirely under /app/* and is CSR (ssr:false).
  // Parse session lives in localStorage which is browser-only, so SSR'ing
  // these pages would either fail or render an empty shell.
  //
  // One routeRule covers the whole boundary: every new authed page lands
  // under /app/* and inherits CSR + the noindex meta on the layout.
  // Marketing pages are prerendered for SEO via `nitro.prerender.routes`
  // (below) rather than per-route `prerender: true` rules — equivalent static
  // output at build, and it keeps the dev SSR path simple. (The historical
  // `/` 500 was NOT a prerender issue — it was Nitro scanning the Express
  // `server/` dir; see the `ignore` option above.)
  routeRules: {
    "/app":       { ssr: false },
    "/app/**":    { ssr: false },

    // Proxy /api/* to the Express+Parse server. Works in both dev and prod via
    // Nitro. Port is env-driven (PARSE_PORT) so the API can move off :8080 when
    // it's taken; defaults to 8080. In dev, Parse is started by the concurrent
    // `node ./server/index.js`; in prod, run that process separately.
    "/api/**":    { proxy: `http://localhost:${process.env.PARSE_PORT || 8080}/api/**` },

    // Tracking + unsubscribe endpoints live on the Express server (open pixel
    // /t/o, click /t/c, unsubscribe /u). Proxy them so the links embedded in
    // sent emails (PUBLIC_BASE_URL = the public origin) resolve through the
    // same origin — in dev via :3001, in prod/tunnel via the public host.
    "/t/**":      { proxy: `http://localhost:${process.env.PARSE_PORT || 8080}/t/**` },
    "/u/**":      { proxy: `http://localhost:${process.env.PARSE_PORT || 8080}/u/**` },
  },

  // Marketing pages prerendered to static HTML at build time (SEO + speed),
  // replacing the per-route `prerender: true` rules (see routeRules note above).
  nitro: {
    prerender: {
      routes: ["/", "/login", "/signup"],
    },
  },

  vite: {
    css: {
      preprocessorOptions: {
        scss: {},
      },
    },
    // WSL2 fix: inotify drops `add` events under burst load (subagents writing
    // multiple new .vue files in quick succession), so Nuxt's auto-import
    // registry never learns about the new components and the browser silently
    // fails to resolve <AppFoo />. Polling is more CPU but reliable.
    // Remove this if/when this project moves off WSL2.
    server: {
      // Vite 7 blocks requests from unknown hosts by default; the cloudflared
      // quick tunnel serves a random *.trycloudflare.com origin, so allow any
      // host in dev. (Dev-only; prod is prerendered + the Express server.)
      allowedHosts: true,
      // When served through the tunnel (NUXT_TUNNEL_HMR=1), the HMR websocket
      // must reconnect over the tunnel's HTTPS/443, not the local dev port — so
      // live updates reach the public URL. Unset → Vite default, so plain
      // localhost:3001 HMR is unaffected on normal `npm run dev`.
      hmr: process.env.NUXT_TUNNEL_HMR ? { protocol: "wss", clientPort: 443 } : true,
      watch: {
        usePolling: true,
        interval: 500,
      },
    },
  },
});
