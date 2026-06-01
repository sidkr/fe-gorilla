// Send-pipeline FOUNDATION tests (DECISIONS #12). Covers the shared contract
// layer the 6 feature agents build on:
//   - mock SES adapter: sendEmail returns a messageId + writes a MockSentMessage
//   - trackingTokens: sign→verify roundtrip + tamper→null + builder shapes
//   - renderEmail: resolveMergeFields (token/default/missing/reserved) +
//     injectTracking (pixel added, links rewritten, mailto skipped)
//   - suppression: add + isSuppressed + idempotent upsert
//
// The SES adapter + suppression libs require("parse/node"), which is the SAME
// SDK singleton startTestParseServer initializes — so master-key writes from the
// libs hit the in-memory Parse Server with no extra wiring.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// server/ is CommonJS; load its libs with a CJS require.
const require = createRequire(import.meta.url);

describe("send pipeline foundation", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  // libs (loaded after the harness inits the SDK)
  let ses: any;
  let trackingTokens: any;
  let renderEmail: any;
  let suppression: any;

  let sessionToken: string;
  let orgId: string;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;

    ses = require("../../server/lib/ses");
    trackingTokens = require("../../server/lib/trackingTokens");
    renderEmail = require("../../server/lib/renderEmail");
    suppression = require("../../server/lib/suppression");

    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "sender@example.com",
      password: "hunter2hunter2",
      email: "sender@example.com",
      name: "Sender",
      company: "Send Co",
    })) as { sessionToken: string; orgId: string };
    sessionToken = r.sessionToken;
    orgId = r.orgId;
    expect(sessionToken).toBeTruthy();
    expect(orgId).toBeTruthy();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  // ── mock SES adapter ───────────────────────────────────────────────────────
  describe("mock SES adapter", () => {
    it("returns a messageId and writes a MockSentMessage", async () => {
      const adapter = ses.getSesAdapter();
      expect(adapter.mode).toBe("mock");

      const res = await adapter.sendEmail({
        from: '"Sender" <sender@send.gorilla.email>',
        to: "rcpt@example.com",
        replyTo: "reply@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
        headers: { "List-Unsubscribe": "<https://x/u/abc>" },
      });

      expect(res.messageId).toMatch(/^mock-/);

      const q = new Parse.Query("MockSentMessage");
      q.equalTo("messageId", res.messageId);
      const row = await q.first({ useMasterKey: true });
      expect(row).toBeDefined();
      expect(row!.get("to")).toBe("rcpt@example.com");
      expect(row!.get("subject")).toBe("Hello");
      expect(row!.get("html")).toBe("<p>Hi</p>");
      expect(row!.get("headers")["List-Unsubscribe"]).toBe("<https://x/u/abc>");
      expect(row!.get("sentAt")).toBeInstanceOf(Date);
    });

    it("never returns the same messageId twice", async () => {
      const adapter = ses.getSesAdapter();
      const a = await adapter.sendEmail({ to: "a@example.com", subject: "s", html: "<p/>" });
      const b = await adapter.sendEmail({ to: "b@example.com", subject: "s", html: "<p/>" });
      expect(a.messageId).not.toBe(b.messageId);
    });
  });

  // ── tracking tokens ──────────────────────────────────────────────────────--
  describe("trackingTokens", () => {
    it("sign → verify roundtrips the payload", () => {
      const payload = { t: "o", sendId: "abc123", n: 7 };
      const token = trackingTokens.signToken(payload);
      expect(typeof token).toBe("string");
      expect(token).toContain(".");
      expect(trackingTokens.verifyToken(token)).toEqual(payload);
    });

    it("returns null on a tampered token", () => {
      const token = trackingTokens.signToken({ sendId: "abc" });
      // Flip the last char of the body (before the dot).
      const dot = token.indexOf(".");
      const body = token.slice(0, dot);
      const tag = token.slice(dot);
      const flipped = body.slice(0, -1) + (body.slice(-1) === "A" ? "B" : "A");
      expect(trackingTokens.verifyToken(flipped + tag)).toBeNull();
    });

    it("returns null on garbage / malformed input", () => {
      expect(trackingTokens.verifyToken("garbage")).toBeNull();
      expect(trackingTokens.verifyToken("")).toBeNull();
      expect(trackingTokens.verifyToken(".")).toBeNull();
      expect(trackingTokens.verifyToken("a.b.c")).toBeNull();
      expect(trackingTokens.verifyToken(null as any)).toBeNull();
    });

    it("builders produce verifiable tokens with the right shape", () => {
      const o = trackingTokens.verifyToken(trackingTokens.openToken("s1"));
      expect(o).toMatchObject({ t: "o", sendId: "s1" });

      const c = trackingTokens.verifyToken(
        trackingTokens.clickToken("s1", "https://example.com/x", "lnk1"),
      );
      expect(c).toMatchObject({ t: "c", sendId: "s1", url: "https://example.com/x", linkId: "lnk1" });

      const u = trackingTokens.verifyToken(trackingTokens.unsubToken("s1"));
      expect(u).toMatchObject({ t: "u", sendId: "s1" });
    });
  });

  // ── renderEmail ──────────────────────────────────────────────────────────--
  describe("renderEmail.resolveMergeFields", () => {
    it("substitutes plain + custom keys and HTML-escapes values", () => {
      const html = "Hi {{firstName}} from {{custom.company}}";
      const out = renderEmail.resolveMergeFields(html, {
        firstName: "A<b>",
        "custom.company": "Acme & Co",
      });
      expect(out).toBe("Hi A&lt;b&gt; from Acme &amp; Co");
    });

    it("uses the inline default when the field is missing", () => {
      const out = renderEmail.resolveMergeFields("Hey {{firstName|there}}", {});
      expect(out).toBe("Hey there");
    });

    it("uses empty string when missing and no default", () => {
      const out = renderEmail.resolveMergeFields("X{{nope}}Y", {});
      expect(out).toBe("XY");
    });

    it("leaves reserved link placeholders untouched", () => {
      const html = "{{unsubscribeUrl}} {{webVersionUrl}}";
      const out = renderEmail.resolveMergeFields(html, { unsubscribeUrl: "evil" });
      expect(out).toBe("{{unsubscribeUrl}} {{webVersionUrl}}");
    });
  });

  describe("renderEmail.injectTracking", () => {
    it("adds the open pixel before </body> and rewrites links", () => {
      const html =
        '<body><a href="https://example.com/sale">Shop</a>' +
        '<a href="mailto:x@y.com">Mail</a>' +
        '<a href="#frag">Jump</a></body>';
      const out = renderEmail.injectTracking(html, {
        pixelUrl: "https://t/o/PIX",
        rewriteHref: (u: string) => `https://t/c/${encodeURIComponent(u)}`,
      });

      // pixel inserted before </body>
      expect(out).toContain('<img src="https://t/o/PIX"');
      expect(out.indexOf("PIX")).toBeLessThan(out.indexOf("</body>"));
      // real link rewritten
      expect(out).toContain("https://t/c/" + encodeURIComponent("https://example.com/sale"));
      // mailto + # left alone
      expect(out).toContain('href="mailto:x@y.com"');
      expect(out).toContain('href="#frag"');
    });

    it("appends the pixel at the end when there's no </body>", () => {
      const out = renderEmail.injectTracking("<p>hi</p>", { pixelUrl: "https://t/o/Z" });
      expect(out.endsWith("/>")).toBe(true);
      expect(out).toContain("https://t/o/Z");
    });
  });

  describe("renderEmail.injectUnsubscribe + listUnsubHeaders", () => {
    it("replaces the unsubscribe placeholder with the real URL", () => {
      const out = renderEmail.injectUnsubscribe(
        'See <a href="{{unsubscribeUrl}}">unsub</a>',
        "https://api/u/TOKEN",
      );
      expect(out).toContain('href="https://api/u/TOKEN"');
    });

    it("builds the List-Unsubscribe header pair", () => {
      const h = renderEmail.listUnsubHeaders("https://api/u/TOKEN");
      expect(h["List-Unsubscribe"]).toBe("<https://api/u/TOKEN>");
      expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    });
  });

  // ── suppression ──────────────────────────────────────────────────────────--
  describe("suppression", () => {
    it("add + isSuppressed (lowercased) and idempotent upsert", async () => {
      const email = "Bouncer@Example.COM";
      expect(await suppression.isSuppressed(orgId, email)).toBe(false);

      const row = await suppression.addSuppression({
        organization: orgId,
        email,
        reason: "hard_bounce",
      });
      expect(row.get("email")).toBe("bouncer@example.com");
      expect(row.get("reason")).toBe("hard_bounce");
      expect(row.get("eventCount")).toBe(1);

      // Lookup is case-insensitive on the input.
      expect(await suppression.isSuppressed(orgId, "bouncer@example.com")).toBe(true);
      expect(await suppression.isSuppressed(orgId, "BOUNCER@EXAMPLE.COM")).toBe(true);

      // Idempotent: a repeat bumps eventCount instead of duplicating.
      const again = await suppression.addSuppression({
        organization: orgId,
        email: "bouncer@example.com",
        reason: "complaint",
      });
      expect(again.id).toBe(row.id);
      expect(again.get("eventCount")).toBe(2);

      const q = new Parse.Query("Suppression");
      q.equalTo("organization", suppression.toOrgPointer(orgId));
      q.equalTo("email", "bouncer@example.com");
      expect(await q.count({ useMasterKey: true })).toBe(1);
    });

    it("does not leak across orgs", async () => {
      const other = (await Parse.Cloud.run("signUpWithOrg", {
        username: "other@example.com",
        password: "hunter2hunter2",
        email: "other@example.com",
        name: "Other",
        company: "Other Co",
      })) as { orgId: string };

      await suppression.addSuppression({
        organization: orgId,
        email: "shared@example.com",
        reason: "unsubscribe",
      });
      expect(await suppression.isSuppressed(orgId, "shared@example.com")).toBe(true);
      expect(await suppression.isSuppressed(other.orgId, "shared@example.com")).toBe(false);
    });
  });
});
