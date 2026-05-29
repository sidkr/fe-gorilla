// Campaign cloud code + compileBlocks beforeSave extension, against a real
// Parse Server + in-memory Mongo.
//
// Covers:
//   - compileBlocks: a Campaign saved with blocks ends up with non-empty
//     compiledHtml containing the expected rendered content.
//   - compileBlocks only recompiles when `body` is dirty (counter-only updates
//     don't churn compiledHtml).
//   - listCampaigns: org-scoped rows + KPIs, archived excluded, audience name
//     resolution from the List id string.
//   - getCampaign / duplicateCampaign / archiveCampaign behavior + tenant
//     isolation.
//
// Per the tenancy test: Parse.User.become() is blocked server-side, so we act
// as a user by passing { sessionToken } to each save/query/cloud-run — the
// correct way to scope to a client session.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("campaigns cloud + compileBlocks", () => {
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

  function sampleBody() {
    return {
      version: 1,
      blocks: [
        {
          id: "b_h1",
          type: "heading",
          props: { text: "Welcome aboard", level: 1, align: "center", color: "#1A1A1A" },
        },
        {
          id: "b_p1",
          type: "paragraph",
          props: { html: "Thanks for joining our newsletter.", align: "left", color: "#1A1A1A" },
        },
        {
          id: "b_btn",
          type: "button",
          props: { label: "Get started", href: "https://example.com/start", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 },
        },
        {
          id: "b_div",
          type: "divider",
          props: { color: "#E5E5E7", thickness: 1 },
        },
        {
          id: "b_ft",
          type: "footer",
          props: { businessAddress: "123 Test St, Testville", showUnsubscribe: true, showWebVersion: false },
        },
      ],
    };
  }

  it("compileBlocks renders body.blocks → non-empty compiledHtml with expected content", async () => {
    const u = await signUp("CompileCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Welcome email");
    c.set("status", "draft");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const fetched = await new Parse.Query(Campaign).get(c.id, {
      useMasterKey: true,
    });
    const html = fetched.get("compiledHtml");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    // Table-based responsive email scaffolding from MJML.
    expect(html).toContain("<table");
    // Block content lands in the output.
    expect(html).toContain("Welcome aboard");
    expect(html).toContain("Thanks for joining our newsletter.");
    expect(html).toContain("Get started");
    expect(html).toContain("https://example.com/start");
    // Footer unsubscribe merge tag preserved.
    expect(html).toContain("{{unsubscribeUrl}}");
    expect(html).toContain("123 Test St, Testville");
  });

  it("does not recompile compiledHtml on a counter-only update (body not dirty)", async () => {
    const u = await signUp("CounterCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Counter email");
    c.set("status", "draft");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const firstHtml = (
      await new Parse.Query(Campaign).get(c.id, { useMasterKey: true })
    ).get("compiledHtml");
    expect(firstHtml).toContain("Welcome aboard");

    // Update a non-body field only. compiledHtml should be unchanged.
    c.set("status", "scheduled");
    await c.save(null, { sessionToken: u.sessionToken });

    const afterHtml = (
      await new Parse.Query(Campaign).get(c.id, { useMasterKey: true })
    ).get("compiledHtml");
    expect(afterHtml).toBe(firstHtml);
  });

  it("recompiles when body changes", async () => {
    const u = await signUp("RecompileCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Recompile email");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const body2 = sampleBody();
    body2.blocks[0].props.text = "Brand new headline";
    c.set("body", body2);
    await c.save(null, { sessionToken: u.sessionToken });

    const html = (
      await new Parse.Query(Campaign).get(c.id, { useMasterKey: true })
    ).get("compiledHtml");
    expect(html).toContain("Brand new headline");
    expect(html).not.toContain("Welcome aboard");
  });

  it("degrades gracefully on an empty / blockless body", async () => {
    const u = await signUp("EmptyCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Empty email");
    c.set("body", { version: 1, blocks: [] });
    // Should not throw.
    await c.save(null, { sessionToken: u.sessionToken });
    const html = (
      await new Parse.Query(Campaign).get(c.id, { useMasterKey: true })
    ).get("compiledHtml");
    expect(typeof html).toBe("string");
    expect(html).toContain("<table");
  });

  it("listCampaigns returns org-scoped rows + KPIs, excludes archived, resolves audience name", async () => {
    const u = await signUp("ListCo");
    const Campaign = Parse.Object.extend("Campaign");
    const List = Parse.Object.extend("List");

    // A real List so audienceId resolves to a name.
    const list = new List();
    list.set("name", "Engaged subscribers");
    await list.save(null, { sessionToken: u.sessionToken });

    const draft = new Campaign();
    draft.set("name", "Draft one");
    draft.set("status", "draft");
    draft.set("body", sampleBody());
    draft.set("audienceId", list.id);
    await draft.save(null, { sessionToken: u.sessionToken });

    const sent = new Campaign();
    sent.set("name", "Sent one");
    sent.set("status", "sent");
    sent.set("body", sampleBody());
    sent.set("openRate", 0.42);
    sent.set("clickRate", 0.08);
    await sent.save(null, { sessionToken: u.sessionToken });

    const archived = new Campaign();
    archived.set("name", "Archived one");
    archived.set("status", "archived");
    archived.set("body", sampleBody());
    await archived.save(null, { sessionToken: u.sessionToken });

    const res = (await Parse.Cloud.run(
      "listCampaigns",
      {},
      { sessionToken: u.sessionToken },
    )) as any;

    expect(res.campaigns.length).toBe(2); // archived excluded
    const names = res.campaigns.map((c: any) => c.name).sort();
    expect(names).toEqual(["Draft one", "Sent one"]);

    const draftRow = res.campaigns.find((c: any) => c.name === "Draft one");
    expect(draftRow.audience).toBe("Engaged subscribers");
    expect(draftRow.date).toContain("Created");

    const sentRow = res.campaigns.find((c: any) => c.name === "Sent one");
    expect(sentRow.openRate).toBe("42.0%");
    expect(sentRow.clickRate).toBe("8.0%");

    expect(res.kpis.total).toBe(2);
    expect(res.kpis.drafts).toBe(1);
    expect(res.kpis.sent).toBe(1);
    expect(res.kpis.avgOpenRate).toBe("42.0%");
  });

  it("getCampaign returns body + compiledHtml; isolates across orgs", async () => {
    const a = await signUp("GetCoA");
    const b = await signUp("GetCoB");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "A's campaign");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: a.sessionToken });

    const got = (await Parse.Cloud.run(
      "getCampaign",
      { id: c.id },
      { sessionToken: a.sessionToken },
    )) as any;
    expect(got.name).toBe("A's campaign");
    expect(got.body.blocks.length).toBe(5);
    expect(got.compiledHtml).toContain("Welcome aboard");

    // B cannot read A's campaign (ACL → OBJECT_NOT_FOUND).
    await expect(
      Parse.Cloud.run("getCampaign", { id: c.id }, { sessionToken: b.sessionToken }),
    ).rejects.toMatchObject({});
  });

  it("duplicateCampaign clones body + meta into a new draft", async () => {
    const u = await signUp("DupeCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Original");
    c.set("status", "sent");
    c.set("subject", "Hello there");
    c.set("audienceId", "list_xyz");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const { id } = (await Parse.Cloud.run(
      "duplicateCampaign",
      { id: c.id },
      { sessionToken: u.sessionToken },
    )) as { id: string };

    const dupe = await new Parse.Query(Campaign).get(id, { useMasterKey: true });
    expect(dupe.get("name")).toBe("Original (copy)");
    expect(dupe.get("status")).toBe("draft"); // forced to draft
    expect(dupe.get("subject")).toBe("Hello there");
    expect(dupe.get("audienceId")).toBe("list_xyz");
    expect(dupe.get("body").blocks.length).toBe(5);
    // compiledHtml recompiled from the cloned body.
    expect(dupe.get("compiledHtml")).toContain("Welcome aboard");
    // Same org as the source.
    expect(dupe.get("organization").id).toBe(u.orgId);
  });

  it("archiveCampaign flips status to archived and hides it from listCampaigns", async () => {
    const u = await signUp("ArchiveCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "To archive");
    c.set("status", "draft");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const r = (await Parse.Cloud.run(
      "archiveCampaign",
      { id: c.id },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean };
    expect(r.ok).toBe(true);

    const fetched = await new Parse.Query(Campaign).get(c.id, {
      useMasterKey: true,
    });
    expect(fetched.get("status")).toBe("archived");

    const list = (await Parse.Cloud.run(
      "listCampaigns",
      {},
      { sessionToken: u.sessionToken },
    )) as any;
    expect(list.campaigns.find((x: any) => x.id === c.id)).toBeUndefined();
  });

  // ── renameCampaign ───────────────────────────────────────────────────────
  it("renameCampaign updates the name on an editable campaign", async () => {
    const u = await signUp("RenameCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Old name");
    c.set("status", "draft");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const r = (await Parse.Cloud.run(
      "renameCampaign",
      { id: c.id, name: "  Shiny new name  " },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean; name: string };
    expect(r.ok).toBe(true);
    expect(r.name).toBe("Shiny new name"); // trimmed

    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("name")).toBe("Shiny new name");
  });

  it("renameCampaign rejects an empty name", async () => {
    const u = await signUp("RenameEmptyCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Keep me");
    c.set("status", "draft");
    await c.save(null, { sessionToken: u.sessionToken });

    await expect(
      Parse.Cloud.run(
        "renameCampaign",
        { id: c.id, name: "   " },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.VALIDATION_ERROR });
  });

  it("renameCampaign rejects renaming a sent campaign", async () => {
    const u = await signUp("RenameSentCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Already sent");
    c.set("status", "sent");
    await c.save(null, { sessionToken: u.sessionToken });

    await expect(
      Parse.Cloud.run(
        "renameCampaign",
        { id: c.id, name: "Try to rename" },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN });
  });

  // ── updateCampaign ───────────────────────────────────────────────────────
  it("updateCampaign patches metadata on an editable campaign and ignores unknown keys", async () => {
    const u = await signUp("UpdateCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Patch me");
    c.set("status", "draft");
    c.set("body", sampleBody());
    await c.save(null, { sessionToken: u.sessionToken });

    const when = "2026-06-01T09:00:00.000Z";
    const r = (await Parse.Cloud.run(
      "updateCampaign",
      {
        id: c.id,
        patch: {
          subject: "Patched subject",
          preheader: "A preheader",
          fromEmail: "hello@example.com",
          scheduledAt: when,
          // Non-patchable keys MUST be ignored, not applied.
          status: "sent",
          compiledHtml: "<b>nope</b>",
          body: { version: 1, blocks: [] },
        },
      },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean };
    expect(r.ok).toBe(true);

    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("subject")).toBe("Patched subject");
    expect(fetched.get("preheader")).toBe("A preheader");
    expect(fetched.get("fromEmail")).toBe("hello@example.com");
    expect((fetched.get("scheduledAt") as Date).toISOString()).toBe(when);
    // Ignored keys unchanged.
    expect(fetched.get("status")).toBe("draft");
    expect(fetched.get("body").blocks.length).toBe(5);
    // compiledHtml still reflects the original body, not the injected value.
    expect(fetched.get("compiledHtml")).toContain("Welcome aboard");
  });

  it("updateCampaign clears a string field with empty string and unsets scheduledAt with null", async () => {
    const u = await signUp("UpdateClearCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Clear me");
    c.set("status", "scheduled");
    c.set("subject", "Has a subject");
    c.set("scheduledAt", new Date("2026-07-01T00:00:00.000Z"));
    await c.save(null, { sessionToken: u.sessionToken });

    await Parse.Cloud.run(
      "updateCampaign",
      { id: c.id, patch: { subject: "", scheduledAt: null } },
      { sessionToken: u.sessionToken },
    );

    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("subject")).toBeNull();
    expect(fetched.get("scheduledAt")).toBeUndefined();
  });

  it("updateCampaign rejects editing a sent campaign", async () => {
    const u = await signUp("UpdateSentCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Sent already");
    c.set("status", "sent");
    await c.save(null, { sessionToken: u.sessionToken });

    await expect(
      Parse.Cloud.run(
        "updateCampaign",
        { id: c.id, patch: { subject: "nope" } },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN });
  });

  it("updateCampaign rejects editing a sending campaign", async () => {
    const u = await signUp("UpdateSendingCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "In flight");
    c.set("status", "sending");
    await c.save(null, { sessionToken: u.sessionToken });

    await expect(
      Parse.Cloud.run(
        "updateCampaign",
        { id: c.id, patch: { subject: "nope" } },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN });
  });

  it("updateCampaign allows editing a paused campaign", async () => {
    const u = await signUp("UpdatePausedCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Paused");
    c.set("status", "paused");
    await c.save(null, { sessionToken: u.sessionToken });

    const r = (await Parse.Cloud.run(
      "updateCampaign",
      { id: c.id, patch: { subject: "Resumed subject" } },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean };
    expect(r.ok).toBe(true);

    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("subject")).toBe("Resumed subject");
  });

  // ── deleteCampaign ─────────────────────────────────────────────────────────
  it("deleteCampaign hard-destroys a draft", async () => {
    const u = await signUp("DeleteDraftCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Disposable draft");
    c.set("status", "draft");
    await c.save(null, { sessionToken: u.sessionToken });
    const id = c.id;

    const r = (await Parse.Cloud.run(
      "deleteCampaign",
      { id },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean; deleted: boolean };
    expect(r.ok).toBe(true);
    expect(r.deleted).toBe(true);

    const found = await new Parse.Query(Campaign)
      .equalTo("objectId", id)
      .first({ useMasterKey: true });
    expect(found).toBeUndefined();
  });

  it("deleteCampaign soft-archives a sent campaign (preserves history)", async () => {
    const u = await signUp("DeleteSentCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Sent history");
    c.set("status", "sent");
    await c.save(null, { sessionToken: u.sessionToken });

    const r = (await Parse.Cloud.run(
      "deleteCampaign",
      { id: c.id },
      { sessionToken: u.sessionToken },
    )) as { ok: boolean; deleted: boolean };
    expect(r.ok).toBe(true);
    expect(r.deleted).toBe(false); // soft delete

    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("status")).toBe("archived");
  });

  it("deleteCampaign rejects deleting a sending campaign", async () => {
    const u = await signUp("DeleteSendingCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "In flight");
    c.set("status", "sending");
    await c.save(null, { sessionToken: u.sessionToken });

    await expect(
      Parse.Cloud.run(
        "deleteCampaign",
        { id: c.id },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN });

    // Still present + still sending.
    const fetched = await new Parse.Query(Campaign).get(c.id, { useMasterKey: true });
    expect(fetched.get("status")).toBe("sending");
  });

  // ── archiveCampaign guard ───────────────────────────────────────────────────
  it("archiveCampaign rejects archiving a sending campaign", async () => {
    const u = await signUp("ArchiveSendingCo");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "In flight");
    c.set("status", "sending");
    await c.save(null, { sessionToken: u.sessionToken });

    await expect(
      Parse.Cloud.run(
        "archiveCampaign",
        { id: c.id },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN });
  });

  // ── cross-org isolation for mutations ────────────────────────────────────────
  it("mutations isolate across orgs (B cannot rename/update/delete A's campaign)", async () => {
    const a = await signUp("MutA");
    const b = await signUp("MutB");
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "A's campaign");
    c.set("status", "draft");
    await c.save(null, { sessionToken: a.sessionToken });

    await expect(
      Parse.Cloud.run("renameCampaign", { id: c.id, name: "hijack" }, { sessionToken: b.sessionToken }),
    ).rejects.toMatchObject({});
    await expect(
      Parse.Cloud.run("updateCampaign", { id: c.id, patch: { subject: "x" } }, { sessionToken: b.sessionToken }),
    ).rejects.toMatchObject({});
    await expect(
      Parse.Cloud.run("deleteCampaign", { id: c.id }, { sessionToken: b.sessionToken }),
    ).rejects.toMatchObject({});
  });
});
