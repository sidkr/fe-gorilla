# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
nvm use                # picks up Node 20 via .nvmrc
npm install            # First-time setup
npm run dev            # Express+Parse on :8080 + Nuxt dev on :3000 (concurrently)
npm run build          # Nuxt build → .output/
npm run generate       # Nuxt static generation (prerendered routes → HTML)
npm run preview        # Run the built Nuxt output locally
npm run server         # Production Express/Parse server only (NODE_ENV=production)
npm run start          # Production server via pm2 (name "gorilla")
npm run mocks          # Static mocks server (Node http, port 5050)
```

There is no test suite yet. MongoDB must be running locally at `mongodb://localhost:27017/gorilla` for `npm run dev` to come up.

## Architecture

Gorilla is a Mailchimp-style email marketing platform. **Nuxt 3** for the frontend, **Express + Parse Server** for the backend, **MongoDB** for storage. The product is a hybrid: SEO-critical marketing pages are prerendered to static HTML; the authed app lives entirely under `/app/*` as a client-side SPA.

Refer to `Architecture.md` for system design, data model, and trade-off rationale; `Features.md` for product scope and delivery phases.

### Two-process layout

| Process | Port | Purpose |
|---|---|---|
| Nuxt 3 (Nitro) | 3000 | Frontend dev server; in prod serves prerendered marketing + the SPA shell + proxies `/api/*` to Parse |
| Express + Parse Server | 8080 | REST API at `/api`, LiveQuery on same `httpServer`, master-key access |

In dev, Nitro's `routeRules` proxy `/api/**` → `localhost:8080/api/**`. Same config holds in prod, so the frontend always calls `/api/*` regardless of environment.

### The marketing / app boundary

This is the single most important architectural rule in the codebase:

**Marketing pages live at top-level paths and are prerendered to static HTML. The authed app lives under `/app/*` and is CSR (`ssr: false`).**

```
/                  prerender   → marketing (homepage)
/signup            prerender   → marketing
/login             prerender   → marketing
/pricing, ...      prerender   → marketing (future)

/app               ssr: false  → redirects → /app/dashboard
/app/dashboard     ssr: false  → authed app
/app/campaigns/*   ssr: false  → authed app
/app/audiences/*   ssr: false  → authed app
/app/segments/*    ssr: false  → authed app
/app/reports/*     ssr: false  → authed app
/app/settings/*    ssr: false  → authed app

/api/**            proxy → Parse on :8080
```

The whole `/app/**` group is configured in one place in `nuxt.config.ts` via `routeRules`. New authed pages inherit CSR + the noindex meta automatically by placing them under `pages/app/`. **Never add an authed page outside `pages/app/`.**

Why CSR for `/app/*`: the Parse session token lives in `localStorage`, which doesn't exist server-side. Authed pages depend on the session being readable on first paint, so they boot in the browser.

### Codebase organization mirrors the boundary

Components and composables are split into three buckets so it's obvious at a glance which side a file belongs to:

```
components/
├── shared/        ← primitives used anywhere (Button, BrandMark, Pill).         Auto-imported as <Button />, <BrandMark /> (no prefix — pathPrefix: false in nuxt.config).
├── marketing/     ← marketing-only (Hero, FeatureCard, FinalCTA).               Auto-imported as <MarketingHero />, <MarketingFeatureCard /> (prefix: "Marketing" set explicitly in nuxt.config).
└── app/          ← app-only (Sidebar, KPI, CampaignCard).                       Auto-imported as <AppSidebar />, <AppKPI /> (prefix: "App" set explicitly in nuxt.config).

composables/
├── shared/        ← formatters, useApi-style wrappers
├── marketing/     ← marketing-only (currently empty)
└── app/          ← useCampaigns, useAudiences, useSegments (as we build them)
```

The unprefixed `shared/` and the prefixed `marketing/` + `app/` make every component reference self-documenting. The prefix mapping is configured in `nuxt.config.ts` under `components: [...]` — **the `prefix` option must be set explicitly** (Nuxt does NOT auto-derive a prefix from the directory name). If you add a new directory there, set `prefix` or you'll get unprefixed component names that won't match the convention.

**Discipline:** marketing components MUST NOT import from `components/app/` or `stores/` (which is app-only). App components MAY import from `components/shared/`. Treat the boundary as a one-way wall: shared → marketing/app is fine; the other direction or peer crossing is a smell.

### Middleware enforces the boundary

```
middleware/
├── auth-required.ts   ← used on /app/* via layouts/app.vue. Redirects anonymous → /login?next=...
└── auth-blocked.ts    ← applied to /login and /signup. Redirects authed users → /app/dashboard.
                          Other marketing pages do NOT use this — a logged-in user can still read /pricing etc.
```

