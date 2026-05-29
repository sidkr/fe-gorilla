// ─────────────────────────────────────────────────────────────────────────────
// Mock SES adapter. CommonJS. DECISIONS #6.
//
// Returns a synthetic messageId (`mock-<random>`) and persists a MockSentMessage
// Parse object so tests + a future dev "outbox" can inspect exactly what would
// have been sent. NEVER hits the network. Writes with the master key (the mock
// runs in the same privileged contexts the real adapter does: worker jobs +
// sendTestEmail cloud fn).
//
// MockSentMessage is a GLOBAL mock store — NOT per-tenant, NOT in
// PER_TENANT_CLASSES. It is master-key-only (see bootstrapSchemas CLP).
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const crypto = require("crypto");

function randomMessageId() {
  return `mock-${crypto.randomBytes(16).toString("hex")}`;
}

function normalizeRecipients(v) {
  if (Array.isArray(v)) return v.join(", ");
  return v == null ? "" : String(v);
}

function createMockAdapter() {
  return {
    mode: "mock",

    async sendEmail({ from, to, replyTo, subject, html, headers, campaignSend }) {
      const messageId = randomMessageId();

      const MockSentMessage = Parse.Object.extend("MockSentMessage");
      const m = new MockSentMessage();
      m.set("from", from == null ? "" : String(from));
      m.set("to", normalizeRecipients(to));
      m.set("replyTo", normalizeRecipients(replyTo));
      m.set("subject", subject == null ? "" : String(subject));
      m.set("html", html == null ? "" : String(html));
      m.set("headers", headers || {});
      m.set("messageId", messageId);
      m.set("sentAt", new Date());
      if (campaignSend) m.set("campaignSend", campaignSend);

      // Master key: the mock store is global + locked to master-key access.
      // Don't let a persistence hiccup mask the "send" — but surface it.
      await m.save(null, { useMasterKey: true });

      return { messageId };
    },

    // Synthetic quota so callers that probe getSendQuota in dev get a shape
    // identical to the real adapter's.
    async getSendQuota() {
      return {
        Max24HourSend: 50000,
        MaxSendRate: 14,
        SentLast24Hours: 0,
        mock: true,
      };
    },
  };
}

module.exports = { createMockAdapter };
