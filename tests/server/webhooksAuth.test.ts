// SNS signature verification tests (Sending.md §3/§6). P0 security: the SES
// webhook must cryptographically verify the SNS signature in real mode, or an
// attacker could POST fake delivery/bounce/complaint events.
//
// These are PURE unit tests of the verify function + canonical-string builder —
// no Express boot, no network. We generate a throwaway RSA keypair + self-signed
// cert in-test, sign a canonical SNS string, and inject the cert via the
// fetcher hook so nothing hits AWS.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// server/ is CommonJS; load it with a CJS require.
const require = createRequire(import.meta.url);
const webhooks = require("../../server/routes/webhooks");

// --- Generate a throwaway RSA keypair + self-signed cert via openssl ---------
// crypto.X509Certificate can't *create* certs, so we shell out to openssl to
// produce a self-signed PEM cert wrapping our public key. The private key signs
// the canonical string; the cert (carrying the matching public key) verifies it.
function makeKeypairAndCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sns-test-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  // RSA 2048, self-signed cert valid 1 day.
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath,
    "-days", "1", "-subj", "/CN=sns.amazonaws.com",
  ]);
  const privateKey = fs.readFileSync(keyPath, "utf8");
  const certPem = fs.readFileSync(certPath, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { privateKey, certPem };
}

// Build a signed SNS Notification message given a private key + signing alg.
function signNotification(privateKey: string, alg: string, sigVersion: string, overrides: any = {}) {
  const message: any = {
    Type: "Notification",
    MessageId: "abc-123",
    TopicArn: "arn:aws:sns:us-east-1:123456789012:gorilla-ses-events",
    Message: JSON.stringify({ eventType: "Delivery" }),
    Timestamp: "2026-05-29T00:00:00.000Z",
    SignatureVersion: sigVersion,
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
    ...overrides,
  };
  const canonical = webhooks.buildCanonicalString(message);
  const signer = crypto.createSign(alg);
  signer.update(canonical, "utf8");
  message.Signature = signer.sign(privateKey, "base64");
  return message;
}

const { privateKey, certPem } = makeKeypairAndCert();
const injectedFetcher = async () => certPem;

describe("buildCanonicalString", () => {
  it("emits Notification keys in order, each as key\\nvalue\\n", () => {
    const msg = {
      Type: "Notification",
      MessageId: "m1",
      TopicArn: "arn:topic",
      Message: "hello",
      Timestamp: "t1",
    };
    const canonical = webhooks.buildCanonicalString(msg);
    // Order: Message, MessageId, (Subject skipped), Timestamp, TopicArn, Type
    expect(canonical).toBe(
      "Message\nhello\nMessageId\nm1\nTimestamp\nt1\nTopicArn\narn:topic\nType\nNotification\n",
    );
  });

  it("includes Subject only when present", () => {
    const withSubject = webhooks.buildCanonicalString({
      Type: "Notification",
      MessageId: "m1",
      Message: "hello",
      Subject: "hi",
      Timestamp: "t1",
      TopicArn: "arn",
    });
    expect(withSubject).toContain("Subject\nhi\n");
  });

  it("uses the SubscriptionConfirmation key set", () => {
    const canonical = webhooks.buildCanonicalString({
      Type: "SubscriptionConfirmation",
      MessageId: "m1",
      Message: "hello",
      SubscribeURL: "https://sns.example/confirm",
      Token: "tok",
      Timestamp: "t1",
      TopicArn: "arn",
    });
    expect(canonical).toContain("SubscribeURL\nhttps://sns.example/confirm\n");
    expect(canonical).toContain("Token\ntok\n");
  });

  it("returns null for an unknown Type", () => {
    expect(webhooks.buildCanonicalString({ Type: "Bogus" })).toBeNull();
  });
});

