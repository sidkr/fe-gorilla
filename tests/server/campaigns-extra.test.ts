// Additional Campaign cloud + compileBlocks coverage — the P0/P1 server cases
// from docs/testing/campaigns-editor.md not already covered by
// tests/server/campaigns.test.ts. Runs against a real Parse Server v7 +
// in-memory Mongo (one process per file via pool: forks).
//
// Covers, mapped to the doc's case IDs:
//   compileBlocks — CB-02 (level→size + clamp), CB-03 (paragraph escaping),
//     CB-04 (image + link), CB-05 (image no-src skipped), CB-06 (button),
//     CB-07 (divider+spacer), CB-08 (footer unsubscribe default-on),
//     CB-09 (web-version optional), CB-10 (unsubscribe explicit-off),
//     CB-11 (bodyBg validation/injection), CB-13 (malformed/unknown degrade),
//     CB-16 (recompile when compiledHtml missing), CB-17 (no body no-op).
//   CRUD/status-guard — CR-08/09 (getCampaign missing/unauth),
//     CR-11/12/13/14 (duplicate deep-clone / drops stats / any status / x-org),
//     CR-17 (archive of archived no-op), CR-21 (rename sending/archived),
//     CR-25/26/27/30 (update edge inputs), CR-28 (update rejects archived),
//     CR-32 (delete hard-destroys scheduled/paused/archived),
//     CR-35 (delete x-org), CR-37 (unauth mutation).
//   New-draft — NW-01 (CAN-SPAM-ready default body → {{unsubscribeUrl}}).
//   Tenant — TN-02 (audience name resolution is org-scoped).
//
// Per tenancy: Parse.User.become() is blocked server-side; act as a user by
// passing { sessionToken } to every save/query/Cloud.run. Read back with
// { useMasterKey: true } to assert persisted state regardless of ACL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";
import { makeDefaultBody } from "../../components/app/editor/blocks/registry";

