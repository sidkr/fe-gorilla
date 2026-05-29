// Cloud-function tests for the Contacts feature: add (single + bulk), dedupe,
// list pagination, update (incl. unsubscribe → Suppression), soft-delete,
// GDPR hard-delete, and List.contactCount maintenance via afterSave/afterDelete.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("contacts cloud functions", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  let counter = 0;
  async function signUp(company: string) {
    counter += 1;
    return Parse.Cloud.run("signUpWithOrg", {
      username: `contacts-${counter}@example.com`,
      password: "hunter2hunter2",
      company,
    }) as Promise<{ sessionToken: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }
  async function makeList(token: string, name: string) {
    const r = (await Parse.Cloud.run("createAudience", { name }, as(token))) as {
      id: string;
    };
    return r.id;
  }
  async function listCount(token: string, listId: string) {
    const l = await new Parse.Query("List").get(listId, { sessionToken: token });
    return l.get("contactCount") as number;
  }

  it("addContact creates a contact, lowercases email, joins the list", async () => {
    const a = await signUp("AddCo");
    const listId = await makeList(a.sessionToken, "Main");
    const c = (await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "Person@Example.com", firstName: "Pat" },
      as(a.sessionToken),
    )) as { id: string; email: string; lists: string[] };

    expect(c.email).toBe("person@example.com");
    expect(c.lists).toContain(listId);
    expect(await listCount(a.sessionToken, listId)).toBe(1);
  });

  it("addContact persists the rich standard fields + tags + consent", async () => {
    const a = await signUp("RichCo");
    const listId = await makeList(a.sessionToken, "Rich");
    const c = (await Parse.Cloud.run(
      "addContact",
      {
        audienceId: listId,
        email: "rich@example.com",
        company: "Acme",
        phone: "+1 555 0100",
        city: "Berlin",
        country: "DE",
        timezone: "Europe/Berlin",
        tags: ["vip", "vip", " beta "], // dedup + trim
        consent: { source: "signup-form", capturedAt: "2026-05-29T00:00:00.000Z" },
      },
      as(a.sessionToken),
    )) as any;

    expect(c.company).toBe("Acme");
    expect(c.phone).toBe("+1 555 0100");
    expect(c.city).toBe("Berlin");
    expect(c.country).toBe("DE");
    expect(c.timezone).toBe("Europe/Berlin");
    expect(c.tags.sort()).toEqual(["beta", "vip"]);
    expect(c.consent.source).toBe("signup-form");

    // Round-trips through listContacts too.
    const page = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId },
      as(a.sessionToken),
    )) as { rows: any[] };
    const row = page.rows.find((r) => r.email === "rich@example.com");
    expect(row.company).toBe("Acme");
    expect(row.tags.sort()).toEqual(["beta", "vip"]);
  });

  it("addContact cleans customFields against the registry (coerce + drop unknown)", async () => {
    const a = await signUp("CfCo");
    const listId = await makeList(a.sessionToken, "Cf");
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Plan Tier", type: "enum", enumValues: ["free", "pro"] },
      as(a.sessionToken),
    );
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Seats", type: "number" },
      as(a.sessionToken),
    );

    const c = (await Parse.Cloud.run(
      "addContact",
      {
        audienceId: listId,
        email: "cf@example.com",
        customFields: {
          plan_tier: "pro", // valid enum
          seats: "12", // coerced "12" → 12
          bogus: "nope", // unknown → dropped
        },
      },
      as(a.sessionToken),
    )) as { customFields: Record<string, unknown> };

    expect(c.customFields.plan_tier).toBe("pro");
    expect(c.customFields.seats).toBe(12); // numeric, coerced
    expect(c.customFields.bogus).toBeUndefined(); // dropped
  });

  it("addContact drops a custom field value that fails coercion", async () => {
    const a = await signUp("CfBadCo");
    const listId = await makeList(a.sessionToken, "CfBad");
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Seats", type: "number" },
      as(a.sessionToken),
    );
    const c = (await Parse.Cloud.run(
      "addContact",
      {
        audienceId: listId,
        email: "cfbad@example.com",
        customFields: { seats: "not-a-number" },
      },
      as(a.sessionToken),
    )) as { customFields: Record<string, unknown> };
    expect(c.customFields.seats).toBeUndefined();
  });

  it("addContact rejects an invalid email", async () => {
    const a = await signUp("InvalidCo");
    const listId = await makeList(a.sessionToken, "L");
    await expect(
      Parse.Cloud.run(
        "addContact",
        { audienceId: listId, email: "not-an-email" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});
  });

  it("addContact on a duplicate email throws DUPLICATE_VALUE with contactId", async () => {
    const a = await signUp("DupCo");
    const listId = await makeList(a.sessionToken, "L");
    const first = (await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "dup@example.com" },
      as(a.sessionToken),
    )) as { id: string };

    await expect(
      Parse.Cloud.run(
        "addContact",
        { audienceId: listId, email: "dup@example.com" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({ code: 137, contactId: first.id });
  });

  it("addContactsBulk adds new, updates existing, skips invalid, dedupes batch", async () => {
    const a = await signUp("BulkCo");
    const listId = await makeList(a.sessionToken, "Bulk");
    await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "exists@example.com" },
      as(a.sessionToken),
    );

    const res = (await Parse.Cloud.run(
      "addContactsBulk",
      {
        audienceId: listId,
        contacts: [
          { email: "new1@example.com" },
          { email: "new2@example.com" },
          { email: "exists@example.com", customFields: { plan: "pro" } }, // update
          { email: "new2@example.com", firstName: "Dupe" }, // batch dupe → collapse
          { email: "garbage" }, // invalid → skipped
        ],
      },
      as(a.sessionToken),
    )) as { added: number; updated: number; skipped: number };

    expect(res.added).toBe(2); // new1, new2
    expect(res.updated).toBe(1); // exists
    expect(res.skipped).toBe(1); // garbage
    expect(await listCount(a.sessionToken, listId)).toBe(3);
  });

  it("listContacts paginates and excludes soft-deleted", async () => {
    const a = await signUp("PageCo");
    const listId = await makeList(a.sessionToken, "Page");
    for (let i = 0; i < 5; i++) {
      await Parse.Cloud.run(
        "addContact",
        { audienceId: listId, email: `p${i}@example.com` },
        as(a.sessionToken),
      );
    }

    const page0 = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId, page: 0, perPage: 2 },
      as(a.sessionToken),
    )) as { rows: any[]; total: number; page: number; perPage: number };
    expect(page0.total).toBe(5);
    expect(page0.rows.length).toBe(2);
    expect(page0.perPage).toBe(2);

    const page2 = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId, page: 2, perPage: 2 },
      as(a.sessionToken),
    )) as { rows: any[] };
    expect(page2.rows.length).toBe(1);

    // Soft-delete one → total drops + count drops.
    const target = page0.rows[0];
    await Parse.Cloud.run("deleteContact", { id: target.id }, as(a.sessionToken));
    const after = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId },
      as(a.sessionToken),
    )) as { total: number };
    expect(after.total).toBe(4);
    expect(await listCount(a.sessionToken, listId)).toBe(4);
  });

  it("listContacts search filters by email prefix", async () => {
    const a = await signUp("SearchCo");
    const listId = await makeList(a.sessionToken, "Search");
    await Parse.Cloud.run("addContact", { audienceId: listId, email: "alpha@example.com" }, as(a.sessionToken));
    await Parse.Cloud.run("addContact", { audienceId: listId, email: "beta@example.com" }, as(a.sessionToken));

    const res = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId, search: "alpha" },
      as(a.sessionToken),
    )) as { rows: any[]; total: number };
    expect(res.total).toBe(1);
    expect(res.rows[0].email).toBe("alpha@example.com");
  });

  it("updateContact edits fields; unsubscribe writes a Suppression row", async () => {
    const a = await signUp("UpdCo");
    const listId = await makeList(a.sessionToken, "Upd");
    const c = (await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "upd@example.com", firstName: "Old" },
      as(a.sessionToken),
    )) as { id: string };

    const updated = (await Parse.Cloud.run(
      "updateContact",
      { id: c.id, patch: { firstName: "New", status: "unsubscribed" } },
      as(a.sessionToken),
    )) as { firstName: string; status: string };
    expect(updated.firstName).toBe("New");
    expect(updated.status).toBe("unsubscribed");

    const sq = new Parse.Query("Suppression");
    sq.equalTo("email", "upd@example.com");
    const supp = await sq.first({ sessionToken: a.sessionToken });
    expect(supp).toBeDefined();
    expect(supp!.get("reason")).toBe("manual");
  });

  it("updateContact persists std fields + cleans customFields", async () => {
    const a = await signUp("UpdRichCo");
    const listId = await makeList(a.sessionToken, "UpdRich");
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Seats", type: "number" },
      as(a.sessionToken),
    );
    const c = (await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "updrich@example.com" },
      as(a.sessionToken),
    )) as { id: string };

    const updated = (await Parse.Cloud.run(
      "updateContact",
      {
        id: c.id,
        patch: {
          company: "Globex",
          tags: ["lead"],
          customFields: { seats: "5", junk: "x" },
        },
      },
      as(a.sessionToken),
    )) as any;
    expect(updated.company).toBe("Globex");
    expect(updated.tags).toEqual(["lead"]);
    expect(updated.customFields.seats).toBe(5);
    expect(updated.customFields.junk).toBeUndefined();
  });

  it("listContacts filters by status and by tag", async () => {
    const a = await signUp("FilterCo");
    const listId = await makeList(a.sessionToken, "Filter");
    await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "sub@example.com", tags: ["vip"] },
      as(a.sessionToken),
    );
    await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "pend@example.com", status: "pending", tags: ["lead"] },
      as(a.sessionToken),
    );

    const byStatus = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId, status: "pending" },
      as(a.sessionToken),
    )) as { rows: any[]; total: number };
    expect(byStatus.total).toBe(1);
    expect(byStatus.rows[0].email).toBe("pend@example.com");

    const byTag = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId, tag: "vip" },
      as(a.sessionToken),
    )) as { rows: any[]; total: number };
    expect(byTag.total).toBe(1);
    expect(byTag.rows[0].email).toBe("sub@example.com");
  });

  it("bulkDeleteContacts soft-deletes many; reconciles list count", async () => {
    const a = await signUp("BulkDelCo");
    const listId = await makeList(a.sessionToken, "BulkDel");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = (await Parse.Cloud.run(
        "addContact",
        { audienceId: listId, email: `bd${i}@example.com` },
        as(a.sessionToken),
      )) as { id: string };
      ids.push(c.id);
    }
    expect(await listCount(a.sessionToken, listId)).toBe(3);

    const res = (await Parse.Cloud.run(
      "bulkDeleteContacts",
      { ids: [ids[0], ids[1]] },
      as(a.sessionToken),
    )) as { deleted: number };
    expect(res.deleted).toBe(2);
    expect(await listCount(a.sessionToken, listId)).toBe(1);
  });

  it("bulkTagContacts adds and removes a tag across contacts", async () => {
    const a = await signUp("BulkTagCo");
    const listId = await makeList(a.sessionToken, "BulkTag");
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const c = (await Parse.Cloud.run(
        "addContact",
        { audienceId: listId, email: `bt${i}@example.com` },
        as(a.sessionToken),
      )) as { id: string };
      ids.push(c.id);
    }

    const add = (await Parse.Cloud.run(
      "bulkTagContacts",
      { ids, tag: "promo" },
      as(a.sessionToken),
    )) as { updated: number };
    expect(add.updated).toBe(2);

    const tagged = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId, tag: "promo" },
      as(a.sessionToken),
    )) as { total: number };
    expect(tagged.total).toBe(2);

    const remove = (await Parse.Cloud.run(
      "bulkTagContacts",
      { ids, tag: "promo", action: "remove" },
      as(a.sessionToken),
    )) as { updated: number };
    expect(remove.updated).toBe(2);

    const after = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listId, tag: "promo" },
      as(a.sessionToken),
    )) as { total: number };
    expect(after.total).toBe(0);
  });

  it("updateContact email change rejects a clash with another contact", async () => {
    const a = await signUp("ClashCo");
    const listId = await makeList(a.sessionToken, "Clash");
    await Parse.Cloud.run("addContact", { audienceId: listId, email: "taken@example.com" }, as(a.sessionToken));
    const mover = (await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "mover@example.com" },
      as(a.sessionToken),
    )) as { id: string };

    await expect(
      Parse.Cloud.run(
        "updateContact",
        { id: mover.id, patch: { email: "taken@example.com" } },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({ code: 137 });
  });

  it("deleteContactData hard-deletes all contact rows + adds a Suppression", async () => {
    const a = await signUp("GdprCo");
    const listId = await makeList(a.sessionToken, "Gdpr");
    await Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email: "forget@example.com" },
      as(a.sessionToken),
    );

    const res = (await Parse.Cloud.run(
      "deleteContactData",
      { email: "Forget@Example.com" },
      as(a.sessionToken),
    )) as { ok: boolean; removed: number };
    expect(res.ok).toBe(true);
    expect(res.removed).toBe(1);

    const cq = new Parse.Query("Contact");
    cq.equalTo("email", "forget@example.com");
    expect(await cq.count({ useMasterKey: true })).toBe(0);

    const sq = new Parse.Query("Suppression");
    sq.equalTo("email", "forget@example.com");
    const supp = await sq.first({ sessionToken: a.sessionToken });
    expect(supp!.get("reason")).toBe("gdpr");

    // contactCount reconciled back to 0 by afterDelete.
    expect(await listCount(a.sessionToken, listId)).toBe(0);
  });

  it("importContactsCsv returns NOT_IMPLEMENTED", async () => {
    const a = await signUp("CsvCo");
    await expect(
      Parse.Cloud.run("importContactsCsv", { audienceId: "x", csv: "", consentAttested: true }, as(a.sessionToken)),
    ).rejects.toMatchObject({});
  });

  it("isolates contacts across orgs", async () => {
    const a = await signUp("IsoA");
    const b = await signUp("IsoB");
    const listA = await makeList(a.sessionToken, "A");
    const listB = await makeList(b.sessionToken, "B");
    await Parse.Cloud.run("addContact", { audienceId: listA, email: "a-only@example.com" }, as(a.sessionToken));

    const bView = (await Parse.Cloud.run(
      "listContacts",
      { audienceId: listB },
      as(b.sessionToken),
    )) as { total: number };
    expect(bView.total).toBe(0);

    // B cannot list contacts on A's list (not found).
    await expect(
      Parse.Cloud.run("listContacts", { audienceId: listA }, as(b.sessionToken)),
    ).rejects.toMatchObject({});
  });
});
