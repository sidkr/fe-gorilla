// Playwright `test` extended with a `freshUser` fixture that creates a Parse
// user via the REST API (POST /api/users) and deletes them on teardown.
//
// Why REST not UI: the signup form is the product under test elsewhere.
// Hitting it from every spec is 100x slower and would cascade-fail
// unrelated tests whenever the signup UI is in flux.
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const APP_ID = process.env.PARSE_APP_ID || "gorilla";
const API_BASE = process.env.PARSE_SERVER_URL || "http://localhost:8080/api";

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

async function deleteUser(request: APIRequestContext, user: FreshUser) {
  await request.delete(`${API_BASE}/users/${user.objectId}`, {
    headers: { "X-Parse-Application-Id": APP_ID, "X-Parse-Master-Key": readMasterKey() },
  });
}

export const test = base.extend<{ freshUser: FreshUser }>({
  freshUser: async ({ request }, use) => {
    const user = await createUser(request);
    await use(user);
    await deleteUser(request, user).catch(() => {}); // teardown is best-effort
  },
});

export { expect };
