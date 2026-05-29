# Gorilla

> Email marketing that hits like iron. A Mailchimp-class platform: editor, audiences, segments, broadcasts, automations, reports — built end-to-end.

The name: **Fe** is the periodic-table symbol for iron (atomic number **26**). The mark is a stylized iron-clad gorilla head — heavy brow, plate seam down the forehead, rivets, visor-slit eyes, jaw plate. The visual identity is **Pop** — hot coral (`#FF4E4E`) as structural color, Manrope display + Inter body + JetBrains Mono numerals.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Nuxt 3** + Vue 3 + Pinia | Hybrid app: prerendered marketing pages for SEO, CSR `/app/*` for the authed product (Parse session lives in `localStorage`, so SSR'd app pages would render blank). |
| Backend | **Express + Parse Server v7** | Parse gives us Cloud Code, REST, LiveQuery, account lockout, ACLs — all the unsexy plumbing — without writing a custom API. Express owns the process. |
| Data | **MongoDB** (`localhost:27017/gorilla`) | Parse's preferred store. Also backs the job queue. |
| Queue | **Mongo + [Agenda](https://github.com/agenda/agenda)** | One fewer thing to operate than Redis. Throughput is sufficient at MVP volume (sub-50k emails/day per tenant). See `Sending.md` §6. |
| Email transport | **AWS SES v2** (SDK v3) | $0.10 / 1,000 emails. Modern API. Best-documented reputation tooling. Pluggable behind a `sesAdapter` interface — tests use a Mock that writes to Mongo. See `DECISIONS.md`. |
| Tests | **Vitest** + **Playwright** | Vitest for unit/integration (cloud functions, worker jobs, Vue components). Playwright for the golden-path E2E. |
| Worker | Long-running Node process | Separate from Express. Both connect to the same Mongo. Boots Agenda + registers job handlers. Started by `npm run worker` (and bundled into `npm run dev`). |

Three processes in dev (`npm run dev` boots all three concurrently):

| Process | Port | Purpose |
|---|---|---|
| Express + Parse | 8080 | REST API, Cloud Functions, webhook ingestion, tracking endpoints, LiveQuery |
| Worker | — | Pulls jobs from Mongo (campaign fanout, send-email, webhook ingestion, suppression recompute) |
| Nuxt | 3000 | Frontend dev server; proxies `/api/**` → 8080 |

---

## Getting started

Prerequisites:
- **Node 20** (pinned in `.nvmrc` — run `nvm use` to switch)
- **MongoDB** running locally at `mongodb://localhost:27017/gorilla`

```bash
nvm use                # picks up Node 20
npm install
npm run dev            # boots Express+Parse on :8080, worker, Nuxt on :3000
```

Visit:
- http://localhost:3000 — marketing homepage
- http://localhost:3000/signup — create an account
- http://localhost:3000/app/dashboard — authed app (after login)

### Other scripts

| Script | What |
|---|---|
| `npm run dev` | Server + worker + Nuxt, concurrent, with hot reload |
| `npm run dev:server` / `dev:worker` / `dev:web` | Run a single process for focused debugging |
| `npm run build` | Nuxt production build → `.output/` |
| `npm run generate` | Static-generate the prerendered marketing pages |
| `npm run preview` | Run the built Nuxt output locally |
| `npm test` | Vitest run (unit + integration) |
| `npm run test:watch` | Vitest watch mode |
| `npm run e2e` | Playwright E2E (boots dev server automatically) |
| `npm run e2e:headed` | Playwright with a visible browser |
| `npm run e2e:install` | One-time: install Playwright's Chromium binary |
| `npm run mocks` | Tiny static server for `mocks/` design explorations (port 5050) |
| `npm run start` | Production: pm2-managed server + worker |

---

## Repo layout

```
fe-gorilla/
├── README.md                ← this file
├── CLAUDE.md                ← machine-readable codebase guide for AI agents
├── DECISIONS.md             ← rolling log of load-bearing engineering decisions
│
├── Architecture.md          ← system design overview (older — Sending.md supersedes §3)
├── Features.md              ← MVP feature catalog with F-XX IDs
├── Editor.md                ← email editor architecture
├── Editor-phase1.md         ← editor credibility-gap features (shipped)
├── Sending.md               ← email send pipeline (the hard part — read this)
│
├── nuxt.config.ts           ← per-route render mode, components auto-import, /api proxy
├── vitest.config.ts         ← env-by-glob, forked pool, smoke test included
├── playwright.config.ts     ← single worker, boots `npm run dev` once per run
│
├── app.vue                  ← <NuxtLayout><NuxtPage /></NuxtLayout>
├── assets/css/tokens.css    ← single source of truth for Pop design tokens
│
├── pages/                   ← Nuxt file-based routes
│   ├── index.vue            ← /
│   ├── signup.vue           ← /signup        prerender
│   ├── login.vue            ← /login         prerender
│   └── app/                 ← /app/**        ssr: false (CSR)
│       ├── dashboard.vue
│       ├── campaigns/
│       ├── audiences/
│       ├── segments/
│       ├── templates/
│       └── reports/
│
├── layouts/
│   ├── default.vue          ← (future) marketing chrome
│   └── app.vue              ← authed app chrome (sidebar, top nav, logout, noindex)
│
├── components/
│   ├── shared/              ← primitives, NO prefix (e.g. <Button />)
│   ├── marketing/           ← <MarketingHero />
│   └── app/                 ← <AppSidebar />, <AppKpiCard />, editor/*
│
├── composables/
│   ├── shared/
│   ├── marketing/
│   └── app/                 ← useAudiences, useContacts, useSegments (as we build them)
│
├── stores/                  ← Pinia (auth, network)
├── middleware/              ← auth-required (on /app/*), auth-blocked (on /login,/signup)
├── plugins/                 ← parse.client.ts (Parse SDK init)
├── utils/                   ← sessionGuard.client.js
│
├── server/                  ← Express + Parse + worker (CommonJS island)
│   ├── index.js             ← Express boot + Parse mount on :8080
│   ├── package.json         ← { "type": "commonjs" } — overrides root ESM
│   ├── local.env            ← dev env (gitignored)
│   ├── cloud/               ← Parse Cloud Code, split by domain
│   │   ├── main.js          ← entry; requires the submodules
│   │   ├── audiences.js
│   │   ├── contacts.js
│   │   ├── segments.js
│   │   ├── campaigns.js     ← includes compileBlocks beforeSave
│   │   └── sending.js       ← scheduleSend, sendTestEmail
│   ├── lib/                 ← shared helpers
│   │   ├── env.js
│   │   ├── parseClient.js   ← Parse Node SDK init for the worker
│   │   ├── agendaInstance.js
│   │   ├── sesAdapter.js    ← Mock + Real SES, selected by AWS_SES_MODE
│   │   └── trackingTokens.js← HMAC for /t/o, /t/c, /u tokens
│   ├── routes/              ← Express routers, mounted before Parse
│   │   ├── tracking.js      ← /t/o/:token, /t/c/:token, /u/:token
│   │   └── webhooks.js      ← /api/webhooks/ses
│   └── worker/
│       ├── index.js         ← worker entrypoint
│       └── jobs/
│           ├── campaignFanout.js
│           ├── sendEmail.js
│           └── webhookIngest.js
│
├── tests/
│   ├── setup/               ← global vitest setup, mongo-memory helper
│   ├── unit/                ← pure-logic tests (token signing, MJML compile, etc.)
│   ├── server/              ← cloud-function + worker-job tests (real Mongo via memory-server)
│   ├── components/          ← Vue SFC tests (happy-dom)
│   └── e2e/                 ← Playwright specs
│
├── mocks/                   ← design exploration (NOT part of the deployed app)
└── scripts/                 ← misc dev scripts (mocks server)
```

The `server/` subdirectory **overrides the root `"type": "module"` to `"commonjs"`** via its own `package.json`. The frontend is ESM; the server uses `require()` and `__dirname`. Don't cross the boundary.

---

## Architectural rules

These are load-bearing. Read them before adding anything substantial.

### 1. Marketing vs. app boundary

The single most important rule:

> **Marketing pages live at top-level paths and are prerendered to static HTML. The authed app lives under `/app/*` and is CSR (`ssr: false`).**

Configured once in `nuxt.config.ts` via `routeRules`. Any new authed page goes under `pages/app/` and inherits CSR + the `noindex` meta from `layouts/app.vue`. **Never add an authed page outside `pages/app/`.**

Why CSR for `/app/*`: the Parse session token lives in `localStorage`, which doesn't exist server-side. Authed pages need it on first paint.

### 2. Component buckets are a one-way wall

- `components/shared/` — primitives. May import from nothing else app-side.
- `components/marketing/` — marketing-only. MUST NOT import from `components/app/` or `stores/`.
- `components/app/` — app-only. May import from `components/shared/`.

Shared → marketing/app is fine. The other direction or peer crossing is a smell.

### 3. Component prefixes are explicit, not derived

Nuxt does NOT auto-derive component-name prefixes from directory paths. `nuxt.config.ts` sets `prefix: "App"` / `prefix: "Marketing"` / `pathPrefix: false` explicitly under `components: [...]`. If you add a new directory under `components/`, register it with an explicit prefix or your components will render as empty.

### 4. Tokens are the source of truth

`assets/css/tokens.css` defines every color/type/space/radius/shadow value. All CSS consumes via `var(--…)`. **Never hardcode token values inline.**

A duplicate copy lives at `mocks/_pop/tokens.css` for the mocks server. Edit both when you change one (consolidate later).

### 5. The send pipeline is its own architectural island

`Sending.md` is the canonical doc for everything email-delivery. Key choices that override `Architecture.md`:
- **In-house glue + AWS SES** (not full ESP, not full DIY)
- **Mongo + Agenda** (not Redis + BullMQ)
- **Shared sending domain `send.gorilla.email`** at MVP; BYO-domain in Phase 3+
- **SES adapter is pluggable** — `AWS_SES_MODE=mock` routes through a mock that writes to a Mongo collection (tests inspect it); `AWS_SES_MODE=real` uses the real SDK

See also `DECISIONS.md` for rolling context on each call.

---

## Deeper docs

When in doubt about a system, **read the doc**, then read the code. The docs document the *why*; the code documents the *what*.

| Doc | Read when |
|---|---|
| `Architecture.md` | You want the system-level view: data model, two-process layout, deployment shape. **Note:** §3 (ESP + queue) is superseded by `Sending.md`. |
| `Features.md` | You want to know what's in/out of scope for MVP — feature catalog with stable IDs. |
| `Editor.md` | You're touching anything under `components/app/editor/`. |
| `Editor-phase1.md` | You want context on the editor's credibility-gap features (Setup, preflight, undo/redo, mobile preview, Footer block, etc.) |
| `Sending.md` | You're touching anything send-pipeline: queue, fanout, SES, suppression, tracking, webhooks, abuse controls. |
| `CLAUDE.md` | You're an AI agent (or want the same orientation an AI gets). |
| `DECISIONS.md` | You want to know *why* a choice was made, not just what was built. |

---

## Status

**Built (shipped):**
- Marketing pages — `/`, `/signup`, `/login` (prerendered)
- Authed app shell — sidebar, top nav, logout
- All `/app/*` pages — dashboard, campaigns list, audiences, segments, templates, reports (currently fed by mock data; rewiring in progress)
- Email editor — 7 block types (Heading, Paragraph, Image, Button, Divider, Spacer, Footer), inline editing, undo/redo, mobile preview, pre-flight checklist, drag-and-drop, BrandColorPicker

**Building (this push):**
- Data layer — Parse classes + Cloud Code CRUD for Audience, Contact, Segment + composables
- Server-side `compileBlocks` — JSON → MJML → HTML on Campaign beforeSave
- Send pipeline phases 1–4 (per `Sending.md`)
  - SES adapter (mock + real)
  - Mongo + Agenda queues
  - `campaign-fanout` + `send-email` worker jobs
  - Suppression list + SES webhook ingestion
  - Open pixel + click redirect + List-Unsubscribe (HMAC-tokenized)
- Test suite — Vitest + Playwright
- Editor wiring — `AudienceSelector` reads real audiences; `Send` button triggers `scheduleSend`

**Deferred (later push):**
- Send pipeline phases 5–6: per-tenant rate limiting, complaint/bounce auto-pause, DMARC parsing, dedicated-IP option
- BYO sending domain
- LiveQuery on Campaign for in-app real-time status

---

## Environment

| Var | Where | Required | Purpose |
|---|---|---|---|
| `PARSE_APP_ID` | `server/local.env` | yes | App identifier shared between server + SDK |
| `PARSE_MASTER_KEY` | `server/local.env` | yes | Server-only secret; process exits if missing |
| `PARSE_DATABASE_URI` | `server/local.env` | no (default `mongodb://localhost:27017/gorilla`) | |
| `PARSE_SERVER_URL` | `server/local.env` | no (default `http://localhost:8080/api`) | |
| `AWS_SES_MODE` | `server/local.env` | no (default `mock` in dev, `real` in prod) | `mock` writes sent messages to a Mongo collection for tests; `real` calls SES. |
| `AWS_REGION` | `server/local.env` | when `AWS_SES_MODE=real` | SES region (`us-east-1`). |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `server/local.env` | when `AWS_SES_MODE=real` | IAM credentials for SES. |
| `SES_FROM_DOMAIN` | `server/local.env` | when `AWS_SES_MODE=real` | The verified sending domain (e.g. `send.gorilla.email`). |
| `TRACKING_TOKEN_SECRET` | `server/local.env` | yes for tracking | HMAC secret for `/t/o`, `/t/c`, `/u` tokens. |
| `PUBLIC_TRACKING_BASE_URL` | `server/local.env` | yes for tracking | Public base URL for tracking endpoints (e.g. `https://api.gorilla.email`). |
| `NUXT_PUBLIC_PARSE_APP_ID` | shell or `.env` at root | no (default `gorilla`) | Exposed via `useRuntimeConfig().public.parseAppId`. |
| `NUXT_PUBLIC_API_URL` | shell or `.env` at root | no (default `/api`) | Frontend API base; proxied to `:8080`. |

All `.env*` files are gitignored. **The committed master key in `server/local.env` is a development-only random value — generate a fresh one for production.**

---

## Contributing

Solo project for now. Pattern when AI agents pair on this:
1. Read the relevant deep doc first (especially `Sending.md` before touching the send pipeline).
2. Read `CLAUDE.md` for codebase conventions.
3. Append a `DECISIONS.md` entry when you make a load-bearing choice that's not obvious from the code.
4. Tests live next to nothing — they're under `tests/` mirroring the source tree (`tests/server/cloud/audiences.test.ts` covers `server/cloud/audiences.js`).
