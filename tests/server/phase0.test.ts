// Phase 0 quick-wins server tests:
//   - pauseCampaign / resumeCampaign   (server/cloud/campaigns.js)
//   - exportCampaignRecipients         (server/cloud/reports.js)
//   - resolveSegmentContacts           (server/cloud/segments.js, exported helper)
//
// Harness: tests/setup/parseServer (real Parse Server + in-memory Mongo, cloud
// code loaded). Per the tenancy convention (and campaigns.test.ts),
// Parse.User.become() is blocked server-side, so we act as a user by passing
// { sessionToken } to every save/query/cloud-run. signUpWithOrg establishes the
// caller's org.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// resolveSegmentContacts is exported directly for the send fanout's use.
import { resolveSegmentContacts } from "../../server/cloud/segments.js";

describe("Phase 0 quick wins", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  }, 60000);

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

  function orgFor(orgId: string) {
    return Parse.Object.extend("Organization").createWithoutData(orgId);
  }

  async function makeCampaign(
    sessionToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Test campaign");
    c.set("status", "draft");
    for (const [k, v] of Object.entries(overrides)) c.set(k, v);
    await c.save(null, { sessionToken });
    return c;
  }

  async function makeSend(
    orgId: string,
    campaign: any,
    overrides: Record<string, unknown> = {},
  ) {
    const CampaignSend = Parse.Object.extend("CampaignSend");
    const s = new CampaignSend();
    s.set("organization", orgFor(orgId));
    s.set("campaign", campaign);
    s.set("email", `r-${Math.random().toString(36).slice(2, 8)}@example.com`);
    s.set("status", "queued");
    for (const [k, v] of Object.entries(overrides)) s.set(k, v);
    await s.save(null, { useMasterKey: true });
    return s;
  }

  async function makeContact(
    sessionToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const Contact = Parse.Object.extend("Contact");
    const c = new Contact();
    c.set("email", `c-${Math.random().toString(36).slice(2, 8)}@example.com`);
    c.set("status", "subscribed");
    for (const [k, v] of Object.entries(overrides)) c.set(k, v);
    await c.save(null, { sessionToken });
    return c;
  }

  // ── pause / resume ─────────────────────────────────────────────────────────
  it("pauses a sending campaign (status → paused, pausedFrom recorded)", async () => {
    const u = await signUp("PauseCo");
    const c = await makeCampaign(u.sessionToken, {
      status: "sending",
      recipientCount: 3,
    });
    const res: any = await Parse.Cloud.run(
      "pauseCampaign",
      { campaignId: c.id },
      { sessionToken: u.sessionToken },
    );
    expect(res.status).toBe("paused");
    const fetched = await new Parse.Query("Campaign").get(c.id, {
      useMasterKey: true,
    });
    expect(fetched.get("status")).toBe("paused");
    expect(fetched.get("pausedFrom")).toBe("sending");
  });

  it("pauses a scheduled campaign", async () => {
    const u = await signUp("PauseSchedCo");
    const c = await makeCampaign(u.sessionToken, { status: "scheduled" });
    const res: any = await Parse.Cloud.run(
      "pauseCampaign",
      { campaignId: c.id },
      { sessionToken: u.sessionToken },
    );
    expect(res.status).toBe("paused");
  });

  it("rejects pausing a draft", async () => {
    const u = await signUp("PauseBadCo");
    const c = await makeCampaign(u.sessionToken, { status: "draft" });
    await expect(
      Parse.Cloud.run(
        "pauseCampaign",
        { campaignId: c.id },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toThrow();
  });

  it("resumes a started+paused campaign to sending and re-enqueues queued sends only", async () => {
    const u = await signUp("ResumeCo");
    const c = await makeCampaign(u.sessionToken, {
      status: "paused",
      pausedFrom: "sending",
      recipientCount: 2,
    });
    await makeSend(u.orgId, c, { status: "queued" });
    await makeSend(u.orgId, c, { status: "queued" });
    await makeSend(u.orgId, c, { status: "sent" }); // must NOT be re-enqueued

    const res: any = await Parse.Cloud.run(
      "resumeCampaign",
      { campaignId: c.id },
      { sessionToken: u.sessionToken },
    );
    expect(res.status).toBe("sending");
    expect(res.requeued).toBe(2);

    const fetched = await new Parse.Query("Campaign").get(c.id, {
      useMasterKey: true,
    });
    expect(fetched.get("status")).toBe("sending");
    expect(fetched.get("pausedFrom")).toBeUndefined();
  });

  it("resumes a not-yet-started paused campaign back to scheduled", async () => {
    const u = await signUp("ResumeSchedCo");
    const c = await makeCampaign(u.sessionToken, {
      status: "paused",
      pausedFrom: "scheduled",
    });
    const res: any = await Parse.Cloud.run(
      "resumeCampaign",
      { campaignId: c.id },
      { sessionToken: u.sessionToken },
    );
    expect(res.status).toBe("scheduled");
    expect(res.requeued).toBe(0);
  });

  it("rejects resuming a non-paused campaign", async () => {
    const u = await signUp("ResumeBadCo");
    const c = await makeCampaign(u.sessionToken, { status: "sending" });
    await expect(
      Parse.Cloud.run(
        "resumeCampaign",
        { campaignId: c.id },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toThrow();
  });

  // ── CSV export ─────────────────────────────────────────────────────────────
  it("exportCampaignRecipients returns CSV with the required header + one row per recipient", async () => {
    const u = await signUp("CsvCo");
    const c = await makeCampaign(u.sessionToken, { status: "sent", name: "My Blast" });
    await makeSend(u.orgId, c, {
      email: "a@example.com",
      status: "delivered",
      deliveredAt: new Date(),
    });
    await makeSend(u.orgId, c, {
      email: "b@example.com",
      status: "bounced",
      bounceReason: "mailbox full",
    });

    const res: any = await Parse.Cloud.run(
      "exportCampaignRecipients",
      { campaignId: c.id },
      { sessionToken: u.sessionToken },
    );
    expect(res.filename).toContain("recipients.csv");
    const lines = res.csv.split("\r\n");
    expect(lines[0]).toBe(
      "email,status,deliveredAt,openedAt,clickedAt,bounceReason",
    );
    expect(lines.length).toBe(3); // header + 2 rows
    expect(res.csv).toContain("a@example.com");
    expect(res.csv).toContain("b@example.com");
  });

  it("exportCampaignRecipients quotes cells with commas", async () => {
    const u = await signUp("CsvQuoteCo");
    const c = await makeCampaign(u.sessionToken, { status: "sent" });
    await makeSend(u.orgId, c, {
      email: "x@example.com",
      status: "bounced",
      bounceReason: "rejected, no such user",
    });
    const res: any = await Parse.Cloud.run(
      "exportCampaignRecipients",
      { campaignId: c.id },
      { sessionToken: u.sessionToken },
    );
    expect(res.csv).toContain('"rejected, no such user"');
  });

  it("exportCampaignRecipients filters by status when provided", async () => {
    const u = await signUp("CsvFilterCo");
    const c = await makeCampaign(u.sessionToken, { status: "sent" });
    await makeSend(u.orgId, c, { status: "delivered" });
    await makeSend(u.orgId, c, { status: "bounced" });
    const res: any = await Parse.Cloud.run(
      "exportCampaignRecipients",
      { campaignId: c.id, status: "bounced" },
      { sessionToken: u.sessionToken },
    );
    expect(res.csv.split("\r\n").length).toBe(2); // header + 1 bounced
  });

  it("exportCampaignRecipients is org-isolated (other org's campaign → not found)", async () => {
    const owner = await signUp("CsvOwnerCo");
    const other = await signUp("CsvOtherCo");
    const c = await makeCampaign(owner.sessionToken, { status: "sent" });
    await expect(
      Parse.Cloud.run(
        "exportCampaignRecipients",
        { campaignId: c.id },
        { sessionToken: other.sessionToken },
      ),
    ).rejects.toThrow();
  });

  // ── resolveSegmentContacts ─────────────────────────────────────────────────
  it("resolveSegmentContacts resolves a dynamic segment's matching subscribed contacts", async () => {
    const u = await signUp("SegDynCo");
    const org = await new Parse.Query("Organization").get(u.orgId, {
      useMasterKey: true,
    });
    await makeContact(u.sessionToken, { email: "g1@gmail.com", status: "subscribed" });
    await makeContact(u.sessionToken, { email: "g2@gmail.com", status: "subscribed" });
    await makeContact(u.sessionToken, { email: "z@yahoo.com", status: "subscribed" });
    await makeContact(u.sessionToken, { email: "g3@gmail.com", status: "unsubscribed" });

    const segment = {
      kind: "dynamic",
      rules: {
        op: "and",
        conditions: [{ field: "email", operator: "contains", value: "gmail.com" }],
      },
    };
    const contacts = await resolveSegmentContacts(segment, org);
    const emails = contacts.map((c: any) => c.get("email")).sort();
    expect(emails).toEqual(["g1@gmail.com", "g2@gmail.com"]);
  });

  it("resolveSegmentContacts resolves a static segment from its snapshot", async () => {
    const u = await signUp("SegStaticCo");
    const org = await new Parse.Query("Organization").get(u.orgId, {
      useMasterKey: true,
    });
    const a = await makeContact(u.sessionToken, { status: "subscribed" });
    const b = await makeContact(u.sessionToken, { status: "subscribed" });
    const Contact = Parse.Object.extend("Contact");
    const segment = {
      kind: "static",
      staticContacts: [
        Contact.createWithoutData(a.id),
        Contact.createWithoutData(b.id),
      ],
    };
    const contacts = await resolveSegmentContacts(segment, org);
    expect(contacts.map((c: any) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("resolveSegmentContacts does not leak contacts across orgs", async () => {
    const a = await signUp("SegOrgA");
    const b = await signUp("SegOrgB");
    const orgA = await new Parse.Query("Organization").get(a.orgId, {
      useMasterKey: true,
    });
    await makeContact(a.sessionToken, { email: "match@a.com", status: "subscribed" });
    await makeContact(b.sessionToken, { email: "match@b.com", status: "subscribed" });

    const segment = {
      kind: "dynamic",
      rules: {
        op: "and",
        conditions: [{ field: "email", operator: "contains", value: "match" }],
      },
    };
    const contactsA = await resolveSegmentContacts(segment, orgA);
    expect(contactsA.length).toBe(1);
    expect(contactsA[0].get("email")).toBe("match@a.com");
  });
});
