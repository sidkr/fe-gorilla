# Testing Plan — Auth & Marketing

Coverage plan for the marketing entry surface (`/`, `/login`, `/signup`) and the
authentication spine that hangs off it: signup → Organization provisioning,
login/logout/session lifecycle, the two route guards, org hydration, and the
Parse SDK bootstrap plugin.

## Stack facts (the contract these tests run against)

- **Frameworks:** Vitest for unit / component / integration; Playwright for E2E
  (DECISIONS #7 — no Jest, no Cypress).
- **Runtime:** Node 20 (`.nvmrc`). Source `nvm` and `nvm use 20` before any
  `npm`/`npx`. System Node is 14 and breaks installs and the Parse SDK silently.
- **Vitest environments:** default `environment: "node"`. Component tests opt in
  per-file with a `// @vitest-environment happy-dom` header. `pool: "forks"` —
  one forked process per test file so Parse SDK + Pinia singletons reset between
  files. Do **not** switch to threads (Parse SDK is not thread-safe).
- **Test locations:**
  - `tests/server/*.test.ts` — integration against a real Parse Server +
    in-memory Mongo, booted per-file via `startTestParseServer()`
    (`tests/setup/parseServer.ts`). Loads `server/cloud/main.js`.
  - `tests/components/*.test.ts` — happy-dom SFC tests via `mountWithPinia()`
    (`tests/setup/vueTest.ts`), which mounts with a fresh Pinia. No
    `@nuxt/test-utils` — Nuxt auto-imports / router are stubbed by the test.
  - `tests/e2e/*.spec.ts` — Playwright. `webServer` boots `npm run dev`
    (Express + worker + Nuxt) on `:3000`; `baseURL` is `http://localhost:3000`.
    `freshUser` fixture (`tests/setup/playwrightFixtures.ts`) provisions a user
    via `POST /api/users` and tears it down with the master key. Single worker
    (shared dev Mongo).
- **Multi-tenant signup:** the client never calls `Parse.User.signUp` directly.
  It calls the **`signUpWithOrg`** cloud function, which creates `_User` +
  `Organization` + `org_<orgId>_members` role and returns
  `{ sessionToken, userId, orgId, orgName }` (DECISIONS #10). In **server/Node
  tests, `Parse.User.become()` is blocked** ("not memory-safe"). To act as a
  user, pass `{ sessionToken }` (from `signUpWithOrg`) into each query / save /
  `Cloud.run`. This is also the correct way to assert ACL isolation without the
  master key. Note: the **browser** code path (`stores/auth.js`) *does* call
  `Parse.User.become(r.sessionToken)` — that is legal in the browser and must be
  covered by E2E, not by node integration tests.

## 1. Scope & routes

| Route | Render mode | Guard | Notes |
|---|---|---|---|
| `/` | prerender (static HTML) | none | Marketing homepage (`pages/index.vue`). Anon + authed both allowed. |
| `/login` | prerender | `auth-blocked` | `pages/login.vue`. Authed → `/app/dashboard`. |
| `/signup` | prerender | `auth-blocked` | `pages/signup.vue`. Authed → `/app/dashboard`. |
| `/app/*` | CSR (`ssr: false`) | `auth-required` (via `layouts/app.vue`) | Target of post-auth redirect; anon → `/login?next=…`. |
| `/api/**` | proxy → Parse `:8080` | — | Where the SDK talks. |

Units under test and their files:

- `pages/index.vue` — marketing homepage, SEO head, CTA links.
- `pages/login.vue` — login form, validation, error mapping, `next` redirect.
- `pages/signup.vue` — signup form, client validation, password-strength meter,
  terms gate, `next` redirect.
- `stores/auth.js` — `useAuthStore`: `hydrateFromParse`, `hydrateOrg`, `login`,
  `signup`, `logout`, `sessionExpired`; getters `isAuthenticated`, `username`,
  `name`, `orgId`, `orgName`.
- `middleware/auth-required.ts` — anon → `/login?next=`.
- `middleware/auth-blocked.ts` — authed → `/app/dashboard`.
- `plugins/parse.client.ts` — `Parse.initialize` + `serverURL` + first hydrate.
- `server/cloud/organizations.js` — `signUpWithOrg`, `_User` beforeSave (norm),
  `getMyOrg`.
- `utils/sessionGuard.client.js` — `markSessionInvalid`, `validateSession`,
  `purgeSession` (used by `logout` / `sessionExpired`).

## 2. Test matrix — which layer owns what

| Concern | Unit (node) | Component (happy-dom) | Integration (Parse server) | E2E (Playwright) |
|---|:---:|:---:|:---:|:---:|
| `signUpWithOrg` user+org+role creation | | | ✅ (primary) | |
| Duplicate signup → code 202 | | | ✅ (primary) | |
| Email/username normalization (beforeSave) | | | ✅ | |
| `getMyOrg` shape + auth requirement | | | ✅ | |
| Cross-org ACL isolation at signup | | | ✅ (primary) | |
| Auth-store actions (login/signup/logout/hydrate) | ✅ (mocked Parse) | | | ✅ (real, secondary) |
| Auth-store getters | ✅ | | | |
| Login form validation + error mapping | | ✅ (primary) | | |
| Signup form validation / strength / terms | | ✅ (primary) | | |
| `next` open-redirect guard (login) | | ✅ | | ✅ |
| `auth-required` redirect logic | ✅ (unit, mocked store) | | | ✅ (real nav) |
| `auth-blocked` redirect logic | ✅ (unit, mocked store) | | | ✅ (real nav) |
| `parse.client.ts` init + hydrate-on-boot | ✅ (mocked) | | | ✅ (implicit) |
| Marketing page renders / SEO head / CTAs | | ✅ | | ✅ |
| Full signup→app round trip | | | | ✅ (primary) |
| Login → logout → session revoked | | | partial (revoke) | ✅ (primary) |
| Expired session → bounced to `/login` | | | | ✅ (primary) |

"Primary" marks the layer that is the source of truth for that behavior; other
ticked layers are corroborating coverage.

## 3. Detailed test cases

Priority: **P0** = must pass before any release of this surface (auth correctness
+ tenant security). **P1** = important UX / negative paths. **P2** = polish,
SEO, decorative.

### 3.1 Integration — `signUpWithOrg` / `getMyOrg` / tenancy (`tests/server/*.test.ts`)

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| INT-01 | Integration | Signup provisions user + org + role | `Cloud.run("signUpWithOrg", {username,password,email,name,company})` | Returns truthy `sessionToken/userId/orgId/orgName`; user `role:"owner"`; org `plan:"free"`, truthy `slug`; role `org_<orgId>_members` exists and contains the user | P0 |
| INT-02 | Integration | Email/username lowercased + trimmed | Sign up `"Alice@Example.com"` | Stored `username` and `email` === `alice@example.com` (beforeSave norm) | P0 |
| INT-03 | Integration | `getMyOrg` returns plain org for caller | Sign up, then `Cloud.run("getMyOrg", {}, { sessionToken })` | `{ id, name, slug, plan, defaultFromName, defaultFromEmail, monthlySendCap }`; `plan==="free"`, `monthlySendCap > 0` (10000) | P0 |
| INT-04 | Integration | `getMyOrg` rejects anonymous caller | `Cloud.run("getMyOrg")` with no session/master key | Rejects with `INVALID_SESSION_TOKEN` (209) | P1 |
| INT-05 | Integration | Cross-org isolation via ACL | A and B sign up; A saves a `Contact` with `{sessionToken: A}`; query as A then as B | A sees 1 row; **B sees 0 rows** (no master key) | P0 |
| INT-06 | Integration | New tenant object gets org + restrictive ACL | As a fresh user, save a `List` with no ACL/org set client-side | Fetched (master key) has `organization` pointer == caller's `orgId`; ACL public read/write false; members-role read+write true (beforeSave stamping) | P0 |
| INT-07 | Integration | Anonymous cannot create tenant object | `new List().save()` with no session, no master key | Rejected | P0 |
| INT-08 | Integration | Duplicate signup → 202 | Sign up `dupe@example.com`; sign up again as `Dupe@Example.com` (different case) | Second rejects with `code: 202` (USERNAME_TAKEN; email-taken normalized to 202 too) | P0 |
| INT-09 | Integration | Missing username/password rejected | `signUpWithOrg` with `{}` or password only | Rejects `OTHER_CAUSE` ("username and password are required") | P1 |
| INT-10 | Integration | Company-name derivation fallback | Sign up with `company:""`, `name:"Bob"` then with neither (only username) | `orgName` === `"Bob's organization"`; with only `carl@x.com` → `"carl's organization"` | P2 |
| INT-11 | Integration | Slug uniqueness across same-named orgs | Two signups with `company:"Acme"` | Both succeed; the two `slug`s differ (random suffix); both start `acme-` | P1 |
| INT-12 | Integration | Returned session token is usable | Take `sessionToken` from `signUpWithOrg`, run an authed `getMyOrg` with it | Succeeds — confirms the explicit `logIn` mint in step (e) works | P0 |
| INT-13 | Integration | Failed org step cleans up the user (no orphan) | Force a failure after user create (e.g. invalid org save) and assert the user is destroyed | No `_User` lingers for that username; a subsequent signup with same username succeeds | P2 |

> Note for INT-13: the cleanup path is in the `catch` of `signUpWithOrg`. It is
> hard to trigger without injecting a fault; mark P2 and consider a
> `cloud`-override fixture or schema constraint to force the throw. Document as a
> gap if not implemented.

### 3.2 Unit — auth store (`tests/components/` or a new `tests/unit/auth.store.test.ts`, Parse mocked)

These run in node (or happy-dom) with `parse` mocked — `Parse.User.logIn`,
`Parse.User.current`, `Parse.User.become`, `Parse.Cloud.run`,
`Parse.User.logOut` are `vi.fn()` stubs. Pinia via `setActivePinia(createPinia())`.

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| STORE-01 | Unit | `hydrateFromParse` with existing session | mock `Parse.User.current()` → a user; call action | `state.user` set; `hydrateOrg` invoked (fire-and-forget) | P0 |
| STORE-02 | Unit | `hydrateFromParse` with no session | `Parse.User.current()` → null | `state.user` stays null; `getMyOrg` **not** called | P0 |
| STORE-03 | Unit | `hydrateOrg` populates organization | user present; `Cloud.run("getMyOrg")` → `{id,name,plan}` | `state.organization` set; getters `orgId`/`orgName` reflect it | P1 |
| STORE-04 | Unit | `hydrateOrg` swallows expired-session error | `Cloud.run` rejects | `state.organization === null`; no throw | P1 |
| STORE-05 | Unit | `hydrateOrg` no-op when not logged in | `state.user = null`; call | returns null, `organization` null, `Cloud.run` not called | P2 |
| STORE-06 | Unit | `login` sets user + hydrates org | `Parse.User.logIn` → user; `getMyOrg` → org | `state.user` + `state.organization` populated; returns the user | P0 |
| STORE-07 | Unit | `login` propagates auth error | `Parse.User.logIn` rejects `{code:101}` | action rejects with same error; `state.user` stays null | P0 |
| STORE-08 | Unit | `signup` runs cloud fn then becomes session | `Cloud.run("signUpWithOrg")` → `{sessionToken}`; `become` → user | `signUpWithOrg` called with `{username,password,email,name,company}`; `become(sessionToken)` called; user + org set | P0 |
| STORE-09 | Unit | `logout` purges + clears state | call after login | `purgeSession()` invoked; `user` and `organization` → null | P0 |
| STORE-10 | Unit | `sessionExpired` marks invalid + clears | call | `markSessionInvalid()` then `purgeSession()` called; state cleared | P1 |
| STORE-11 | Unit | getters reflect Parse user fields | set `user` to mock with `get("username")`/`get("name")` | `username`/`name`/`isAuthenticated` correct | P2 |

### 3.3 Component — login page (`tests/components/login.page.test.ts`, happy-dom)

Mount `pages/login.vue` with `mountWithPinia`. Stub `navigateTo`, `useRoute`
(query control), `definePageMeta`, `useHead`, and the auth store action
(`auth.login` as a spy). Child components (`FormField`, `TextInput`, `Button`,
`NuxtLink`) stubbed or shallow-mounted.

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| LOGIN-01 | Component | Empty submit blocked client-side | submit with blank email/password | `errorMsg` = "Enter your email and password to continue."; `auth.login` **not** called | P1 |
| LOGIN-02 | Component | Happy login → default redirect | fill valid creds, no `next`; `auth.login` resolves | `auth.login(email.trim(), password)` called; `navigateTo("/app/dashboard")` | P0 |
| LOGIN-03 | Component | Honors same-origin `next` | `route.query.next = "/app/campaigns/123"`; submit ok | `navigateTo("/app/campaigns/123")` | P0 |
| LOGIN-04 | Component | Open-redirect guard rejects absolute URL | `next = "https://evil.com"` (no leading `/`) → falls through; also `next` arrays | `navigateTo("/app/dashboard")` (external value ignored) | P0 |
| LOGIN-05 | Component | Wrong creds → friendly message (101) | `auth.login` rejects `{code:101}` | `errorMsg` = "That email or password didn't match…"; stays on page | P1 |
| LOGIN-06 | Component | Lockout → friendly message (219) | `auth.login` rejects `{code:219}` | `errorMsg` = "Too many failed attempts…" | P1 |
| LOGIN-07 | Component | Unknown error → fallback message | `auth.login` rejects `{message:"boom"}` | `errorMsg` = "boom" (or generic fallback) | P2 |
| LOGIN-08 | Component | Submitting state toggles | resolve slowly | `submitting` true during call → button shows "Logging in…" / disabled; false after | P2 |
| LOGIN-09 | Component | `auth-blocked` middleware registered | inspect `definePageMeta` | `middleware: "auth-blocked"` declared | P1 |
| LOGIN-10 | Component | SEO head present | mount, read `useHead` args | title "Log in"; canonical `/login`; `robots: index,follow` | P2 |

### 3.4 Component — signup page (`tests/components/signup.page.test.ts`, happy-dom)

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| SIGNUP-01 | Component | Invalid email blocked | email `"notanemail"`, submit | `errorMsg` = "Please enter a valid email."; `auth.signup` not called | P1 |
| SIGNUP-02 | Component | Short password blocked | valid email, password `"short1"` (<8) | `errorMsg` = "Password must be at least 8 characters."; no signup call | P0 |
| SIGNUP-03 | Component | Terms unchecked blocked | valid email+pw, `terms=false` | `errorMsg` = "Please agree to the terms to continue."; no signup call | P1 |
| SIGNUP-04 | Component | Happy signup → redirect | valid all; `auth.signup` resolves | `auth.signup({username:email, password, email, name, company})` (username derived from email, trimmed); `navigateTo("/app/dashboard")` | P0 |
| SIGNUP-05 | Component | `next` carried through | `route.query.next = "/app/audiences"`; submit | `navigateTo("/app/audiences")` (note: signup does NOT apply the open-redirect guard login has — see GAP-3) | P1 |
| SIGNUP-06 | Component | Server dup-email surfaces message | `auth.signup` rejects `{code:202, message:"An account with this email already exists."}` | `errorMsg` shows that message; stays on page | P0 |
| SIGNUP-07 | Component | Email-valid affix appears | type valid email | check-circle affix renders (`emailValid` true) | P2 |
| SIGNUP-08 | Component | Password strength meter scores | type `"abc"`→0/1, `"abcd1234"`→, `"Abcd1234!xyz"`→ | bars `on` count matches `passwordStrength`; label is one of Weak/Fair/Strong/Very strong | P2 |
| SIGNUP-09 | Component | Submitting state toggles | slow resolve | button "Creating account…", disabled during call | P2 |
| SIGNUP-10 | Component | `auth-blocked` middleware + SEO head | inspect meta | `middleware:"auth-blocked"`; title "Sign up"; canonical `/signup`; `robots:index,follow` | P2 |

### 3.5 Unit — route guards (`tests/components/guards.test.ts` or `tests/unit/`)

Call the exported middleware function directly with a mocked `to` route and a
controlled auth store. Stub `navigateTo` and `import.meta.server`.

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| GUARD-01 | Unit | `auth-required` bounces anon | `isAuthenticated=false`, `to.fullPath="/app/campaigns/9"` | `navigateTo("/login?next=%2Fapp%2Fcampaigns%2F9")` (encoded) | P0 |
| GUARD-02 | Unit | `auth-required` allows authed | `isAuthenticated=true` | returns nothing (no redirect) | P0 |
| GUARD-03 | Unit | `auth-required` no-ops on server | `import.meta.server=true` | returns early, store not read | P1 |
| GUARD-04 | Unit | `auth-blocked` bounces authed | `isAuthenticated=true` | `navigateTo("/app/dashboard")` | P0 |
| GUARD-05 | Unit | `auth-blocked` allows anon | `isAuthenticated=false` | no redirect (renders form) | P0 |
| GUARD-06 | Unit | `auth-blocked` no-ops on server | `import.meta.server=true` | early return | P1 |

### 3.6 Unit — Parse plugin (`tests/unit/parse.plugin.test.ts`)

Mock `parse` and `useRuntimeConfig`; spy `useAuthStore().hydrateFromParse`.

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| PLUG-01 | Unit | Initializes SDK from runtime config | run plugin with `public.parseAppId`, `public.apiUrl` | `Parse.initialize(appId)`; `Parse.serverURL = apiUrl` | P0 |
| PLUG-02 | Unit | Hydrates auth store once on boot | run plugin | `hydrateFromParse()` called exactly once before first guard | P0 |
| PLUG-03 | Unit | Provides `$parse` | inspect return | `{ provide: { parse: Parse } }` | P2 |

### 3.7 Component — marketing homepage (`tests/components/index.page.test.ts`, happy-dom)

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| HOME-01 | Component | CTAs point to signup/login | mount `pages/index.vue` | nav has `to="/login"` (Sign in) + `to="/signup"` (Sign up free); hero + final CTA link `to="/signup"` | P1 |
| HOME-02 | Component | SEO head verbatim title | read `useHead` | `title:"Fe-Mail Gorilla"`, `titleTemplate:null`; canonical `/`; og + twitter meta present | P2 |
| HOME-03 | Component | No store/app-component imports | static check / mount without Pinia errors | renders without `useAuthStore` (marketing must not reach into app state) | P2 |

### 3.8 E2E — full flows (`tests/e2e/auth.spec.ts`, Playwright, real dev stack)

These need the dev server + dev Mongo running. Use a unique email per run
(`t_<ts>_<rand>@test.gorilla.local`) and clean up via master key (mirror the
`freshUser` fixture). `signUpWithOrg` runs through the real SDK here, so this is
the only layer that exercises the browser `Parse.User.become` path in
`stores/auth.js`.

| ID | Layer | Scenario | Steps | Expected | Pri |
|---|---|---|---|---|---|
| E2E-01 | E2E | Homepage serves + CTA to signup | `goto("/")`; click "Sign up free" | title matches `/Gorilla/i`; URL → `/signup` | P1 |
| E2E-02 | E2E | Full signup → dashboard | `/signup`, fill name/email/company/password, agree terms, submit | lands `/app/dashboard`; org name visible in app chrome (sidebar/user block) | P0 |
| E2E-03 | E2E | Duplicate signup shows error | sign up an email, log out, sign up same email again | inline `.form-error` "An account with this email already exists."; stays on `/signup` | P0 |
| E2E-04 | E2E | Login happy path | provision via `freshUser`/REST, `goto("/login")`, fill, submit | lands `/app/dashboard` | P0 |
| E2E-05 | E2E | Login `next` round-trip | `goto("/app/campaigns")` while anon → redirected `/login?next=%2Fapp%2Fcampaigns`; log in | after login lands back on `/app/campaigns` | P0 |
| E2E-06 | E2E | Wrong password error | login with bad password | `.form-error` "That email or password didn't match…"; still on `/login` | P1 |
| E2E-07 | E2E | Anon → `/app/*` bounced to login | `goto("/app/dashboard")` with no session | URL becomes `/login?next=%2Fapp%2Fdashboard` | P0 |
| E2E-08 | E2E | Authed → `/login` bounced to app | log in, then `goto("/login")` | redirected to `/app/dashboard` (auth-blocked) | P0 |
| E2E-09 | E2E | Authed → `/signup` bounced to app | log in, then `goto("/signup")` | redirected to `/app/dashboard` | P1 |
| E2E-10 | E2E | Logout revokes + clears | log in, click logout in app layout | lands `/`; `localStorage` has no `Parse/*` keys; revisiting `/app/dashboard` bounces to `/login` | P0 |
| E2E-11 | E2E | Expired/invalid session → `/login` | log in, delete the session server-side (or corrupt `Parse/*currentUser` token), navigate within `/app/*` | session-guard detects `INVALID_SESSION_TOKEN`; user routed to `/login` | P0 |
| E2E-12 | E2E | Authed user can still read `/` | log in, `goto("/")` | homepage renders (NOT redirected — marketing has no auth-blocked) | P2 |
| E2E-13 | E2E | Org hydration on reload | log in, reload `/app/dashboard` | org name re-appears after `hydrateFromParse` → `getMyOrg` (no flash of empty state that persists) | P1 |
| E2E-14 | E2E | Two orgs stay isolated end-to-end | sign up org A and org B, each creates an audience | A's dashboard never shows B's data and vice versa | P0 |
| E2E-15 | E2E | Open-redirect not honored | `goto("/login?next=https://evil.com")`, log in | lands `/app/dashboard`, NOT evil.com | P0 |

## 4. Acceptance criteria (per feature, all testable)

**Marketing homepage (`/`)**
- Serves as static HTML; title is exactly "Fe-Mail Gorilla"; canonical = `https://gorilla.email/`. [HOME-02, E2E-01]
- "Sign up free" → `/signup`; "Sign in" → `/login`. [HOME-01]
- Imports nothing from `stores/` or `components/app/`. [HOME-03]

**Signup → Organization**
- A valid submission creates exactly one `_User` (role `owner`), one `Organization` (`plan:"free"`, `monthlySendCap:10000`), and one `org_<orgId>_members` role containing the user. [INT-01]
- Username + email are stored lowercased/trimmed. [INT-02]
- Returns a working `sessionToken`; the browser becomes that session and lands on `/app/dashboard`. [INT-12, STORE-08, E2E-02]
- Duplicate email (any case) fails with code 202 and a friendly message; no partial tenant is left behind. [INT-08, INT-13, SIGNUP-06, E2E-03]
- Client blocks bad email, <8-char password, and unticked terms before any network call. [SIGNUP-01/02/03]

**Login**
- Valid creds set `user` + `organization` and navigate to `next` (same-origin) or `/app/dashboard`. [STORE-06, LOGIN-02/03]
- Code 101 → "didn't match"; code 219 → "too many attempts"; other → message/fallback. [LOGIN-05/06/07]
- `next` is only honored when it starts with `/`; external URLs are dropped. [LOGIN-04, E2E-15]

**Logout / session lifecycle**
- Logout calls `purgeSession`, clears `user`+`organization`, removes `Parse/*` localStorage keys, returns to `/`. [STORE-09, E2E-10]
- An invalid/expired session anywhere in `/app/*` ends with the user on `/login`. [STORE-10, E2E-11]

**Route guards**
- Anonymous hitting any `/app/*` path is sent to `/login?next=<encoded original path>`. [GUARD-01, E2E-05/07]
- Authenticated hitting `/login` or `/signup` is sent to `/app/dashboard`; other marketing pages are NOT blocked. [GUARD-04, E2E-08/09/12]
- Both guards are no-ops during SSR. [GUARD-03/06]

**Org hydration**
- After SDK init, `hydrateFromParse` runs once; if a session exists, `getMyOrg` populates `organization` without blocking first paint; failures degrade to `organization=null` (no crash). [PLUG-02, STORE-01/04, E2E-13]
- `getMyOrg` requires a session and returns the documented shape. [INT-03/04]

**Security (no cross-org leakage)**
- A user can never read another org's objects without the master key; verified at the cloud layer (ACL) and end-to-end. [INT-05/06/07, E2E-14]

## 5. Current coverage → existing files, and GAPS

### What exists today

| Area | File | Cases covered |
|---|---|---|
| Tenancy / signup spine | `tests/server/tenancy.test.ts` | INT-01 (user+org+role), INT-02 (norm), INT-03 (getMyOrg shape), INT-05 (cross-org isolation), INT-06 (beforeSave ACL stamp), INT-07 (anon rejected), INT-08 (dup → 202) |
| Test harnesses (not auth-specific) | `tests/setup/parseServer.ts`, `vueTest.ts`, `playwrightFixtures.ts`, `mongo.ts`, `global.ts` | Boot Parse+Mongo; mount SFC with Pinia; `freshUser` REST fixture; localStorage shim |
| Harness smoke / examples | `tests/server/_example.test.ts`, `tests/components/_example.test.ts`, `tests/e2e/_example.spec.ts`, `tests/unit/smoke.test.ts` | Prove the three layers run; E2E example asserts `/` title |

Adjacent server tests (`audiences`, `campaigns`, `contacts`, `segments`, etc.)
lean on `signUpWithOrg` to provision tenants but do not test auth/marketing
behavior directly.

### GAPS to add (nothing below exists yet)

- **GAP-1 — No frontend auth-store tests.** `stores/auth.js` has zero coverage.
  Add `tests/unit/auth.store.test.ts` (Parse mocked) for STORE-01…11. Highest
  value: `login` error propagation, `signup` → `become`, `logout`/`sessionExpired`
  purge.
- **GAP-2 — No guard tests.** Neither `auth-required` nor `auth-blocked` is
  exercised. Add GUARD-01…06 (direct function calls with mocked store +
  `navigateTo`). The `encodeURIComponent(next)` behavior in `auth-required` is
  untested and easy to regress.
- **GAP-3 — Signup `next` has no open-redirect guard (asymmetry bug risk).**
  `login.vue` guards `next` with `startsWith("/")`; `signup.vue` does **not** —
  it passes `route.query.next` straight to `navigateTo`. Add SIGNUP-05 + a
  negative case (`next=https://evil.com` on `/signup`) to document/decide the
  intended behavior. Flag for product: this is likely a real open-redirect on
  the signup path.
- **GAP-4 — No login/signup component tests.** Client validation, error-code
  mapping (101/219/202), submitting state, and the redirect logic are all
  untested at the component layer. Add LOGIN-01…10 and SIGNUP-01…10.
- **GAP-5 — No Parse-plugin test.** `parse.client.ts` init + single hydrate is
  uncovered (PLUG-01…03).
- **GAP-6 — No E2E for auth flows.** Only `_example.spec.ts` exists. Add
  `tests/e2e/auth.spec.ts` for E2E-02…15. Most critical: E2E-05 (`next`
  round-trip), E2E-07 (anon bounce), E2E-10 (logout revoke), E2E-11 (expired
  session), E2E-15 (open-redirect blocked).
- **GAP-7 — Session-guard unit coverage.** `utils/sessionGuard.client.js`
  (`validateSession`, `purgeSession`, in-flight de-dup, `Parse/*` key purge,
  500ms logout race) has no tests. Add a happy-dom unit file; these underpin
  STORE-09/10 and E2E-10/11.
- **GAP-8 — Half-built-tenant cleanup (INT-13) unverified.** The `catch` cleanup
  in `signUpWithOrg` is never triggered by a test. Add a fault-injection
  integration test (e.g. a cloud override that throws after user creation) or
  document as accepted risk.
- **GAP-9 — Marketing homepage has no component test** beyond the E2E title
  check. Add HOME-01…03, especially the boundary assertion (no `stores/`
  import) which protects the marketing/app wall.
- **GAP-10 — `become` in node vs browser.** Integration tests cannot cover
  `stores/auth.js` `signup` because `Parse.User.become` is blocked server-side;
  that path is only reachable via E2E-02. Keep the store-level `become` behind a
  mock (STORE-08) and rely on E2E-02 for the real path. Document so no one tries
  to add a node integration test for it.

## 6. Test data & fixtures

**Credentials / shape**
- Standard test password: `hunter2hunter2` (server integration, matches
  `tenancy.test.ts`) and `test-password-1234` (Playwright `freshUser`).
- Standard signup params: `{ username, password, email, name, company }`. The
  UI sets `username === email` (trimmed). Use distinct, namespaced emails to
  avoid the 202 dedupe across runs.

**Unique-email generator (avoid dup-202 collisions on shared dev Mongo):**
`t_${Date.now()}_${Math.random().toString(36).slice(2,8)}@test.gorilla.local`
(same scheme as `playwrightFixtures.ts`).

**Integration layer (`tests/server/*`)**
- `startTestParseServer()` → `{ Parse, baseURL, stop }`. Fresh in-memory Mongo
  per file; loads `server/cloud/main.js`. `beforeAll` start, `afterAll` stop.
- Act-as-user: pass `{ sessionToken }` from `signUpWithOrg` into every
  query/save/`Cloud.run`. **Never** `Parse.User.become` here (blocked).
- Reusable helper: a `signUp(params)` wrapper that returns
  `{ sessionToken, userId, orgId, orgName }` (copy from `tenancy.test.ts`).

**Component layer (`tests/components/*`, happy-dom)**
- `// @vitest-environment happy-dom` header is mandatory.
- `mountWithPinia(Component, { props, global })` for a fresh Pinia per test.
- Mock Nuxt auto-imports the pages use: `navigateTo`, `useRoute` (control
  `query.next`), `definePageMeta`, `useHead`, `ref`/`computed` (auto in Vue).
  Stub the auth store action under test as a spy (`vi.fn()`); assert call args.
- Stub child components: `FormField`, `TextInput`, `Button`, `Checkbox`,
  `NuxtLink`, `Icon` — or shallow-mount — so tests assert behavior, not child
  internals. Selectors to lean on: `.form-error[role="alert"]`, inputs by
  `id="email"` / `id="password"`, submit via `form.@submit`.

**Unit layer (store / guards / plugin)**
- Mock `parse`: `Parse.User.{logIn,current,become,logOut}`, `Parse.Cloud.run`,
  `Parse.initialize`, `Parse.serverURL` as `vi.fn()`/stubs. Mock
  `~/utils/sessionGuard.client` (`purgeSession`, `markSessionInvalid`) as spies.
- Guards: build a fake `to` (`{ fullPath }`) and toggle
  `vi.stubGlobal("navigateTo", fn)`; control `import.meta.server` and the store's
  `isAuthenticated`.

**E2E layer (`tests/e2e/*`)**
- `import { test, expect } from "../setup/playwrightFixtures"` for `freshUser`
  (REST-provisioned, master-key teardown). Requires `npm run dev` up (Playwright
  `webServer` handles this) and dev Mongo at `mongodb://localhost:27017/gorilla`.
- For login specs, provision with `freshUser` (fast) and drive only the login
  UI; reserve the full signup UI flow for E2E-02/03.
- For expired-session (E2E-11): after login, revoke the session server-side
  (delete the `_Session` row via master-key REST) or clear/corrupt the
  `Parse/<appId>/currentUser` localStorage entry, then navigate.
- Cleanup is best-effort in fixtures; any directly-created users/orgs in a spec
  should be torn down with the master key read from `server/local.env`.
