// ─────────────────────────────────────────────────────────────────────────────
// Public signup-form endpoints (NextPhase §4 A2). Server-rendered, JS-optional,
// NO auth. Mirrors the style of routes/tracking.js. Mounted BEFORE Parse's /api.
//
//   GET  /f/:formId            → render the hosted form HTML
//   POST /f/:formId            → validate → create/merge Contact (+consent) →
//                                FormSubmission → redirect / thank-you
//   GET  /f/confirm/:token     → verify HMAC, flip Contact → subscribed
//   GET  /f/:formId/embed.js   → JS snippet that injects an <iframe> of the form
//
// Org is resolved from the Form row using the master key — NEVER from a session
// (these are public, unauthenticated pages). Confirm tokens are HMAC-signed via
// server/lib/trackingTokens.js (t:"fc"). Spam controls: a honeypot field
// (`website`) + a tiny per-IP in-memory rate limit.
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const Parse = require("parse/node");

const { signToken, verifyToken } = require("../lib/trackingTokens");
const { getSesAdapter } = require("../lib/ses");
const { optional } = require("../lib/env");
const { orgRoleACL } = require("../cloud/lib/tenancy");

const MK = { useMasterKey: true };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HONEYPOT = "website"; // bots fill this; humans never see it
const PUBLIC_BASE = (
  optional("TRACKING_BASE_URL", undefined) ||
  optional("PUBLIC_BASE_URL", undefined) ||
  "http://localhost:3000"
).replace(/\/$/, "");

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── tiny per-IP rate limit ──────────────────────────────────────────────────--
// In-memory sliding window; good enough to blunt a script. Real abuse control is
// a later wave (Phase C). Keyed by ip → array of recent timestamps.
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX = 10;
const rlHits = new Map();
function rateLimited(ip) {
  const key = ip || "unknown";
  const now = Date.now();
  const arr = (rlHits.get(key) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(key, arr);
  return arr.length > RL_MAX;
}
function resetRateLimit() {
  rlHits.clear();
}

// ── Form loading ─────────────────────────────────────────────────────────────
async function loadForm(formId) {
  if (!formId) return null;
  const q = new Parse.Query("Form");
  q.include("organization");
  try {
    return await q.get(formId, MK);
  } catch (_) {
    return null;
  }
}

function formFields(form) {
  const f = form.get("fields");
  if (Array.isArray(f) && f.length) return f;
  return [{ key: "email", label: "Email", type: "email", required: true }];
}

// ── confirm token ──────────────────────────────────────────────────────────--
function confirmToken(contactId, formId) {
  return signToken({ t: "fc", c: contactId, f: formId });
}

// ── Contact create / merge ───────────────────────────────────────────────────
// Resolves org from the Form (master key). Creates a Contact or merges onto an
// existing one for (org,email), stamping consent. Returns { contact, created }.
// Saves with master key + an explicit org-role ACL (Form/FormSubmission are not
// yet auto-stamped by tenantHooks — see forms.js cloud-fn header).
function buildOrgAcl(orgId) {
  return orgRoleACL(orgId);
}

async function findContactByEmail(org, email) {
  const q = new Parse.Query("Contact");
  q.equalTo("organization", org);
  q.equalTo("email", email);
  return (await q.first(MK)) || null;
}

async function upsertContact({ org, email, data, form, doubleOptIn }) {
  const acl = buildOrgAcl(org.id);
  const existing = await findContactByEmail(org, email);
  let contact;
  let created = false;
  if (existing) {
    contact = existing;
    if (contact.get("deleted") === true) contact.set("deleted", false);
  } else {
    const Contact = Parse.Object.extend("Contact");
    contact = new Contact();
    contact.set("email", email);
    contact.set("organization", org);
    contact.setACL(acl);
    created = true;
  }

  // Map known fields onto first/last name; everything else into customFields.
  const cf = { ...(contact.get("customFields") || {}) };
  for (const [k, v] of Object.entries(data || {})) {
    if (k === "email") continue;
    if (k === "firstName") contact.set("firstName", String(v));
    else if (k === "lastName") contact.set("lastName", String(v));
    else if (v != null && v !== "") cf[k] = v;
  }
  if (Object.keys(cf).length) contact.set("customFields", cf);

  // Consent — the whole point of a signup form.
  contact.set("consent", {
    source: "signup_form",
    capturedAt: new Date().toISOString(),
    formId: form.id,
  });

  // Double opt-in contacts start pending; otherwise subscribed. Don't downgrade
  // an already-subscribed contact to pending on a re-submit.
  if (doubleOptIn) {
    if (contact.get("status") !== "subscribed") contact.set("status", "pending");
  } else {
    contact.set("status", "subscribed");
  }

  // Add to the form's target list, if any.
  const listId = form.get("targetListId");
  if (listId) {
    const lists = new Set(contact.get("lists") || []);
    lists.add(listId);
    contact.set("lists", Array.from(lists));
  }

  await contact.save(null, MK);
  return { contact, created };
}

async function writeSubmission({ org, form, email, data, contact, confirmed, ip }) {
  const FormSubmission = Parse.Object.extend("FormSubmission");
  const sub = new FormSubmission();
  sub.set("organization", org);
  sub.set("form", form);
  sub.set("email", email);
  sub.set("data", data || {});
  if (contact) sub.set("contact", contact);
  sub.set("confirmed", confirmed === true);
  if (ip) sub.set("ip", ip);
  sub.setACL(buildOrgAcl(org.id));
  await sub.save(null, MK);

  // Best-effort denormalized counter on the Form.
  try {
    form.increment("submissionCount");
    await form.save(null, MK);
  } catch (_) {
    /* non-fatal */
  }
  return sub;
}

async function sendConfirmationEmail({ org, form, contact, email }) {
  const token = confirmToken(contact.id, form.id);
  const link = `${PUBLIC_BASE}/f/confirm/${encodeURIComponent(token)}`;
  const adapter = getSesAdapter();
  const fromEmail =
    (org && org.get && org.get("fromEmail")) || "no-reply@gorilla.example";
  const subject = "Please confirm your subscription";
  const html = htmlShell(
    subject,
    `<h1>Confirm your subscription</h1>
     <p>Tap the button below to confirm you'd like to receive these emails.</p>
     <p><a class="btn" href="${esc(link)}">Confirm subscription</a></p>
     <p class="muted sm">If you didn't request this, you can ignore this email.</p>`,
  );
  // Adapter contract (server/lib/ses): sendEmail({ from, to, subject, html }).
  return adapter.sendEmail({
    to: email,
    from: fromEmail,
    subject,
    html,
  });
}

// ── HTML rendering ───────────────────────────────────────────────────────────
// Minimal inline Pop-flavored styling so the public page is self-contained (no
// external CSS request). noindex — these are utility pages.
function htmlShell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  :root { --ink:#1c1917; --muted:#57534e; --border:#e7e5e4; --accent:#16a34a; }
  body { font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #f5f5f4; color: var(--ink); }
  .card { background: #fff; padding: 2.25rem; border-radius: 14px; width: min(28rem, 92vw);
          box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  h1 { font-size: 1.3rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1rem; color: var(--muted); }
  label { display: block; font-weight: 600; font-size: .9rem; margin: 0 0 .35rem; color: var(--ink); }
  .field { margin: 0 0 1rem; }
  input[type=text], input[type=email], input[type=number], select {
    width: 100%; box-sizing: border-box; font: inherit; padding: .6rem .7rem;
    border: 1px solid var(--border); border-radius: 8px; }
  .hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
  button, .btn { font: inherit; font-weight: 600; cursor: pointer; border: 0; border-radius: 8px;
           padding: .7rem 1.4rem; background: var(--accent); color: #fff; text-decoration: none;
           display: inline-block; }
  button:hover, .btn:hover { filter: brightness(.95); }
  .muted { color: var(--muted); } .sm { font-size: .85rem; }
  .err { color: #b91c1c; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function renderFormPage(form, opts) {
  const o = opts || {};
  const fields = formFields(form);
  const inputs = fields
    .map((f) => {
      const id = `f_${esc(f.key)}`;
      const req = f.required ? " required" : "";
      const label = `<label for="${id}">${esc(f.label || f.key)}</label>`;
      if (f.type === "select" && Array.isArray(f.options)) {
        const opts2 = f.options
          .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
          .join("");
        return `<div class="field">${label}<select id="${id}" name="${esc(f.key)}"${req}>${opts2}</select></div>`;
      }
      const type =
        f.type === "email" ? "email" : f.type === "number" ? "number" : "text";
      return `<div class="field">${label}<input id="${id}" type="${type}" name="${esc(f.key)}"${req}></div>`;
    })
    .join("");

  const errBlock = o.error ? `<p class="err">${esc(o.error)}</p>` : "";
  const btn = esc(form.get("submitButtonText") || "Subscribe");
  return htmlShell(
    form.get("name") || "Sign up",
    `<h1>${esc(form.get("name") || "Sign up")}</h1>
     ${errBlock}
     <form method="POST" action="/f/${esc(form.id)}">
       ${inputs}
       <div class="hp" aria-hidden="true">
         <label for="f_${HONEYPOT}">Leave this empty</label>
         <input id="f_${HONEYPOT}" type="text" name="${HONEYPOT}" tabindex="-1" autocomplete="off">
       </div>
       <button type="submit">${btn}</button>
     </form>`,
  );
}

function thankYouPage(form, opts) {
  const o = opts || {};
  const msg = o.pending
    ? "Almost there! Check your inbox to confirm your subscription."
    : "Thanks for subscribing.";
  return htmlShell(
    "Thank you",
    `<h1>Thank you</h1><p>${esc(msg)}</p>`,
  );
}

const CONFIRMED_PAGE = htmlShell(
  "Subscription confirmed",
  `<h1>You're subscribed</h1><p>Your subscription is confirmed. Thank you!</p>`,
);

const INVALID_PAGE = htmlShell(
  "Invalid link",
  `<h1>This link is invalid</h1><p class="muted">The link is malformed or has expired.</p>`,
);

const NOT_FOUND_PAGE = htmlShell(
  "Form not found",
  `<h1>Form not found</h1><p class="muted">This signup form does not exist.</p>`,
);

// ── core handlers (exported for unit tests; no Express needed) ────────────────

// Process a submission. `body` is the parsed form body, `ip` the client ip.
// Returns { ok, status, contact?, submission?, redirect?, pending?, error? }.
async function handleSubmit(form, body, ip) {
  body = body || {};

  // Honeypot — silently accept (200) so the bot can't tell, but do nothing.
  if (String(body[HONEYPOT] || "").trim() !== "") {
    return { ok: false, status: "honeypot" };
  }
  if (rateLimited(ip)) {
    return { ok: false, status: "rate_limited", error: "Too many submissions. Please try again later." };
  }

  const org = form.get("organization");
  if (!org) {
    return { ok: false, status: "no_org", error: "This form is misconfigured." };
  }

  const email = normEmail(body.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, status: "invalid_email", error: "A valid email is required." };
  }

  // Required-field validation against the form definition.
  for (const f of formFields(form)) {
    if (f.required && String(body[f.key] == null ? "" : body[f.key]).trim() === "") {
      return {
        ok: false,
        status: "missing_field",
        error: `${f.label || f.key} is required.`,
      };
    }
  }

  // Collect declared fields (+ email) plus the standard name fields if present,
  // so a form that only declares "email" can still capture a posted firstName.
  const declared = new Set(formFields(form).map((f) => f.key));
  declared.add("email");
  declared.add("firstName");
  declared.add("lastName");
  const data = {};
  for (const k of declared) {
    if (body[k] != null && body[k] !== "") data[k] = body[k];
  }

  const doubleOptIn = form.get("doubleOptIn") === true;
  const { contact, created } = await upsertContact({
    org,
    email,
    data,
    form,
    doubleOptIn,
  });

  const submission = await writeSubmission({
    org,
    form,
    email,
    data,
    contact,
    confirmed: !doubleOptIn,
    ip,
  });

  if (doubleOptIn) {
    try {
      await sendConfirmationEmail({ org, form, contact, email });
    } catch (err) {
      console.error("[forms] confirmation email failed:", err && err.message);
    }
  }

  return {
    ok: true,
    status: "subscribed_or_pending",
    contact,
    submission,
    created,
    pending: doubleOptIn,
    redirect: form.get("redirectUrl") || "",
  };
}

// Confirm a double-opt-in contact from a token. Returns { ok, contact? }.
async function confirmFromToken(token) {
  const payload = verifyToken(token);
  if (!payload || payload.t !== "fc" || !payload.c) {
    return { ok: false };
  }
  let contact;
  try {
    contact = await new Parse.Query("Contact").get(payload.c, MK);
  } catch (_) {
    return { ok: false };
  }
  if (contact.get("status") !== "subscribed") {
    contact.set("status", "subscribed");
    await contact.save(null, MK);
  }

  // Mark the matching submission(s) confirmed (best-effort).
  try {
    if (payload.f) {
      const q = new Parse.Query("FormSubmission");
      q.equalTo("contact", contact);
      q.descending("createdAt");
      q.limit(1);
      const sub = await q.first(MK);
      if (sub && sub.get("confirmed") !== true) {
        sub.set("confirmed", true);
        await sub.save(null, MK);
      }
    }
  } catch (_) {
    /* non-fatal */
  }
  return { ok: true, contact };
}

// The embeddable snippet: a self-executing script that injects an iframe of the
// hosted form so a site owner can paste ONE <script> tag.
function embedScript(formId, origin) {
  const src = `${origin}/f/${formId}`;
  return `(function(){
  var s = document.currentScript;
  var f = document.createElement('iframe');
  f.src = ${JSON.stringify(src)};
  f.style.border = '0';
  f.style.width = '100%';
  f.style.minHeight = '480px';
  f.setAttribute('title', 'Signup form');
  f.setAttribute('loading', 'lazy');
  if (s && s.parentNode) { s.parentNode.insertBefore(f, s); }
  else { document.body.appendChild(f); }
})();`;
}

// ── Express wiring ───────────────────────────────────────────────────────────
function mount(app) {
  // Render the hosted form.
  app.get("/f/:formId", async (req, res) => {
    const form = await loadForm(req.params.formId);
    if (!form) return res.status(404).type("html").send(NOT_FOUND_PAGE);
    if (form.get("status") === "inactive") {
      return res
        .status(404)
        .type("html")
        .send(NOT_FOUND_PAGE);
    }
    res.status(200).type("html").send(renderFormPage(form));
  });

  // Embed snippet.
  app.get("/f/:formId/embed.js", async (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res
      .status(200)
      .type("application/javascript")
      .set("Cache-Control", "public, max-age=300")
      .send(embedScript(String(req.params.formId), origin));
  });

  // Submit.
  app.post(
    "/f/:formId",
    express.urlencoded({ extended: false }),
    async (req, res) => {
      const form = await loadForm(req.params.formId);
      if (!form) return res.status(404).type("html").send(NOT_FOUND_PAGE);

      let result;
      try {
        result = await handleSubmit(form, req.body, req.ip);
      } catch (err) {
        console.error("[forms] submit failed:", err && err.message);
        return res
          .status(500)
          .type("html")
          .send(
            renderFormPage(form, { error: "Something went wrong. Please try again." }),
          );
      }

      // Honeypot: pretend success without doing anything.
      if (!result.ok && result.status === "honeypot") {
        return res.status(200).type("html").send(thankYouPage(form));
      }
      if (!result.ok) {
        const code = result.status === "rate_limited" ? 429 : 400;
        return res
          .status(code)
          .type("html")
          .send(renderFormPage(form, { error: result.error }));
      }

      if (result.redirect) {
        return res.redirect(302, result.redirect);
      }
      return res.status(200).type("html").send(thankYouPage(form, { pending: result.pending }));
    },
  );

  // Confirm (double opt-in).
  app.get("/f/confirm/:token", async (req, res) => {
    let result;
    try {
      result = await confirmFromToken(req.params.token);
    } catch (err) {
      console.error("[forms] confirm failed:", err && err.message);
      return res.status(500).type("html").send(INVALID_PAGE);
    }
    if (!result.ok) return res.status(400).type("html").send(INVALID_PAGE);
    return res.status(200).type("html").send(CONFIRMED_PAGE);
  });
}

module.exports = {
  mount,
  // Exported for unit tests (logic without booting Express).
  handleSubmit,
  confirmFromToken,
  upsertContact,
  confirmToken,
  embedScript,
  renderFormPage,
  resetRateLimit,
  HONEYPOT,
};
