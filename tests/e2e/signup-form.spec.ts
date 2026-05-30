// Hosted signup form + double-opt-in journey (docs/testing/e2e.md §6.2).
//
// Walks the full public-flow span the server-only tests can't prove end to end:
//
//   AUTHED (orgUser):  /app/forms → create + publish a form (fields, target
//                      audience, double-opt-in ON) through the real builder UI.
//   PUBLIC  (fresh, UNauthenticated browser context — a real visitor):
//                      GET /f/:id → fill email + name → submit → "check your
//                      inbox" → pull the confirm token from the MockSentMessage
//                      outbox (REST + master key) → GET /f/confirm/:token →
//                      "you're subscribed".
//   BACKEND:           Contact exists pending → subscribed after confirm;
//                      consent references the form; contact is in the form's
//                      target audience; GET /f/:id/embed.js serves JavaScript.
//
// Why a fresh context for the public steps: the visitor must be truly
// unauthenticated. The orgUser fixture seeds a Parse session into the default
// `page`'s localStorage; a brand-new browser.newContext() shares none of that.
//
// How the confirm token is obtained: server/routes/forms.js sends the
// double-opt-in email through the mock SES adapter (server/lib/ses/mock.js),
// which persists a MockSentMessage row (global, master-key-only store) carrying
// `to` (visitor email) and `html` (the rendered email, including the
// `/f/confirm/<token>` link). We query that store over REST with the master key,
// take the newest message to the visitor, and regex the confirm URL out of the
// HTML. The master key is read from server/local.env and NEVER printed.
//
// Run ONLY this file (don't boot a second dev server):
//   PATH=".../v20/bin:$PATH" npx playwright test tests/e2e/signup-form.spec.ts --workers=1

