// Playwright `test` extended with two fixtures:
//
//   freshUser — creates a bare Parse user via REST (POST /api/users). No org.
//               Authed cloud functions that call getUserOrg reject this user,
//               so it's only useful for unauthed / signup-form specs.
//
//   orgUser   — creates a User + Organization via the `signUpWithOrg` cloud
//               function (POST /api/functions/signUpWithOrg) and then seeds the
//               browser's localStorage with the Parse "current user" blob so the
//               app boots already logged-in. This is what unblocks authed E2E.
//
// Why REST not UI: the signup form is the product under test elsewhere.
// Hitting it from every spec is 100x slower and would cascade-fail
// unrelated tests whenever the signup UI is in flux.
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const APP_ID = process.env.PARSE_APP_ID || "gorilla";
// The web origin proxies /api/** to Parse, so a single base covers both the
// page navigation and the REST calls. Defaults to the running dev server.
const WEB_BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const API_BASE = process.env.PARSE_SERVER_URL || `${WEB_BASE}/api`;

// Master key for teardown. Tests are dev-only so reading the dev env file
// is fine — never call this fixture in prod.
function readMasterKey(): string {
  if (process.env.PARSE_MASTER_KEY) return process.env.PARSE_MASTER_KEY;
  const envPath = path.resolve(__dirname, "../../server/local.env");
  const txt = fs.readFileSync(envPath, "utf8");
  const m = txt.match(/^PARSE_MASTER_KEY=(.+)$/m);
  if (!m) throw new Error("PARSE_MASTER_KEY not found in env or server/local.env");
  return m[1].trim();
}

export interface FreshUser {
  username: string;
  password: string;
  sessionToken: string;
  objectId: string;
}

export interface OrgUser {
  username: string;
  password: string;
  email: string;
  company: string;
  name: string;
  sessionToken: string;
  objectId: string; // the _User objectId
  orgId: string;
  orgName: string;
}

async function createUser(request: APIRequestContext): Promise<FreshUser> {
  const username = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const password = "test-password-1234";
  const res = await request.post(`${API_BASE}/users`, {
    headers: { "X-Parse-Application-Id": APP_ID, "Content-Type": "application/json" },
    data: { username, password, email: `${username}@test.gorilla.local` },
  });
  expect(res.ok(), `signup failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return { username, password, sessionToken: body.sessionToken, objectId: body.objectId };
}

async function deleteUser(request: APIRequestContext, objectId: string) {
  await request.delete(`${API_BASE}/users/${objectId}`, {
    headers: { "X-Parse-Application-Id": APP_ID, "X-Parse-Master-Key": readMasterKey() },
  });
}

// Creates a User + Organization via the signUpWithOrg cloud function.
// Returns the session token + ids the test needs.
async function createOrgUser(request: APIRequestContext): Promise<OrgUser> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const username = `org_${stamp}`;
  const password = "test-password-1234";
  const email = `${username}@test.gorilla.local`;
  const company = `Co ${stamp}`;
  const name = `Test ${stamp}`;
  const res = await request.post(`${API_BASE}/functions/signUpWithOrg`, {
    headers: { "X-Parse-Application-Id": APP_ID, "Content-Type": "application/json" },
    data: { username, password, email, name, company },
  });
  expect(res.ok(), `signUpWithOrg failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const r = body.result;
  expect(r?.sessionToken, `no sessionToken in response: ${JSON.stringify(body)}`).toBeTruthy();
  return {
    username,
    password,
    email,
    company,
    name,
    sessionToken: r.sessionToken,
    objectId: r.userId,
    orgId: r.orgId,
    orgName: r.orgName,
  };
}

// Seeds the Parse JS SDK "current user" entry in the page's localStorage so the
// app boots authenticated. The Parse SDK reads localStorage key
// `Parse/<appId>/currentUser` synchronously on Parse.User.current() and rebuilds
// the user via ParseObject.fromJSON. It needs at minimum objectId, sessionToken,
// className ("_User") and username — see node_modules/parse ParseUser.js
// DefaultController.currentUser(). We write exactly the shape user.toJSON()
// produces (Storage.generatePath -> "Parse/" + APPLICATION_ID + "/currentUser").
async function seedCurrentUser(page: Page, user: OrgUser) {
  // Must navigate to the app origin first so localStorage is same-origin.
  await page.goto("/");
  await page.evaluate(
    ({ appId, blob }) => {
      window.localStorage.setItem(`Parse/${appId}/currentUser`, JSON.stringify(blob));
    },
    {
      appId: APP_ID,
      blob: {
        objectId: user.objectId,
        username: user.username,
        email: user.email,
        name: user.name,
        sessionToken: user.sessionToken,
        className: "_User",
      },
    },
  );
  // Reload so plugins/parse.client.ts initializes the SDK, Parse.User.current()
  // reads the seeded blob, and useAuthStore().hydrateFromParse() picks it up.
  await page.reload();
}

interface Fixtures {
  freshUser: FreshUser;
  orgUser: OrgUser;
}

export const test = base.extend<Fixtures>({
  freshUser: async ({ request }, use) => {
    const user = await createUser(request);
    await use(user);
    await deleteUser(request, user.objectId).catch(() => {}); // teardown is best-effort
  },

  // Authenticated org user. After this fixture resolves, `page` has the Parse
  // session seeded in localStorage; navigate to /app/* and the app is logged in.
  orgUser: async ({ request, page }, use) => {
    const user = await createOrgUser(request);
    await seedCurrentUser(page, user);
    await use(user);
    await deleteUser(request, user.objectId).catch(() => {}); // best-effort
  },
});

export { expect };