describe("verifySnsSignature", () => {
  it("verifies a correctly-signed SHA1 (SignatureVersion 1) message with the injected cert", async () => {
    const msg = signNotification(privateKey, "RSA-SHA1", "1");
    await expect(webhooks.verifySnsSignature(msg, injectedFetcher)).resolves.toBe(true);
  });

  it("verifies a correctly-signed SHA256 (SignatureVersion 2) message", async () => {
    const msg = signNotification(privateKey, "RSA-SHA256", "2");
    await expect(webhooks.verifySnsSignature(msg, injectedFetcher)).resolves.toBe(true);
  });

  it("rejects a tampered Message", async () => {
    const msg = signNotification(privateKey, "RSA-SHA1", "1");
    msg.Message = JSON.stringify({ eventType: "Bounce" }); // tamper after signing
    await expect(webhooks.verifySnsSignature(msg, injectedFetcher)).resolves.toBe(false);
  });

  it("rejects a tampered Signature", async () => {
    const msg = signNotification(privateKey, "RSA-SHA1", "1");
    msg.Signature = Buffer.from("garbage").toString("base64");
    await expect(webhooks.verifySnsSignature(msg, injectedFetcher)).resolves.toBe(false);
  });

  it("rejects a SigningCertURL that is not sns.<region>.amazonaws.com", async () => {
    const msg = signNotification(privateKey, "RSA-SHA1", "1", {
      SigningCertURL: "https://evil.amazonaws.com/cert.pem",
    });
    await expect(webhooks.verifySnsSignature(msg, injectedFetcher)).resolves.toBe(false);
  });

  it("rejects a non-https SigningCertURL", async () => {
    const msg = signNotification(privateKey, "RSA-SHA1", "1", {
      SigningCertURL: "http://sns.us-east-1.amazonaws.com/cert.pem",
    });
    await expect(webhooks.verifySnsSignature(msg, injectedFetcher)).resolves.toBe(false);
  });

  it("rejects an unknown SignatureVersion", async () => {
    const msg = signNotification(privateKey, "RSA-SHA256", "99");
    await expect(webhooks.verifySnsSignature(msg, injectedFetcher)).resolves.toBe(false);
  });

  it("rejects when the cert fetch throws", async () => {
    const msg = signNotification(privateKey, "RSA-SHA1", "1");
    const failing = async () => {
      throw new Error("network down");
    };
    await expect(webhooks.verifySnsSignature(msg, failing)).resolves.toBe(false);
  });

  it("rejects a message missing Signature/SigningCertURL", async () => {
    await expect(
      webhooks.verifySnsSignature({ Type: "Notification", SignatureVersion: "1" }, injectedFetcher),
    ).resolves.toBe(false);
  });
});

describe("isAuthentic mock/real gate", () => {
  const ORIG = process.env.AWS_SES_MODE;
  afterEach(() => {
    process.env.AWS_SES_MODE = ORIG;
  });

  it("mock mode accepts a structurally-valid UNSIGNED payload", async () => {
    process.env.AWS_SES_MODE = "mock";
    const unsigned = {
      Type: "Notification",
      MessageId: "m1",
      Message: JSON.stringify({ eventType: "Delivery" }),
      Timestamp: "t1",
      TopicArn: "arn",
    };
    await expect(webhooks.isAuthentic(unsigned)).resolves.toBe(true);
  });

  it("mock mode still rejects structurally-broken payloads (no MessageId)", async () => {
    process.env.AWS_SES_MODE = "mock";
    await expect(webhooks.isAuthentic({ Type: "Notification" })).resolves.toBe(false);
  });

  it("mock mode rejects an unknown Type", async () => {
    process.env.AWS_SES_MODE = "mock";
    await expect(
      webhooks.isAuthentic({ Type: "Bogus", MessageId: "m1" }),
    ).resolves.toBe(false);
  });

  it("real mode REJECTS the same unsigned payload mock mode accepts", async () => {
    process.env.AWS_SES_MODE = "real";
    const unsigned = {
      Type: "Notification",
      MessageId: "m1",
      Message: JSON.stringify({ eventType: "Delivery" }),
      Timestamp: "t1",
      TopicArn: "arn",
    };
    await expect(webhooks.isAuthentic(unsigned)).resolves.toBe(false);
  });

  it("real mode accepts a correctly-signed payload (cert injected via setCertFetcher)", async () => {
    process.env.AWS_SES_MODE = "real";
    webhooks.setCertFetcher(injectedFetcher);
    try {
      const msg = signNotification(privateKey, "RSA-SHA256", "2");
      await expect(webhooks.isAuthentic(msg)).resolves.toBe(true);
    } finally {
      webhooks.setCertFetcher(null); // restore default fetcher
    }
  });
});