import { test, expect } from "../setup/playwrightFixtures";
import type { APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const APP_ID = process.env.PARSE_APP_ID || "gorilla";

// Real cloud round-trips against the shared dev stack (create audience + form,
// public submit, mock-SES email persist) plus the fixture's org seed/reload —
// give the whole describe generous headroom.
test.describe.configure({ mode: "serial", timeout: 180_000 });

function uniq(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Master key for the privileged outbox + backend-assertion reads. Dev-only;
// read from server/local.env exactly like the fixture does. NEVER logged.
function readMasterKey(): string {
  if (process.env.PARSE_MASTER_KEY) return process.env.PARSE_MASTER_KEY;
  // Playwright runs from the repo root; resolve server/local.env from cwd
  // (avoids __dirname, which isn't defined under the ESM test loader).
  const envPath = path.resolve(process.cwd(), "server/local.env");
  const txt = fs.readFileSync(envPath, "utf8");
  const m = txt.match(/^PARSE_MASTER_KEY=(.+)$/m);
  if (!m) throw new Error("PARSE_MASTER_KEY not found in env or server/local.env");
  return m[1].trim();
}

function mkHeaders() {
  return {
    "X-Parse-Application-Id": APP_ID,
    "X-Parse-Master-Key": readMasterKey(),
  };
}

// Create the target audience over REST (it's not the surface under test, so we
// don't drive the audiences UI). Returns the List objectId — this is the value
// stored as the form's `targetListId` and, on submit, pushed into Contact.lists.
async function createAudienceViaRest(
  request: APIRequestContext,
  sessionToken: string,
  name: string,
): Promise<string> {
  const res = await request.post(`/api/functions/createAudience`, {
    headers: {
      "X-Parse-Application-Id": APP_ID,
      "X-Parse-Session-Token": sessionToken,
      "Content-Type": "application/json",
    },
    data: { name },
  });
  expect(res.ok(), `createAudience failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const id = body?.result?.id;
  expect(id, `no audience id in response: ${JSON.stringify(body)}`).toBeTruthy();
  return id;
}

// Pull the newest double-opt-in email to `email` from the mock outbox and
// extract the /f/confirm/<token> URL from its HTML. Polls because the email is
// sent fire-and-forget after the POST /f/:id response returns.
async function fetchConfirmToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const where = encodeURIComponent(JSON.stringify({ to: email }));
  let token = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `/api/classes/MockSentMessage?where=${where}&order=-sentAt&limit=1`,
          { headers: mkHeaders() },
        );
        if (!res.ok()) return "";
        const body = await res.json();
        const html = body?.results?.[0]?.html || "";
        // The confirm link is /f/confirm/<token>; the token is HMAC-signed and
        // url-encoded into the path. Grab everything up to the closing quote.
        const m = String(html).match(/\/f\/confirm\/([^"'\s<>]+)/);
        token = m ? m[1] : "";
        return token;
      },
      {
        timeout: 30_000,
        message: "confirm email never landed in the MockSentMessage outbox",
      },
    )
    .not.toBe("");
  return token;
}

// Read a single Contact for (org-less query is fine — email is unique per org and
// we use a fresh namespaced email) via master key. Returns the raw Parse JSON.
async function fetchContactByEmail(
  request: APIRequestContext,
  email: string,
): Promise<any | null> {
  const where = encodeURIComponent(JSON.stringify({ email }));
  const res = await request.get(
    `/api/classes/Contact?where=${where}&order=-createdAt&limit=1`,
    { headers: mkHeaders() },
  );
  if (!res.ok()) return null;
  const body = await res.json();
  return body?.results?.[0] || null;
}

test("hosted signup form + double-opt-in: authed setup → public submit → confirm → backend effect", async ({
  page,
  request,
  orgUser,
}) => {
  // ── Step 1 · AUTHED setup: create + publish a form ─────────────────────────
  // The orgUser fixture already seeded the Parse session in localStorage.

  // Target audience first (over REST — not the surface under test). It must
  // exist before the builder loads so it shows up in the "Target audience"
  // dropdown, and its id is what lands in Contact.lists on submit.
  const audienceName = uniq("Newsletter");
  const audienceId = await createAudienceViaRest(
    request,
    orgUser.sessionToken,
    audienceName,
  );

  await page.goto("/app/forms");
  await expect(page.getByRole("heading", { name: "Signup forms", level: 1 })).toBeVisible({
    timeout: 20_000,
  });

  // Create the form via the header CTA + modal.
  const formName = uniq("Newsletter form");
  await page.getByRole("button", { name: "New form" }).click();
  const createInput = page.getByPlaceholder("Newsletter signup");
  await expect(createInput).toBeVisible({ timeout: 10_000 });
  await createInput.fill(formName);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // createForm navigates to the builder /app/forms/<id>.
  await expect(page).toHaveURL(/\/app\/forms\/[^/]+$/, { timeout: 20_000 });
  const formId = page.url().split("/").pop() as string;
  expect(formId, "could not capture the form id from the URL").toBeTruthy();

  // Builder loaded (audiences + form fetched).
  await expect(page.getByRole("heading", { name: formName, level: 1 })).toBeVisible({
    timeout: 20_000,
  });

  // Set the target audience (the form's `targetListId`).
  await page.locator("#b-list").selectOption({ label: audienceName });

  // Configure fields: the default `email` row exists; add a `firstName` row so
  // the visitor can supply a name and the merge lands on Contact.firstName.
  await page.getByRole("button", { name: "+ Add field" }).click();
  const fieldRows = page.locator(".field-row");
  const newRow = fieldRows.last();
  await newRow.locator('input[placeholder="key"]').fill("firstName");
  await newRow.locator('input[placeholder="Label"]').fill("First name");
  // type defaults to "text"; leave it. Leave `required` off so a missing name
  // never blocks the journey — the email field is the one that matters.

  // Double opt-in ON — the whole point of this journey.
  await page.getByText("Require double opt-in (email confirmation)").click();

  // Publish = save with status Active (the default for a freshly-created form).
  await expect(page.locator("#b-status")).toHaveValue("active");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // The Save button flips to "Saved ✓" on success.
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible({ timeout: 15_000 });

  // Sanity-check the persisted form over REST: double-opt-in on, audience wired,
  // firstName field present. (Proves the publish actually stuck server-side.)
  {
    const res = await request.get(`/api/classes/Form/${formId}`, { headers: mkHeaders() });
    expect(res.ok()).toBeTruthy();
    const form = await res.json();
    expect(form.doubleOptIn).toBe(true);
    expect(form.targetListId).toBe(audienceId);
    expect(form.status).toBe("active");
    expect((form.fields || []).map((f: any) => f.key)).toContain("firstName");
  }

  // ── Step 2 · PUBLIC visitor in a fresh, UNauthenticated browser context ────
  const visitorEmail = `${uniq("visitor")}@test.gorilla.local`;
  const visitorName = "Pat Visitor";
  const context = await page.context().browser()!.newContext();
  const visitor = await context.newPage();
  try {
    // GET /f/:id renders the hosted form (Express, server-rendered, no auth).
    await visitor.goto(`/f/${formId}`);
    await expect(visitor.getByRole("heading", { name: formName })).toBeVisible({
      timeout: 15_000,
    });

    // Fill email + name. The form inputs are name-attributed by field key.
    await visitor.locator('input[name="email"]').fill(visitorEmail);
    await visitor.locator('input[name="firstName"]').fill(visitorName);
    await visitor.getByRole("button", { name: "Subscribe" }).click();

    // Double opt-in → the "check your inbox / confirm" thank-you page.
    await expect(
      visitor.getByText(/check your inbox to confirm your subscription/i),
    ).toBeVisible({ timeout: 15_000 });

    // ── Pull the confirm token from the mock outbox (REST + master key) ──────
    const token = await fetchConfirmToken(request, visitorEmail);
    expect(token, "no confirm token extracted from the outbox email").toBeTruthy();

    // Backend effect BEFORE confirm: Contact exists, status pending, consent
    // references the form, and it's already in the form's target audience.
    const before = await fetchContactByEmail(request, visitorEmail);
    expect(before, "Contact not created on submit").toBeTruthy();
    expect(before.status).toBe("pending");
    expect(before.firstName).toBe(visitorName);
    // consent: { source: "signup_form", capturedAt, formId } (forms.js upsert).
    expect(before.consent?.source).toBe("signup_form");
    expect(before.consent?.formId).toBe(formId);
    // The form's target audience id lands in Contact.lists.
    expect(before.lists || []).toContain(audienceId);

    // ── GET /f/confirm/:token → "you're subscribed" ─────────────────────────
    await visitor.goto(`/f/confirm/${token}`);
    await expect(visitor.getByRole("heading", { name: /you're subscribed/i })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await context.close();
  }

  // ── Step 3 · Backend effect AFTER confirm + embed.js ───────────────────────
  // Contact flipped pending → subscribed; consent + audience membership intact.
  const after = await fetchContactByEmail(request, visitorEmail);
  expect(after, "Contact missing after confirm").toBeTruthy();
  expect(after.status).toBe("subscribed");
  expect(after.consent?.formId).toBe(formId);
  expect(after.lists || []).toContain(audienceId);

  // embed.js serves JavaScript (200, JS-ish content-type, real script body).
  {
    const res = await request.get(`/f/${formId}/embed.js`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"] || "").toMatch(/javascript/);
    const body = await res.text();
    expect(body).toMatch(/createElement\('iframe'\)/);
    expect(body).toContain(`/f/${formId}`);
  }

  // Authed-side denormalized counter: the form's submissionCount incremented.
  {
    const res = await request.get(`/api/classes/Form/${formId}`, { headers: mkHeaders() });
    expect(res.ok()).toBeTruthy();
    const form = await res.json();
    expect(form.submissionCount).toBeGreaterThanOrEqual(1);
  }

  // Best-effort teardown of the public Contact we created (the org/user is torn
  // down by the orgUser fixture).
  if (after?.objectId) {
    await request
      .delete(`/api/classes/Contact/${after.objectId}`, { headers: mkHeaders() })
      .catch(() => {});
  }
});
