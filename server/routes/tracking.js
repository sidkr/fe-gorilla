// Tracking endpoints. Sending.md §10 (open/click) + §11 (unsubscribe).
//
// GET  /t/o/:token  → 1x1 GIF + EmailEvent { type: "open" }
// GET  /t/c/:token  → 302 → originalUrl + EmailEvent { type: "click", linkUrl }
// GET  /u/:token    → confirmation page
// POST /u/:token    → unsubscribe (confirm form + List-Unsubscribe-Post one-click)
//
// All tokens are HMAC-signed via server/lib/trackingTokens.js. The token is not
// a secret (it carries a sendId), so an invalid OPEN token still returns the GIF
// rather than leaking via a different status. Mounted BEFORE Parse's /api.
const express = require("express");
const Parse = require("parse/node");

const { verifyToken } = require("../lib/trackingTokens");
const { bumpCounter, setFirst } = require("../lib/campaignCounters");
const { addSuppression } = require("../lib/suppression");

const MK = { useMasterKey: true };

// 1×1 transparent GIF (43 bytes).
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// Trim an IP to its first 3 octets for privacy ("203.0.113.7" → "203.0.113.0").
// Leaves anything non-IPv4 (IPv6, undefined) as-is/empty.
function anonymizeIp(ip) {
  if (!ip || typeof ip !== "string") return undefined;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!m) return ip;
  return `${m[1]}.${m[2]}.${m[3]}.0`;
}

// Load a CampaignSend by id with the pointers the handlers need. Returns null if
// the send was deleted (token outlives the row).
async function loadSend(sendId) {
  if (!sendId) return null;
  const q = new Parse.Query("CampaignSend");
  q.include("organization");
  q.include("campaign");
  q.include("contact");
  try {
    return await q.get(sendId, MK);
  } catch (_) {
    return null;
  }
}

function newEvent(type, send) {
  const EmailEvent = Parse.Object.extend("EmailEvent");
  const ev = new EmailEvent();
  ev.set("type", type);
  ev.set("timestamp", new Date());
  const org = send.get("organization");
  const campaign = send.get("campaign");
  const contact = send.get("contact");
  if (org) ev.set("organization", org);
  if (campaign) ev.set("campaign", campaign);
  ev.set("campaignSend", send);
  if (contact) ev.set("contact", contact);
  return ev;
}

// ── open ───────────────────────────────────────────────────────────────────--
// Record the open out-of-band; the response (the GIF) never waits on the DB and
// never fails because of it.
async function recordOpen(payload, req) {
  const send = await loadSend(payload.sendId);
  if (!send) return;
  const now = new Date();
  const ev = newEvent("open", send);
  ev.set("userAgent", req.get("user-agent") || undefined);
  ev.set("ipAddress", anonymizeIp(req.ip));
  await ev.save(null, MK);
  // Unique open: bump the campaign counter only the first time this send opens.
  if (await setFirst(send, "openedAt", now)) {
    const campaign = send.get("campaign");
    if (campaign) await bumpCounter(campaign, "openCount");
  }
}

// ── click ──────────────────────────────────────────────────────────────────--
async function recordClick(payload, req) {
  const send = await loadSend(payload.sendId);
  if (!send) return;
  const now = new Date();
  const ev = newEvent("click", send);
  ev.set("linkUrl", payload.url);
  if (payload.linkId != null) ev.set("linkId", String(payload.linkId));
  ev.set("userAgent", req.get("user-agent") || undefined);
  ev.set("ipAddress", anonymizeIp(req.ip));
  await ev.save(null, MK);
  if (await setFirst(send, "clickedAt", now)) {
    const campaign = send.get("campaign");
    if (campaign) await bumpCounter(campaign, "clickCount");
  }
}

