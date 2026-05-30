// Proves tests/setup/parseServer.ts boots a real Parse Server backed by
// an in-memory Mongo, that the Parse SDK can write + query, and that
// teardown is clean. Copy this shape for cloud-function tests.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("parse server harness", () => {
  let ctx: TestParseServer;

  beforeAll(async () => {
    ctx = await startTestParseServer();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("round-trips a Parse.Object", async () => {
    const TestThing = ctx.Parse.Object.extend("TestThing");
    const t = new TestThing();
    t.set("name", "hello");
    await t.save(null, { useMasterKey: true });

    const q = new ctx.Parse.Query(TestThing);
    q.equalTo("name", "hello");
    const found = await q.first({ useMasterKey: true });
    expect(found).toBeDefined();
    expect(found!.get("name")).toBe("hello");
  });
});
