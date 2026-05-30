// Tenancy spine integration tests against a real Parse Server + in-memory Mongo.
// Covers: signUpWithOrg (user+org+role), ACL-based tenant isolation, beforeSave
// org/ACL stamping, and duplicate-signup error code.
//
// Note: Parse.User.become() is blocked in a Node/server environment ("not
// memory-safe"). We act as a given user by passing { sessionToken } to each
// query/save/cloud-run instead — which is exactly how a client session is
// scoped and is the correct way to assert ACL isolation without the master key.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("tenancy spine", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function signUp(params: Record<string, unknown>) {
    return Parse.Cloud.run("signUpWithOrg", params) as Promise<{
      sessionToken: string;
      userId: string;
      orgId: string;
      orgName: string;
    }>;
  }

  it("signUpWithOrg creates user (role:owner) + Organization + members role", async () => {
    const r = await signUp({
      username: "Alice@Example.com",
      password: "hunter2hunter2",
      email: "Alice@Example.com",
      name: "Alice",
      company: "Acme Inc",
    });

    expect(r.sessionToken).toBeTruthy();
    expect(r.userId).toBeTruthy();
    expect(r.orgId).toBeTruthy();
    expect(r.orgName).toBe("Acme Inc");

    // Fetch the user with master key and assert stamped fields.
    const user = await new Parse.Query(Parse.User).get(r.userId, {
      useMasterKey: true,
    });
    expect(user.get("role")).toBe("owner");
    // Username/email lowercased by the _User beforeSave.
    expect(user.get("username")).toBe("alice@example.com");
    expect(user.get("email")).toBe("alice@example.com");

    const orgPtr = user.get("organization");
    expect(orgPtr).toBeTruthy();
    expect(orgPtr.id).toBe(r.orgId);

    const org = await orgPtr.fetch({ useMasterKey: true });
    expect(org.get("plan")).toBe("free");
    expect(org.get("slug")).toBeTruthy();

    // Members role exists and contains the user.
    const roleName = `org_${r.orgId}_members`;
    const roleQ = new Parse.Query(Parse.Role);
    roleQ.equalTo("name", roleName);
    const role = await roleQ.first({ useMasterKey: true });
    expect(role).toBeDefined();
    const member = await role!.getUsers().query().first({ useMasterKey: true });
    expect(member!.id).toBe(r.userId);
  });

  it("getMyOrg returns the caller's org as a plain object", async () => {
    const r = await signUp({
      username: "getmyorg@example.com",
      password: "hunter2hunter2",
      company: "OrgCo",
    });
    const org = (await Parse.Cloud.run(
      "getMyOrg",
      {},
      { sessionToken: r.sessionToken },
    )) as { id: string; name: string; plan: string; monthlySendCap: number };
    expect(org.name).toBe("OrgCo");
    expect(org.plan).toBe("free");
    expect(org.monthlySendCap).toBeGreaterThan(0);
  });

  it("beforeSave stamps organization + restrictive ACL on new tenant objects", async () => {
    const r = await signUp({
      username: "stamp@example.com",
      password: "hunter2hunter2",
      company: "StampCo",
    });

    // Create a List with NO org and NO ACL set client-side, as this user.
    const List = Parse.Object.extend("List");
    const list = new List();
    list.set("name", "Newsletter");
    await list.save(null, { sessionToken: r.sessionToken });

    const fetched = await new Parse.Query(List).get(list.id, {
      useMasterKey: true,
    });
    const orgPtr = fetched.get("organization");
    expect(orgPtr).toBeTruthy();
    expect(orgPtr.id).toBe(r.orgId);

    const acl = fetched.getACL();
    expect(acl).toBeTruthy();
    expect(acl!.getPublicReadAccess()).toBe(false);
    expect(acl!.getPublicWriteAccess()).toBe(false);
    expect(acl!.getRoleReadAccess(`org_${r.orgId}_members`)).toBe(true);
    expect(acl!.getRoleWriteAccess(`org_${r.orgId}_members`)).toBe(true);
  });

  it("enforces tenant isolation across orgs via ACL", async () => {
    const a = await signUp({
      username: "orga@example.com",
      password: "hunter2hunter2",
      company: "OrgA",
    });
    const b = await signUp({
      username: "orgb@example.com",
      password: "hunter2hunter2",
      company: "OrgB",
    });

    // Act as A (session-scoped, NOT master key): create a Contact.
    const Contact = Parse.Object.extend("Contact");
    const c = new Contact();
    c.set("email", "lead@somewhere.com");
    c.set("status", "subscribed");
    await c.save(null, { sessionToken: a.sessionToken });

    // A can see it.
    const seenByA = await new Parse.Query(Contact).find({
      sessionToken: a.sessionToken,
    });
    expect(seenByA.length).toBe(1);

    // B (different session, NOT master key) sees zero rows.
    const seenByB = await new Parse.Query(Contact).find({
      sessionToken: b.sessionToken,
    });
    expect(seenByB.length).toBe(0);
  });

  it("rejects anonymous creation of a tenant object", async () => {
    const List = Parse.Object.extend("List");
    const list = new List();
    list.set("name", "Anon list");
    // No sessionToken, no master key → must be rejected.
    await expect(list.save()).rejects.toMatchObject({});
  });

  it("duplicate signup throws error code 202", async () => {
    await signUp({
      username: "dupe@example.com",
      password: "hunter2hunter2",
      company: "DupeCo",
    });
    await expect(
      signUp({
        username: "Dupe@Example.com", // different case → still a dupe after norm
        password: "hunter2hunter2",
        company: "DupeCo2",
      }),
    ).rejects.toMatchObject({ code: 202 });
  });
});
