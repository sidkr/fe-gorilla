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
});
