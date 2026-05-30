// Signup-forms tests. Two surfaces:
//   1. Cloud functions (createForm/listForms/getForm/updateForm/deleteForm) —
//      org-scoped CRUD, run as a signed-up user (mirrors segments.test.ts).
//   2. Public Express routes (GET/POST /f/:formId, GET /f/confirm/:token) —
//      booted into a tiny Express app and hit over node http (mirrors
//      tracking.test.ts). Fixtures created with the master key.
//
// Covers (per spec): submit creates a subscribed contact + consent; double
// opt-in flow (pending → confirm → subscribed); honeypot rejects; merge with an
// existing contact.
import http from "node:http";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const require = createRequire(import.meta.url);

// ── tiny http helper: returns { status, headers, body } without following 302 ──
function hit(
  port: number,
  method: string,
  path: string,
  opts: { body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (opts.body != null) req.write(opts.body);
    req.end();
  });
}

function form(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

describe("signup forms", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let formsRoute: any;
  let trackingTokens: any;
  let server: http.Server;
  let port: number;

  let session: string;
  let listId: string;

  const MK = { useMasterKey: true } as const;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    formsRoute = require("../../server/routes/forms");
    trackingTokens = require("../../server/lib/trackingTokens");

    // A signed-up user/org we build the cloud-fn fixtures under.
    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "forms-owner@example.com",
      password: "hunter2hunter2",
      company: "FormCo",
    })) as { sessionToken: string };
    session = r.sessionToken;

    // A target audience for the form.
    const created = (await Parse.Cloud.run(
      "createAudience",
      { name: "Newsletter" },
      { sessionToken: session },
    )) as { id: string };
    listId = created.id;

    // Boot a tiny Express app with just the forms routes mounted.
    const app = express();
    app.set("trust proxy", true);
    formsRoute.mount(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    port = addr.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.stop();
  });

  const run = (name: string, params: Record<string, unknown>) =>
    Parse.Cloud.run(name, params, { sessionToken: session });

  // ── cloud-fn CRUD ──────────────────────────────────────────────────────────
  describe("cloud functions", () => {
    let createdId: string;

    it("createForm sets org + ACL and returns the form", async () => {
      const f = (await run("createForm", {
        name: "Footer signup",
        targetListId: listId,
        doubleOptIn: false,
        fields: [
          { key: "email", label: "Email", type: "email", required: true },
          { key: "firstName", label: "First name", type: "text" },
        ],
      })) as any;
      createdId = f.id;
      expect(f.id).toBeTruthy();
      expect(f.name).toBe("Footer signup");
      expect(f.targetListId).toBe(listId);
      // Email field is always guaranteed.
      expect(f.fields.some((x: any) => x.key === "email")).toBe(true);

      // Verify org + a non-public ACL were stamped (master-key read).
      const raw = await new Parse.Query("Form").get(createdId, MK);
      expect(raw.get("organization")).toBeTruthy();
      const acl = raw.getACL();
      expect(acl).toBeTruthy();
      expect(acl!.getPublicReadAccess()).toBe(false);
    });

    it("listForms returns the org's forms", async () => {
      const res = (await run("listForms", {})) as { rows: any[] };
      expect(res.rows.length).toBeGreaterThan(0);
      expect(res.rows.some((x) => x.id === createdId)).toBe(true);
    });

    it("getForm returns one form; updateForm patches it", async () => {
      const got = (await run("getForm", { id: createdId })) as any;
      expect(got.id).toBe(createdId);

      const upd = (await run("updateForm", {
        id: createdId,
        patch: { name: "Renamed", doubleOptIn: true },
      })) as any;
      expect(upd.name).toBe("Renamed");
      expect(upd.doubleOptIn).toBe(true);
    });

    it("deleteForm removes it", async () => {
      const del = (await run("deleteForm", { id: createdId })) as any;
      expect(del.ok).toBe(true);
      await expect(run("getForm", { id: createdId })).rejects.toBeTruthy();
    });

    it("another org cannot read this org's form", async () => {
      const f = (await run("createForm", { name: "Private form" })) as any;
      const other = (await Parse.Cloud.run("signUpWithOrg", {
        username: "other-forms@example.com",
        password: "hunter2hunter2",
        company: "OtherCo",
      })) as { sessionToken: string };
      await expect(
        Parse.Cloud.run("getForm", { id: f.id }, { sessionToken: other.sessionToken }),
      ).rejects.toBeTruthy();
    });
  });

  // ── public routes ──────────────────────────────────────────────────────────
  // Build forms with the cloud fn (so org + ACL are correct), then hit the
  // public endpoints over http.
  async function makeForm(attrs: Record<string, unknown>): Promise<string> {
    const f = (await run("createForm", attrs)) as { id: string };
    return f.id;
  }

  async function findContact(email: string) {
    const q = new Parse.Query("Contact");
    q.equalTo("email", email.toLowerCase());
    return q.first(MK);
  }

  async function countSubmissions(formId: string) {
    const q = new Parse.Query("FormSubmission");
    q.equalTo(
      "form",
      Parse.Object.extend("Form").createWithoutData(formId),
    );
    return q.count(MK);
  }

  describe("GET /f/:formId", () => {
    it("renders the hosted form with the email input + honeypot", async () => {
      const id = await makeForm({ name: "Render me", targetListId: listId });
      const res = await hit(port, "GET", `/f/${id}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/html/);
      expect(res.body).toContain('name="email"');
      // Honeypot field present.
      expect(res.body).toContain(`name="${formsRoute.HONEYPOT}"`);
    });

    it("404s an unknown form", async () => {
      const res = await hit(port, "GET", "/f/doesnotexist");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /f/:formId/embed.js", () => {
    it("serves an iframe-injecting snippet", async () => {
      const id = await makeForm({ name: "Embed me" });
      const res = await hit(port, "GET", `/f/${id}/embed.js`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/javascript/);
      expect(res.body).toContain("iframe");
      expect(res.body).toContain(`/f/${id}`);
    });
  });

  describe("POST /f/:formId — single opt-in", () => {
    beforeAll(() => formsRoute.resetRateLimit());

    it("creates a SUBSCRIBED contact with signup_form consent + a submission", async () => {
      const id = await makeForm({
        name: "Single optin",
        targetListId: listId,
        doubleOptIn: false,
      });
      const email = "single@example.com";
      const res = await hit(port, "POST", `/f/${id}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ email, firstName: "Sam" }),
      });
      expect(res.status).toBe(200);
      expect(res.body.toLowerCase()).toContain("thank");

      const c = await findContact(email);
      expect(c).toBeTruthy();
      expect(c!.get("status")).toBe("subscribed");
      expect(c!.get("firstName")).toBe("Sam");
      const consent = c!.get("consent");
      expect(consent.source).toBe("signup_form");
      expect(consent.formId).toBe(id);
      expect(consent.capturedAt).toBeTruthy();
      // Added to the target list.
      expect(c!.get("lists")).toContain(listId);

      expect(await countSubmissions(id)).toBe(1);
    });

    it("merges onto an existing contact rather than duplicating", async () => {
      const email = "merge@example.com";
      // Seed an existing contact via the same form first.
      const id = await makeForm({ name: "Merge form", targetListId: listId });
      await hit(port, "POST", `/f/${id}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ email, firstName: "First" }),
      });
      // Submit again with a different name.
      await hit(port, "POST", `/f/${id}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ email, firstName: "Second" }),
      });
      const q = new Parse.Query("Contact");
      q.equalTo("email", email);
      const rows = await q.find(MK);
      expect(rows.length).toBe(1);
      expect(rows[0].get("firstName")).toBe("Second");
    });

    it("rejects an invalid email", async () => {
      const id = await makeForm({ name: "Bad email form" });
      const res = await hit(port, "POST", `/f/${id}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ email: "not-an-email" }),
      });
      expect(res.status).toBe(400);
    });

    it("redirects to redirectUrl when configured", async () => {
      const id = await makeForm({
        name: "Redirect form",
        redirectUrl: "https://example.com/thanks",
      });
      const res = await hit(port, "POST", `/f/${id}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ email: "redir@example.com" }),
      });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("https://example.com/thanks");
    });
  });

  describe("honeypot", () => {
    beforeAll(() => formsRoute.resetRateLimit());

    it("a filled honeypot returns 200 but creates NO contact", async () => {
      const id = await makeForm({ name: "Honeypot form" });
      const email = "bot@example.com";
      const res = await hit(port, "POST", `/f/${id}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ email, [formsRoute.HONEYPOT]: "http://spam.example" }),
      });
      expect(res.status).toBe(200);
      const c = await findContact(email);
      expect(c).toBeFalsy();
    });
  });

  describe("double opt-in flow", () => {
    beforeAll(() => formsRoute.resetRateLimit());

    it("submit → pending; confirm token → subscribed", async () => {
      const id = await makeForm({
        name: "Double optin",
        targetListId: listId,
        doubleOptIn: true,
      });
      const email = "doi@example.com";
      const res = await hit(port, "POST", `/f/${id}`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ email }),
      });
      expect(res.status).toBe(200);

      // Contact starts pending.
      const c = await findContact(email);
      expect(c).toBeTruthy();
      expect(c!.get("status")).toBe("pending");

      // Mint the confirm token (same helper the route uses) + confirm.
      const token = formsRoute.confirmToken(c!.id, id);
      const confirmRes = await hit(
        port,
        "GET",
        `/f/confirm/${encodeURIComponent(token)}`,
      );
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.toLowerCase()).toContain("subscrib");

      await c!.fetch(MK);
      expect(c!.get("status")).toBe("subscribed");
    });

    it("an invalid/tampered confirm token is rejected", async () => {
      const res = await hit(port, "GET", "/f/confirm/not.a.valid.token");
      expect(res.status).toBe(400);
    });

    it("a forged token type is rejected", async () => {
      // A validly-signed token but with the wrong discriminator.
      const bad = trackingTokens.signToken({ t: "o", sendId: "x" });
      const res = await hit(
        port,
        "GET",
        `/f/confirm/${encodeURIComponent(bad)}`,
      );
      expect(res.status).toBe(400);
    });
  });
});