// ── unsubscribe ──────────────────────────────────────────────────────────────
// Idempotent: a repeat POST still 200s and never double-bumps the counter
// (gated on Contact.unsubscribed already being set).
async function recordUnsub(payload) {
  const send = await loadSend(payload.sendId);
  if (!send) return;
  const org = send.get("organization");
  const contact = send.get("contact");
  const campaign = send.get("campaign");
  const email = (contact && contact.get && contact.get("email")) || send.get("email");

  if (org && email) {
    await addSuppression({
      organization: org,
      email,
      reason: "unsubscribe",
      campaign: campaign || undefined,
    });
  }

  const alreadyUnsubbed = contact && contact.get && contact.get("unsubscribed") === true;
  const now = new Date();

  if (contact && contact.get) {
    contact.set("unsubscribed", true);
    contact.set("status", "unsubscribed");
    if (!contact.get("unsubscribedAt")) contact.set("unsubscribedAt", now);
    await contact.save(null, MK);
  }

  // First-event timestamp on the send + the unique unsubscribe counter bump.
  const firstOnSend = await setFirst(send, "unsubscribedAt", now);

  const ev = newEvent("unsubscribe", send);
  await ev.save(null, MK);

  // Count an unsubscribe once. Use the contact flag as the idempotency gate so a
  // repeat one-click POST (RFC 8058 retries) doesn't inflate the counter.
  if (campaign && !alreadyUnsubbed && firstOnSend) {
    await bumpCounter(campaign, "unsubscribeCount");
  }
}

// ── HTML pages ───────────────────────────────────────────────────────────────
function htmlShell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  body { font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #f5f5f4; color: #1c1917; }
  .card { background: #fff; padding: 2.5rem; border-radius: 12px; max-width: 28rem;
          box-shadow: 0 1px 3px rgba(0,0,0,.1); text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1.5rem; color: #57534e; }
  button { font: inherit; cursor: pointer; border: 0; border-radius: 8px;
           padding: .65rem 1.4rem; background: #1c1917; color: #fff; }
  button:hover { background: #292524; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function confirmPage(token) {
  return htmlShell(
    "Unsubscribe",
    `<h1>Unsubscribe from these emails?</h1>
     <p>You won't receive further emails from this sender.</p>
     <form method="POST" action="/u/${encodeURIComponent(token)}">
       <button type="submit">Unsubscribe</button>
     </form>`,
  );
}

const DONE_PAGE = htmlShell(
  "Unsubscribed",
  `<h1>You're unsubscribed</h1>
   <p>You won't receive further emails from this sender.</p>`,
);

const INVALID_PAGE = htmlShell(
  "Invalid link",
  `<h1>This link is invalid</h1>
   <p>The unsubscribe link is malformed or has expired.</p>`,
);

function mount(app) {
  // Open pixel.
  app.get("/t/o/:token", (req, res) => {
    const payload = verifyToken(req.params.token);
    if (payload && payload.t === "o") {
      // Fire-and-forget — never block or fail the pixel response on the DB.
      recordOpen(payload, req).catch((err) =>
        console.error("[tracking] open record failed:", err && err.message),
      );
    }
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.type("gif");
    res.status(200).end(PIXEL);
  });

  // Click redirect.
  app.get("/t/c/:token", (req, res) => {
    const payload = verifyToken(req.params.token);
    if (!payload || payload.t !== "c" || !payload.url) {
      return res.status(400).type("text/plain").send("Invalid tracking link.");
    }
    recordClick(payload, req).catch((err) =>
      console.error("[tracking] click record failed:", err && err.message),
    );
    res.redirect(302, payload.url);
  });

  // Unsubscribe confirmation page.
  app.get("/u/:token", (req, res) => {
    const payload = verifyToken(req.params.token);
    if (!payload || payload.t !== "u") {
      return res.status(400).type("html").send(INVALID_PAGE);
    }
    res.status(200).type("html").send(confirmPage(req.params.token));
  });

  // Unsubscribe action: confirm form submit + RFC 8058 one-click POST body.
  app.post(
    "/u/:token",
    express.urlencoded({ extended: false }),
    async (req, res) => {
      const payload = verifyToken(req.params.token);
      if (!payload || payload.t !== "u") {
        return res.status(400).type("html").send(INVALID_PAGE);
      }
      try {
        await recordUnsub(payload);
      } catch (err) {
        console.error("[tracking] unsubscribe failed:", err && err.message);
        return res
          .status(500)
          .type("html")
          .send(htmlShell("Error", "<h1>Something went wrong</h1><p>Please try again.</p>"));
      }
      res.status(200).type("html").send(DONE_PAGE);
    },
  );
}

module.exports = {
  mount,
  // Exported for unit tests (logic without booting Express).
  anonymizeIp,
  recordOpen,
  recordClick,
  recordUnsub,
};
