// import-csv worker job tests (F-07 + F-29).
//
// Drives the pure handler directly (no live Agenda): handle({ importJobId }, {
// openStream }). Boots the shared Parse harness, signs up an org, builds a List
// + an ImportJob row via master key, and feeds an in-memory CSV string through
// the injectable `openStream`. Asserts mapping, dedupe (in-file + vs existing),
// suppression skip, malformed-email reject, consent stamping, and counter
// accuracy.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// server/ is CommonJS; load its modules with a CJS require.
const require = createRequire(import.meta.url);

const MK = { useMasterKey: true } as const;

describe("import-csv job", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let importCsv: any;
  let suppression: any;

  let sessionToken: string;
  let orgId: string;

  function as(token: string) {
    return { sessionToken: token };
  }

  // Create an ImportJob row (master key) carrying mapping/consent for a list,
  // then return its id. The worker reads filePath off the row, but tests inject
  // an in-memory stream via deps so filePath is unused.
  async function makeJob(opts: {
    listId: string;
    mapping: Record<string, unknown>;
    consent?: Record<string, unknown> | null;
    hasHeader?: boolean;
  }) {
    const Organization = Parse.Object.extend("Organization");
    const orgPtr = Organization.createWithoutData(orgId);
    const ImportJob = Parse.Object.extend("ImportJob");
    const job = new ImportJob();
    job.set("organization", orgPtr);
    job.set("listId", opts.listId);
    job.set("filePath", "/tmp/unused.csv");
    job.set("mapping", opts.mapping);
    job.set("consent", opts.consent ?? null);
    job.set("hasHeader", opts.hasHeader !== false);
    job.set("status", "pending");
    await job.save(null, MK);
    return job.id;
  }

  function runJob(jobId: string, csv: string) {
    return importCsv.handle(
      { importJobId: jobId },
      { openStream: () => importCsv.streamFromString(csv) },
    );
  }

  async function makeList(name: string) {
    const r = (await Parse.Cloud.run("createAudience", { name }, as(sessionToken))) as {
      id: string;
    };
    return r.id;
  }

  async function contactByEmail(email: string) {
    return new Parse.Query("Contact").equalTo("email", email).first(MK);
  }

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;

    importCsv = require("../../server/worker/jobs/importCsv");
    suppression = require("../../server/lib/suppression");

    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "import@example.com",
      password: "hunter2hunter2",
      company: "Import Co",
    })) as { sessionToken: string; orgId: string };
    sessionToken = r.sessionToken;
    orgId = r.orgId;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("maps columns → email/name/custom and imports rows (counter accuracy)", async () => {
    const listId = await makeList("Map List");
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Plan", type: "enum", enumValues: ["free", "pro"] },
      as(sessionToken),
    );

    // headers: email, first, last, plan
    const csv =
      "email,first,last,plan\n" +
      "Anna@Example.com,Anna,Smith,pro\n" +
      "ben@example.com,Ben,Jones,free\n";

    const jobId = await makeJob({
      listId,
      hasHeader: true,
      mapping: {
        "0": "email",
        "1": "firstName",
        "2": "lastName",
        "3": "custom:plan",
      },
      consent: { source: "signupForm" },
    });

    const res = await runJob(jobId, csv);
    expect(res.created).toBe(2);
    expect(res.updated).toBe(0);
    expect(res.skippedInvalid).toBe(0);
    expect(res.skippedSuppressed).toBe(0);
    expect(res.processedRows).toBe(2);

    const anna = await contactByEmail("anna@example.com");
    expect(anna!.get("email")).toBe("anna@example.com"); // lowercased
    expect(anna!.get("firstName")).toBe("Anna");
    expect(anna!.get("lastName")).toBe("Smith");
    expect(anna!.get("customFields").plan).toBe("pro"); // mapped + cleaned
    expect(anna!.get("lists")).toContain(listId);
    expect(anna!.get("status")).toBe("subscribed");

    // List count reconciled.
    const list = await new Parse.Query("List").get(listId, MK);
    expect(list.get("contactCount")).toBe(2);
  });

  it("collapses duplicate emails within the file to one contact (last wins)", async () => {
    const listId = await makeList("Dupe List");
    const csv =
      "email,first\n" +
      "dupe@example.com,First\n" +
      "dupe@example.com,Second\n";

    const jobId = await makeJob({
      listId,
      mapping: { "0": "email", "1": "firstName" },
      consent: { source: "purchase" },
    });

    const res = await runJob(jobId, csv);
    // First row creates, second row (same email) updates → 1 created, 1 updated.
    expect(res.created).toBe(1);
    expect(res.updated).toBe(1);

    const c = await contactByEmail("dupe@example.com");
    expect(c!.get("firstName")).toBe("Second"); // last occurrence wins
    const count = await new Parse.Query("Contact")
      .equalTo("email", "dupe@example.com")
      .count(MK);
    expect(count).toBe(1); // exactly one row
  });

  it("updates an existing contact (merges customFields, keeps status)", async () => {
    const listId = await makeList("Existing List");
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Tier", type: "text" },
      as(sessionToken),
    );
    // Pre-existing contact: unsubscribed, with an existing custom field.
    await Parse.Cloud.run(
      "addContact",
      {
        audienceId: listId,
        email: "exists@example.com",
        status: "unsubscribed",
        customFields: { tier: "gold" },
      },
      as(sessionToken),
    );

    const csv = "email,first\nexists@example.com,Updated\n";
    const jobId = await makeJob({
      listId,
      mapping: { "0": "email", "1": "firstName" },
      consent: { source: "event" },
    });

    const res = await runJob(jobId, csv);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(1);

    const c = await contactByEmail("exists@example.com");
    expect(c!.get("firstName")).toBe("Updated");
    expect(c!.get("status")).toBe("unsubscribed"); // status preserved (F-07)
    expect(c!.get("customFields").tier).toBe("gold"); // merged, not clobbered
  });

  it("skips suppressed addresses", async () => {
    const listId = await makeList("Suppress List");
    await suppression.addSuppression({
      organization: orgId,
      email: "blocked@example.com",
      reason: "hard_bounce",
    });

    const csv =
      "email\n" +
      "ok@example.com\n" +
      "blocked@example.com\n";
    const jobId = await makeJob({
      listId,
      mapping: { "0": "email" },
      consent: { source: "manuallyEntered" },
    });

    const res = await runJob(jobId, csv);
    expect(res.created).toBe(1); // ok@
    expect(res.skippedSuppressed).toBe(1); // blocked@
    expect(await contactByEmail("blocked@example.com")).toBeUndefined();
  });

  it("rejects malformed / missing emails (skippedInvalid)", async () => {
    const listId = await makeList("Invalid List");
    const csv =
      "email,first\n" +
      "good@example.com,Good\n" +
      "not-an-email,Bad\n" +
      ",NoEmail\n";
    const jobId = await makeJob({
      listId,
      mapping: { "0": "email", "1": "firstName" },
      consent: { source: "signupForm" },
    });

    const res = await runJob(jobId, csv);
    expect(res.created).toBe(1);
    expect(res.skippedInvalid).toBe(2); // bad + empty

    // Errors captured for the errors.csv download.
    const job = await new Parse.Query("ImportJob").get(jobId, MK);
    const errors = job.get("errors") as Array<{ reason: string }>;
    expect(errors.length).toBe(2);
    expect(errors.every((e) => e.reason === "invalid_email")).toBe(true);
  });

  it("stamps consent { source, capturedAt, importJobId } on new contacts (F-29)", async () => {
    const listId = await makeList("Consent List");
    const csv = "email\nconsent@example.com\n";
    const jobId = await makeJob({
      listId,
      mapping: { "0": "email" },
      consent: { source: "purchase" },
    });

    await runJob(jobId, csv);
    const c = await contactByEmail("consent@example.com");
    const consent = c!.get("consent");
    expect(consent.source).toBe("purchase");
    expect(consent.importJobId).toBe(jobId);
    expect(typeof consent.capturedAt).toBe("string");
    expect(new Date(consent.capturedAt).toString()).not.toBe("Invalid Date");
  });

  it("handles a UTF-8 BOM on the first column", async () => {
    const listId = await makeList("BOM List");
    const csv = "﻿email\nbom@example.com\n";
    const jobId = await makeJob({
      listId,
      mapping: { "0": "email" },
      consent: { source: "signupForm" },
    });

    const res = await runJob(jobId, csv);
    expect(res.created).toBe(1);
    expect(await contactByEmail("bom@example.com")).toBeDefined();
  });

  it("ignores unmapped columns", async () => {
    const listId = await makeList("Ignore List");
    const csv = "email,junk\nkeep@example.com,DISCARD\n";
    const jobId = await makeJob({
      listId,
      mapping: { "0": "email", "1": "ignore" },
      consent: { source: "signupForm" },
    });

    await runJob(jobId, csv);
    const c = await contactByEmail("keep@example.com");
    expect(c).toBeDefined();
    // "junk" wasn't mapped to anything → no custom field leaked.
    expect(Object.keys(c!.get("customFields") || {})).not.toContain("junk");
  });
});