describe("campaigns cloud + compileBlocks (extra coverage)", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function signUp(company: string) {
    const username = `${company.toLowerCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@example.com`;
    return Parse.Cloud.run("signUpWithOrg", {
      username,
      password: "hunter2hunter2",
      company,
    }) as Promise<{ sessionToken: string; userId: string; orgId: string }>;
  }

  // Save a campaign with the given body (and optional extra fields) as a user,
  // then read it back with the master key and return the compiledHtml.
  async function compileWith(
    sessionToken: string,
    body: unknown,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Compile fixture");
    c.set("status", "draft");
    c.set("body", body);
    for (const [k, v] of Object.entries(extra)) c.set(k, v);
    await c.save(null, { sessionToken });
    const fetched = await new Parse.Query(Campaign).get(c.id, {
      useMasterKey: true,
    });
    return fetched.get("compiledHtml") as string;
  }

  function bodyOf(...blocks: any[]) {
    return { version: 1, blocks };
  }

  // ── compileBlocks: per-block breadth ──────────────────────────────────────

  it("CB-02: heading level maps to size and clamps out-of-range to h1/28px", async () => {
    const u = await signUp("HeadingSizeCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf(
        { id: "h1", type: "heading", props: { text: "Level one", level: 1 } },
        { id: "h2", type: "heading", props: { text: "Level two", level: 2 } },
        { id: "h3", type: "heading", props: { text: "Level three", level: 3 } },
        { id: "h5", type: "heading", props: { text: "Out of range", level: 5 } },
      ),
    );
    // MJML emits font-size on the rendered element; assert each size lands.
    expect(html).toContain("28px"); // level 1
    expect(html).toContain("22px"); // level 2
    expect(html).toContain("18px"); // level 3
    expect(html).toContain("Level one");
    expect(html).toContain("Out of range");
    // The out-of-range heading is rendered as an <h1> (clamped), not <h5>.
    expect(html).not.toContain("<h5");
  });

  it("CB-03: paragraph escapes markup (injection guard), never emits a live tag", async () => {
    const u = await signUp("EscapeCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf({
        id: "p1",
        type: "paragraph",
        props: { html: '<script>alert(1)</script> a & b <b>x</b>' },
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    // No live script/bold tag from the user content survived.
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>x</b>");
  });

  it("CB-04: image renders src/alt/width and wraps in href when linkHref set", async () => {
    const u = await signUp("ImageLinkCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf({
        id: "img1",
        type: "image",
        props: {
          src: "https://cdn.example.com/pic.png",
          alt: "A picture",
          width: 480,
          linkHref: "https://example.com/go",
        },
      }),
    );
    expect(html).toContain("https://cdn.example.com/pic.png");
    expect(html).toContain("A picture");
    expect(html).toContain("https://example.com/go");
  });

  it("CB-05: image with no src is skipped but other blocks still render", async () => {
    const u = await signUp("ImageNoSrcCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf(
        { id: "img1", type: "image", props: { src: "", alt: "nope" } },
        { id: "h1", type: "heading", props: { text: "Still here", level: 1 } },
      ),
    );
    expect(html).toContain("Still here");
    expect(html).not.toContain("nope");
    expect(html).not.toContain("<img"); // empty image produced no <mj-image>
  });

  it("CB-06: button renders bg/fg/href/radius and the label", async () => {
    const u = await signUp("ButtonCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf({
        id: "btn",
        type: "button",
        props: {
          label: "Buy now",
          href: "https://shop.example.com",
          bg: "#112233",
          fg: "#FFEECC",
          radius: 7,
        },
      }),
    );
    expect(html).toContain("Buy now");
    expect(html).toContain("https://shop.example.com");
    expect(html.toLowerCase()).toContain("#112233");
    expect(html.toLowerCase()).toContain("#ffeecc");
    expect(html).toContain("7px");
  });

  it("CB-07: divider and spacer render with numeric dimensions", async () => {
    const u = await signUp("DividerSpacerCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf(
        { id: "d1", type: "divider", props: { color: "#ABCDEF", thickness: 3 } },
        { id: "s1", type: "spacer", props: { height: 40 } },
      ),
    );
    expect(html).toContain("3px"); // divider border width
    expect(html).toContain("40px"); // spacer height
    expect(html.toLowerCase()).toContain("#abcdef");
  });

  it("CB-08: footer defaults unsubscribe ON when showUnsubscribe is absent (CAN-SPAM)", async () => {
    const u = await signUp("FooterDefaultCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf({
        id: "ft",
        type: "footer",
        props: { businessAddress: "1 Main St" },
      }),
    );
    expect(html).toContain("{{unsubscribeUrl}}");
    expect(html).toContain("1 Main St");
  });

  it("CB-09: footer web-version link only when showWebVersion is true; unsubscribe preserved", async () => {
    const u = await signUp("FooterWebCo");
    const on = await compileWith(
      u.sessionToken,
      bodyOf({
        id: "ft",
        type: "footer",
        props: { businessAddress: "addr", showWebVersion: true },
      }),
    );
    expect(on).toContain("{{webVersionUrl}}");
    expect(on).toContain("{{unsubscribeUrl}}");

    const off = await compileWith(
      u.sessionToken,
      bodyOf({
        id: "ft",
        type: "footer",
        props: { businessAddress: "addr", showWebVersion: false },
      }),
    );
    expect(off).not.toContain("{{webVersionUrl}}");
    expect(off).toContain("{{unsubscribeUrl}}");
  });

  it("CB-10: footer unsubscribe explicit-off emits no unsubscribe link", async () => {
    const u = await signUp("FooterOffCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf({
        id: "ft",
        type: "footer",
        props: { businessAddress: "addr", showUnsubscribe: false },
      }),
    );
    expect(html).not.toContain("{{unsubscribeUrl}}");
  });

  it("CB-11: valid hex bodyBg is used; garbage falls back to #F2F2F7 with no injection", async () => {
    const u = await signUp("BodyBgCo");
    const good = await compileWith(
      u.sessionToken,
      bodyOf({ id: "h1", type: "heading", props: { text: "Hi", level: 1 } }),
      { bodyBg: "#10203F" },
    );
    expect(good.toLowerCase()).toContain("#10203f");

    const bad = await compileWith(
      u.sessionToken,
      bodyOf({ id: "h1", type: "heading", props: { text: "Hi", level: 1 } }),
      { bodyBg: '"><x>' },
    );
    expect(bad).toContain("#F2F2F7");
    expect(bad).not.toContain("<x>");
  });

  it("CB-13: malformed/typeless/unknown blocks are skipped; valid blocks still render; no throw", async () => {
    const u = await signUp("MalformedCo");
    const html = await compileWith(
      u.sessionToken,
      bodyOf(
        { id: "x1", type: "heading", props: { text: "Good heading", level: 1 } },
        { id: "x2" }, // no type
        { id: "x3", type: "totally-unknown", props: { foo: "bar" } },
        { id: "x4", type: "button" }, // no props
      ),
    );
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Good heading");
    expect(html).not.toContain("totally-unknown");
    expect(html).not.toContain("bar");
  });

  it("CB-16: recompiles via the missing-compiledHtml branch when compiledHtml is falsy (body not dirty)", async () => {
    // The beforeSave hook recompiles when `object.dirty("body") ||
    // !object.get("compiledHtml")`. To exercise the second clause we unset
    // compiledHtml and save without touching `body`: the hook sees a falsy
    // compiledHtml on a non-dirty body and recompiles. (The very save that
    // unsets it re-runs the hook, so we can only observe the recompiled output,
    // not a transient empty state — which is exactly the branch under test.)
    const u = await signUp("MissingHtmlCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Missing html");
    c.set("status", "draft");
    c.set(
      "body",
      bodyOf({ id: "h1", type: "heading", props: { text: "Recompile me", level: 1 } }),
    );
    await c.save(null, { sessionToken: u.sessionToken });

    // Load fresh (so `body` is NOT dirty), unset compiledHtml, and save. The
    // only reason a recompile can happen here is the falsy-compiledHtml clause.
    const fresh = await new Parse.Query(Campaign).get(c.id, {
      sessionToken: u.sessionToken,
    });
    expect(fresh.dirty("body")).toBe(false);
    fresh.unset("compiledHtml");
    await fresh.save(null, { sessionToken: u.sessionToken });

    const after = (
      await new Parse.Query(Campaign).get(c.id, { useMasterKey: true })
    ).get("compiledHtml");
    expect(typeof after).toBe("string");
    expect(after).toContain("Recompile me");
  });

  it("CB-17: a campaign with no body at all saves with compiledHtml left unset", async () => {
    const u = await signUp("NoBodyCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Name only");
    c.set("status", "draft");
    await c.save(null, { sessionToken: u.sessionToken });

    const fetched = await new Parse.Query(Campaign).get(c.id, {
      useMasterKey: true,
    });
    expect(fetched.get("compiledHtml")).toBeUndefined();
  });

  // ── getCampaign edge cases ────────────────────────────────────────────────

  it("CB/CR-08: getCampaign with no id rejects OBJECT_NOT_FOUND", async () => {
    const u = await signUp("GetNoIdCo");
    await expect(
      Parse.Cloud.run("getCampaign", {}, { sessionToken: u.sessionToken }),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  it("CR-09: getCampaign with no session rejects INVALID_SESSION_TOKEN", async () => {
    await expect(
      Parse.Cloud.run("getCampaign", { id: "anything" }),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
  });

  // ── duplicateCampaign deep behavior ───────────────────────────────────────

  it("CR-11: duplicate deep-clones the body (no shared refs with the source)", async () => {
    const u = await signUp("DupDeepCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Deep source");
    c.set("status", "draft");
    c.set(
      "body",
      bodyOf({ id: "h1", type: "heading", props: { text: "Original text", level: 1 } }),
    );
    await c.save(null, { sessionToken: u.sessionToken });

    const { id } = (await Parse.Cloud.run(
      "duplicateCampaign",
      { id: c.id },
      { sessionToken: u.sessionToken },
    )) as { id: string };

    // Mutate the source body after duplication.
    const src = await new Parse.Query(Campaign).get(c.id, {
      sessionToken: u.sessionToken,
    });
    const mutated = src.get("body");
    mutated.blocks[0].props.text = "Changed after copy";
    src.set("body", mutated);
    await src.save(null, { sessionToken: u.sessionToken });

    const dupe = await new Parse.Query(Campaign).get(id, { useMasterKey: true });
    expect(dupe.get("body").blocks[0].props.text).toBe("Original text");
  });

  it("CR-12: duplicate drops sent-only stats and scheduling", async () => {
    const u = await signUp("DupStatsCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Sent source");
    c.set("status", "sent");
    c.set("openRate", 0.5);
    c.set("clickRate", 0.1);
    c.set("sentAt", new Date("2026-01-01T00:00:00.000Z"));
    c.set("scheduledAt", new Date("2026-01-02T00:00:00.000Z"));
    c.set("body", makeDefaultBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const { id } = (await Parse.Cloud.run(
      "duplicateCampaign",
      { id: c.id },
      { sessionToken: u.sessionToken },
    )) as { id: string };

    const dupe = await new Parse.Query(Campaign).get(id, { useMasterKey: true });
    expect(dupe.get("status")).toBe("draft");
    expect(dupe.get("openRate")).toBeUndefined();
    expect(dupe.get("clickRate")).toBeUndefined();
    expect(dupe.get("sentAt")).toBeUndefined();
    expect(dupe.get("scheduledAt")).toBeUndefined();
  });

  it("CR-13: duplicate is allowed from sending and sent → fresh draft", async () => {
    const u = await signUp("DupAnyStatusCo");
    const Campaign = Parse.Object.extend("Campaign");

    for (const status of ["sending", "sent"]) {
      const c = new Campaign();
      c.set("name", `Source ${status}`);
      c.set("status", status);
      c.set("body", makeDefaultBody());
      await c.save(null, { sessionToken: u.sessionToken });

      const { id } = (await Parse.Cloud.run(
        "duplicateCampaign",
        { id: c.id },
        { sessionToken: u.sessionToken },
      )) as { id: string };
      const dupe = await new Parse.Query(Campaign).get(id, { useMasterKey: true });
      expect(dupe.get("status")).toBe("draft");
    }
  });

  it("CR-14: duplicate is isolated across orgs (B cannot duplicate A's campaign)", async () => {
    const a = await signUp("DupXOrgA");
    const b = await signUp("DupXOrgB");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "A's");
    c.set("status", "draft");
    c.set("body", makeDefaultBody());
    await c.save(null, { sessionToken: a.sessionToken });

    await expect(
      Parse.Cloud.run("duplicateCampaign", { id: c.id }, { sessionToken: b.sessionToken }),
    ).rejects.toMatchObject({});
  });

  // ── archive / rename / update / delete guard holes ────────────────────────

  it("CR-17: archiving an already-archived campaign is a no-op that succeeds", async () => {
    const u = await signUp("ArchiveArchivedCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Already archived");
    c.set("status", "archived");
    await c.save(null, { sessionToken: u.sessionToken });

    const r = (await Parse.Cloud.run(
      "archiveCampaign",
      { id: c.id },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean };
    expect(r.ok).toBe(true);
    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("status")).toBe("archived");
  });

  it("CR-21: rename is rejected on sending and archived campaigns", async () => {
    const u = await signUp("RenameGuardCo");
    const Campaign = Parse.Object.extend("Campaign");
    for (const status of ["sending", "archived"]) {
      const c = new Campaign();
      c.set("name", `${status} one`);
      c.set("status", status);
      await c.save(null, { sessionToken: u.sessionToken });
      await expect(
        Parse.Cloud.run(
          "renameCampaign",
          { id: c.id, name: "new name" },
          { sessionToken: u.sessionToken },
        ),
      ).rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN });
    }
  });

  it("CR-28: update is rejected on an archived campaign", async () => {
    const u = await signUp("UpdateArchivedCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Archived");
    c.set("status", "archived");
    await c.save(null, { sessionToken: u.sessionToken });
    await expect(
      Parse.Cloud.run(
        "updateCampaign",
        { id: c.id, patch: { subject: "x" } },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN });
  });

  it("CR-25: update with an invalid scheduledAt rejects INVALID_JSON", async () => {
    const u = await signUp("UpdateBadDateCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Patch date");
    c.set("status", "draft");
    await c.save(null, { sessionToken: u.sessionToken });
    await expect(
      Parse.Cloud.run(
        "updateCampaign",
        { id: c.id, patch: { scheduledAt: "not-a-date" } },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_JSON });
  });

  it("CR-26: update with an empty name rejects VALIDATION_ERROR", async () => {
    const u = await signUp("UpdateEmptyNameCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Keep me");
    c.set("status", "draft");
    await c.save(null, { sessionToken: u.sessionToken });
    await expect(
      Parse.Cloud.run(
        "updateCampaign",
        { id: c.id, patch: { name: "   " } },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.VALIDATION_ERROR });
  });

  it("CR-27: update with a non-object patch (array) rejects INVALID_JSON", async () => {
    const u = await signUp("UpdateBadPatchCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Patch shape");
    c.set("status", "draft");
    await c.save(null, { sessionToken: u.sessionToken });
    await expect(
      Parse.Cloud.run(
        "updateCampaign",
        { id: c.id, patch: ["nope"] },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_JSON });
  });

  it("CR-30: update with only unknown keys is a no-op { ok: true } with no field changes", async () => {
    const u = await signUp("UpdateUnknownCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Unchanged");
    c.set("status", "draft");
    c.set("subject", "Original subject");
    await c.save(null, { sessionToken: u.sessionToken });

    const r = (await Parse.Cloud.run(
      "updateCampaign",
      { id: c.id, patch: { notAField: 1, status: "sent", body: {} } },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean };
    expect(r.ok).toBe(true);

    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("name")).toBe("Unchanged");
    expect(fetched.get("subject")).toBe("Original subject");
    expect(fetched.get("status")).toBe("draft");
  });

  it("CR-32: delete hard-destroys scheduled, paused, and archived campaigns", async () => {
    const u = await signUp("DeleteHardCo");
    const Campaign = Parse.Object.extend("Campaign");
    for (const status of ["scheduled", "paused", "archived"]) {
      const c = new Campaign();
      c.set("name", `${status} one`);
      c.set("status", status);
      await c.save(null, { sessionToken: u.sessionToken });
      const id = c.id;

      const r = (await Parse.Cloud.run(
        "deleteCampaign",
        { id },
        { sessionToken: u.sessionToken },
      )) as { ok: boolean; deleted: boolean };
      expect(r.deleted).toBe(true);

      const found = await new Parse.Query(Campaign)
        .equalTo("objectId", id)
        .first({ useMasterKey: true });
      expect(found).toBeUndefined();
    }
  });

  it("CR-35: delete is isolated across orgs (B cannot delete A's campaign)", async () => {
    const a = await signUp("DeleteXOrgA");
    const b = await signUp("DeleteXOrgB");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "A's");
    c.set("status", "draft");
    await c.save(null, { sessionToken: a.sessionToken });

    await expect(
      Parse.Cloud.run("deleteCampaign", { id: c.id }, { sessionToken: b.sessionToken }),
    ).rejects.toMatchObject({});

    // Still present in A's org.
    const found = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(found.get("status")).toBe("draft");
  });

  it("CR-37: every mutation rejects with no session (INVALID_SESSION_TOKEN via loadOwned)", async () => {
    // loadOwned guards rename/update/archive/delete. (getCampaign/duplicate
    // have their own equivalent guard, covered above.)
    for (const fn of ["renameCampaign", "archiveCampaign", "deleteCampaign"]) {
      await expect(
        Parse.Cloud.run(fn, { id: "x", name: "y" }),
      ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
    }
    await expect(
      Parse.Cloud.run("updateCampaign", { id: "x", patch: { subject: "y" } }),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
  });

  // ── New-draft shape (NW-01) ───────────────────────────────────────────────

  it("NW-01: a freshly created draft (default body) is CAN-SPAM-ready with {{unsubscribeUrl}}", async () => {
    // Replicates pages/app/campaigns/new.vue's save: default body, draft status,
    // null setup fields.
    const u = await signUp("NewDraftCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Untitled campaign");
    c.set("status", "draft");
    c.set("body", makeDefaultBody());
    c.set("subject", null);
    c.set("preheader", null);
    c.set("fromName", null);
    c.set("fromEmail", null);
    c.set("replyTo", null);
    c.set("audienceId", null);
    await c.save(null, { sessionToken: u.sessionToken });

    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    const body = fetched.get("body");
    expect(body.blocks.length).toBe(4);
    expect(body.blocks.some((b: any) => b.type === "footer")).toBe(true);
    expect(fetched.get("compiledHtml")).toContain("{{unsubscribeUrl}}");
  });

  // ── Tenant isolation: org-scoped audience name resolution (TN-02) ──────────

  it("TN-02: audience name resolution is org-scoped (a List id from another org resolves to null)", async () => {
    const a = await signUp("AudienceOrgA");
    const b = await signUp("AudienceOrgB");
    const Campaign = Parse.Object.extend("Campaign");
    const List = Parse.Object.extend("List");

    // A List that exists only in B's org.
    const bList = new List();
    bList.set("name", "B's audience");
    await bList.save(null, { sessionToken: b.sessionToken });

    // A's campaign references B's List id (it should NOT resolve cross-org).
    const c = new Campaign();
    c.set("name", "Cross-org ref");
    c.set("status", "draft");
    c.set("audienceId", bList.id);
    c.set("body", makeDefaultBody());
    await c.save(null, { sessionToken: a.sessionToken });

    const res = (await Parse.Cloud.run(
      "listCampaigns",
      {},
      { sessionToken: a.sessionToken },
    )) as any;
    const row = res.campaigns.find((x: any) => x.id === c.id);
    expect(row).toBeDefined();
    expect(row.audienceId).toBe(bList.id);
    expect(row.audience).toBeNull(); // never resolves the other org's List name
  });

  it("CR-03: a bogus audience id resolves to null gracefully", async () => {
    const u = await signUp("BogusAudienceCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Bogus audience");
    c.set("status", "draft");
    c.set("audienceId", "does_not_exist_123");
    c.set("body", makeDefaultBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const res = (await Parse.Cloud.run(
      "listCampaigns",
      {},
      { sessionToken: u.sessionToken },
    )) as any;
    const row = res.campaigns.find((x: any) => x.id === c.id);
    expect(row.audience).toBeNull();
  });
});