Both middlewares short-circuit on `import.meta.server` because the routes they cover are CSR or prerender — the redirect must happen in the browser after the auth store hydrates from Parse.

### Layouts

```
layouts/
├── default.vue    ← (future) marketing chrome. Pages currently ship their own nav/footer inline.
└── app.vue        ← app chrome (top nav, user menu, logout). Applies noindex meta to the entire /app/* surface.
```

A `/app/*` page wires itself in via `definePageMeta({ layout: 'app', middleware: 'auth-required' })`.

### State: Pinia (`stores/`)

Pinia, not Vuex. App-only state — marketing pages don't reach for the store.

- `stores/auth.js` — `useAuthStore()`. State: `user`. Actions: `hydrateFromParse`, `login`, `signup`, `logout`, `sessionExpired`.
- `stores/network.js` — `useNetworkStore()`. Online/offline tracking.

The store is hydrated from Parse on the client immediately after the SDK initializes — see `plugins/parse.client.ts`. Without that hydration, the first navigation guard runs with an empty store even when the user is signed in.

### Parse SDK (`plugins/parse.client.ts`)

Client-only plugin. Reads `runtimeConfig.public.parseAppId` and `apiUrl` from `nuxt.config.ts` → `runtimeConfig`. After `Parse.initialize`, it calls `useAuthStore().hydrateFromParse()`.

Exposed as `useNuxtApp().$parse` for the rare case you need direct access, though prefer the auth store / domain composables.

### Backend (`server/`)

Unchanged by the Nuxt migration. Express + Parse Server v7 on `:8080`. CJS (`server/package.json` overrides the top-level `"type": "module"` to `"commonjs"`). Bullet points:

- `dotenv` loads `server/local.env` (dev) or `server/.env` (prod) based on `NODE_ENV`.
- `app.set("trust proxy", 1)` — required if behind a reverse proxy so Parse `accountLockout` doesn't lock `127.0.0.1` for every user when one fails 5 logins.
- `await api.start()` then `app.use("/api", api.app)`. The `start()` call is required in parse-server v6+.
- The CSP middleware (`Content-Security-Policy: frame-ancestors 'self'`) is mounted **before** the Parse mount — otherwise Parse sends the response body first and any later `res.setHeader()` hits `ERR_HTTP_HEADERS_SENT`.
- `app` is bound as the request listener via `http.createServer(app)` — do NOT also call `httpServer.on("request", app)`, that double-fires the middleware chain.
- LiveQuery runs on the same `httpServer` via `ParseServer.createLiveQueryServer(httpServer)`.

### Data layer

No ORM, no separate API layer. Components in `/app/*` talk to Parse directly via `Parse.Query`, `Parse.Object.extend("ClassName")`, `Parse.Cloud.run(...)`.

```js
const Campaign = Parse.Object.extend("Campaign");
const q = new Parse.Query(Campaign);
q.equalTo("owner", user);
const results = await q.find();
```

For real-time, use Parse LiveQuery: register the class in `liveQuery.classNames` in `server/index.js`, then `query.subscribe()` in a component and listen to `create`/`update`/`leave`/`delete`. Guard subscription setup with a promise gate to prevent double-subscribe races (an `if (this.subscriptionSetup) return this.subscriptionSetup;` pattern in front of the async setup function).

### Design tokens

`assets/css/tokens.css` is the single source of truth for design values (color, type, space, radius, shadow, motion, component aliases). Nuxt loads it globally via `css: ['~/assets/css/tokens.css']` in `nuxt.config.ts`. All page/component CSS consumes via `var(--…)`; **never** hardcode token values inline.

A duplicate copy lives at `mocks/_pop/tokens.css` for the design mocks. If you change one, change both — to be consolidated later.

### Module systems

The root `package.json` sets `"type": "module"` so `nuxt.config.ts`, plugins, middleware, stores, and pages are all ESM. `server/package.json` overrides this to `"type": "commonjs"` so `server/*.js` uses `require()` / `__dirname`. Keep that boundary intact.

### Env vars

Frontend: Nuxt exposes `NUXT_PUBLIC_*` env vars on `useRuntimeConfig().public`. Currently `parseAppId` and `apiUrl` are read this way. Defaults are in `nuxt.config.ts`.

Backend: `server/local.env` (dev) and `server/.env` (prod). `PARSE_MASTER_KEY` is required; the server `process.exit(1)`s without it. The committed master key in `local.env` is a development-only random value — generate a fresh one for production.

### Mocks

`mocks/` holds design explorations and is served by a tiny zero-dep Node http server (`scripts/mocks-server.cjs`, port 5050, run via `npm run mocks`). It is NOT part of the deployed app. The chosen direction is **Pop** — see `mocks/_pop/tokens.css` for the canonical palette and `mocks/index.html` for the directory landing page.
