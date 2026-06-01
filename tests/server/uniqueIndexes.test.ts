// Mongo-backed tests for the unique-index enforcement (server/cloud/lib/
// uniqueIndexes.js) — the fix for "the *_unique indexes were never unique" (P0).
// Uses a throwaway in-memory Mongo + the raw driver; no parse-server needed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ensureUniqueIndexesOnDb } = require("../../server/cloud/lib/uniqueIndexes");

const ORG = "Organization$org1";

describe("ensureUniqueIndexes", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db("gorilla");
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it("creates the unique constraint and enforces it (Contact org+email)", async () => {
    const report = await ensureUniqueIndexesOnDb(db, log);
    expect(report.contact_org_email_unique).toBe("created");

    await db.collection("Contact").insertOne({ _p_organization: ORG, email: "a@example.com" });
    // Same org + email → must be rejected by the unique index.
    await expect(
      db.collection("Contact").insertOne({ _p_organization: ORG, email: "a@example.com" }),
    ).rejects.toThrow(/E11000|duplicate key/i);
    // Different email is fine.
    await db.collection("Contact").insertOne({ _p_organization: ORG, email: "b@example.com" });
    // Same email, different org is fine (org is part of the key).
    await db.collection("Contact").insertOne({ _p_organization: "Organization$org2", email: "a@example.com" });
  });

  it("is idempotent on a second run (all exist, no throw)", async () => {
    const report = await ensureUniqueIndexesOnDb(db, log);
    expect(report.contact_org_email_unique).toBe("exists");
    expect(report.send_campaign_contact_unique).toBe("exists");
  });

  it("makes sesMessageId sparse-unique (many nulls allowed, real dup blocked)", async () => {
    const sends = db.collection("CampaignSend");
    // Multiple rows with no sesMessageId (queued, not yet sent) must NOT collide.
    await sends.insertOne({ _p_campaign: "Campaign$c1", _p_contact: "Contact$ct1" });
    await sends.insertOne({ _p_campaign: "Campaign$c1", _p_contact: "Contact$ct2" });
    // Two real, identical sesMessageIds must collide.
    await sends.insertOne({ _p_campaign: "Campaign$c2", _p_contact: "Contact$ct3", sesMessageId: "ses-1" });
    await expect(
      sends.insertOne({ _p_campaign: "Campaign$c2", _p_contact: "Contact$ct4", sesMessageId: "ses-1" }),
    ).rejects.toThrow(/E11000|duplicate key/i);
  });

  it("enforces one CampaignSend per (campaign, contact)", async () => {
    const sends = db.collection("CampaignSend");
    await sends.insertOne({ _p_campaign: "Campaign$dup", _p_contact: "Contact$dup" });
    await expect(
      sends.insertOne({ _p_campaign: "Campaign$dup", _p_contact: "Contact$dup" }),
    ).rejects.toThrow(/E11000|duplicate key/i);
  });

  it("conversion uniqueness is partial on orderId (no-orderId rows not constrained)", async () => {
    const conv = db.collection("Conversion");
    // Two manual conversions with no orderId must coexist.
    await conv.insertOne({ _p_organization: ORG, sourceType: "manual" });
    await conv.insertOne({ _p_organization: ORG, sourceType: "manual" });
    // Two webhook conversions with the same orderId must collide.
    await conv.insertOne({ _p_organization: ORG, orderId: "o-1", sourceType: "shopify" });
    await expect(
      conv.insertOne({ _p_organization: ORG, orderId: "o-1", sourceType: "shopify" }),
    ).rejects.toThrow(/E11000|duplicate key/i);
  });

  it("migrates a stale NON-unique index of the same name to unique", async () => {
    const fresh = client.db("migrate-test");
    // Simulate the old bootstrap: a non-unique index under the *_unique name.
    await fresh
      .collection("Suppression")
      .createIndex({ _p_organization: 1, email: 1 }, { name: "suppression_org_email_unique" });
    // Insert a (single) row — no dup yet.
    await fresh.collection("Suppression").insertOne({ _p_organization: ORG, email: "s@example.com" });

    const report = await ensureUniqueIndexesOnDb(fresh, log);
    expect(report.suppression_org_email_unique).toBe("migrated");

    // Now unique: a duplicate is rejected.
    await expect(
      fresh.collection("Suppression").insertOne({ _p_organization: ORG, email: "s@example.com" }),
    ).rejects.toThrow(/E11000|duplicate key/i);
  });

  it("does not crash on pre-existing duplicate data; reports it and logs loudly", async () => {
    const dirty = client.db("dirty-test");
    // Two identical (org, email) contacts BEFORE the index exists.
    await dirty.collection("Contact").insertMany([
      { _p_organization: ORG, email: "dup@example.com" },
      { _p_organization: ORG, email: "dup@example.com" },
    ]);
    const localLogs: string[] = [];
    const report = await ensureUniqueIndexesOnDb(dirty, (m: string) => localLogs.push(m));
    expect(report.contact_org_email_unique).toBe("duplicate-data");
    expect(localLogs.some((l) => /DUPLICATE DATA in Contact/.test(l))).toBe(true);
    // It still processed the rest of the indexes.
    expect(report.apikey_prefix_unique).toBe("created");
  });
});
