// Tests for the ops maintenance tick (server/worker/jobs/opsTick.js): worker
// heartbeat + stuck-campaign recovery. Addresses the launch-audit P0 "a dead
// worker silently strands campaigns".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const MK = { useMasterKey: true } as const;

describe("opsTick", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let ops: any;
  let orgId: string;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    ops = require("../../server/worker/jobs/opsTick");
    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "ops@example.com",
      password: "hunter2hunter2",
      email: "ops@example.com",
      name: "Ops",
      company: "Ops Co",
    })) as { orgId: string };
    orgId = r.orgId;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  function orgPointer() {
    return Parse.Object.extend("Organization").createWithoutData(orgId);
  }

  async function makeCampaign(status: string) {
    const c = new (Parse.Object.extend("Campaign"))();
    c.set("organization", orgPointer());
    c.set("name", "C");
    c.set("status", status);
    await c.save(null, MK);
    return c;
  }

  async function makeSend(campaign: any, status: string) {
    const s = new (Parse.Object.extend("CampaignSend"))();
    s.set("organization", orgPointer());
    s.set("campaign", campaign);
    s.set("email", `${Math.random().toString(36).slice(2)}@x.com`);
    s.set("status", status);
    await s.save(null, MK);
    return s;
  }

  it("writes the worker heartbeat", async () => {
    const now = new Date();
    const out = await ops.handle({}, { now, log: () => {} });
    expect(out.heartbeat).toBe(true);

    const q = new Parse.Query("WorkerHeartbeat");
    q.equalTo("name", ops.HEARTBEAT_NAME);
    const hb = await q.first(MK);
    expect(hb).toBeTruthy();
    expect(hb!.get("beatAt").getTime()).toBe(now.getTime());
  });

  it("recovers a campaign stranded in 'sending' whose rows are all terminal", async () => {
    const campaign = await makeCampaign("sending");
    await makeSend(campaign, "sent");
    await makeSend(campaign, "failed"); // terminal too — no "queued" rows

    const out = await ops.handle({}, { log: () => {} });
    expect(out.recovered).toBeGreaterThanOrEqual(1);

    const fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("sent");
  });

  it("leaves a genuinely in-progress campaign alone (has a queued row)", async () => {
    const campaign = await makeCampaign("sending");
    await makeSend(campaign, "sent");
    await makeSend(campaign, "queued"); // still pending

    await ops.handle({}, { log: () => {} });

    const fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("sending");
  });

  it("flags (logs) a campaign stuck in 'sending' past the threshold, without failing it", async () => {
    const campaign = await makeCampaign("sending");
    await makeSend(campaign, "queued"); // never completes

    // Pretend "now" is far in the future so updatedAt looks stale.
    const future = new Date(Date.now() + ops.STUCK_AFTER_MS + 60_000);
    const logs: string[] = [];
    const out = await ops.handle({}, { now: future, log: (m: string) => logs.push(m) });

    expect(out.stuck).toContain(campaign.id);
    expect(logs.some((l) => /stuck in "sending"/.test(l))).toBe(true);

    // It must NOT have changed the status.
    const fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("sending");
  });
});
