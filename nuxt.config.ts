// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: true },

  modules: ["@pinia/nuxt"],

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
        titleChunk ? `${titleChunk} · Gorilla` : "Gorilla — Email that hits like iron.",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
      link: [
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
  routeRules: {
    "/":          { prerender: true },
    "/signup":    { prerender: true },
    "/login":     { prerender: true },

    "/app":       { ssr: false },
    "/app/**":    { ssr: false },

    // Proxy /api/* to the Express+Parse server on :8080. Works in both dev
    // and prod via Nitro. In dev, Parse is started by the concurrent
    // `node ./server/index.js`; in prod, run that process separately.
    "/api/**":    { proxy: "http://localhost:8080/api/**" },
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
      watch: {
        usePolling: true,
        interval: 500,
      },
    },
  },
});
