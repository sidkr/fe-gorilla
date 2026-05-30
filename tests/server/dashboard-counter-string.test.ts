// D-S16 (isolated) — a non-numeric counter coerces to 0 via counter()'s guard
// (`typeof === "number" && Number.isFinite`). This must run in its own file: once
// any campaign stamps `sentCount` as a Number, Parse's inferred schema locks the
// field to Number and rejects a String. Here `sentCount` is only ever a String,
// so the schema infers String and the write succeeds — letting us prove the
// cloud function reads it back as 0 rather than NaN.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("getDashboardMetrics — non-numeric counter guard", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });
  afterAll(async () => {
    await ctx.stop();
  });

  it("coerces a string sentCount to 0 (no NaN)", async () => {
    const u = (await Parse.Cloud.run("signUpWithOrg", {
      username: "badcounter@example.com",
      password: "hunter2hunter2",
      email: "badcounter@example.com",
      company: "BadCounterCo",
    })) as { sessionToken: string; orgId: string };

    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "String counter");
    c.set("status", "sent");
    c.set("organization", {
      __type: "Pointer",
      className: "Organization",
      objectId: u.orgId,
    });
    c.set("sentCount", "oops");
    await c.save(null, { useMasterKey: true });

    const m = (await Parse.Cloud.run(
      "getDashboardMetrics",
      {},
      { sessionToken: u.sessionToken },
    )) as { totals: { sent: number } };

    expect(m.totals.sent).toBe(0);
    expect(Number.isNaN(m.totals.sent)).toBe(false);
  });
});
