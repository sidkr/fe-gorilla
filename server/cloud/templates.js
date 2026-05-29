// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for Template — system starter templates + org-owned templates.
// CommonJS (server/package.json is "type":"commonjs"). See Features F-13/F-14.
//
// TENANCY MODEL (matches lib/tenancy.js):
//   - ORG templates: created as the logged-in user (sessionToken). The
//     tenantHooks beforeSave stamps `organization` + a role-restricted ACL
//     automatically — so we never set those by hand here.
//   - SYSTEM/starter templates: GLOBAL (organization = null), isSystem:true,
//     saved with { useMasterKey:true } and a PUBLIC-READ ACL so every tenant
//     can read them but none can write. Seeded idempotently by a stable key
//     (`seedKey`) so running the seed twice never creates duplicates.
//
// CAMPAIGN BODY CONTRACT (shared with the editor + campaigns/new.vue):
//   A Campaign's design lives under `body` as { version:1, blocks:[...] }
//   (see components/app/editor/blocks/registry.ts → Body). Templates store the
//   SAME shape in `Template.body`. `useTemplate` forks `Template.body` into a
//   NEW Campaign's `body` field so the existing editor opens it unchanged.
//
// Cloud functions:
//   listTemplates()                      → { system: [...], org: [...] }
//   useTemplate({ id })                  → { campaignId }  (forks blocks → new Campaign draft)
//   saveAsTemplate({ campaignId, name }) → { id }          (org Template from a campaign)
//   deleteTemplate({ id })               → { ok }          (org templates only)
//   seedSystemTemplates()                → { seeded, total } (idempotent; safe to re-run)
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");

const MAX_NAME_LEN = 80;

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "You must be signed in.",
    );
  }
  return request.user;
}

// Block builders live in ./templates/_helpers so the per-category template
// files (newsletters.js, promotions.js, …) can share the exact same shape.
const { blockId, block, footerBlock, body } = require("./templates/_helpers");

// ── System starter template definitions ──────────────────────────────────────
// Six starters (F-13). `seedKey` is the idempotency key — stable, never shown.
// `body.blocks` use the editor's block schema (registry.ts). Each ends with a
// footer for CAN-SPAM compliance (blank intentionally omits body content but
// still keeps the footer so a forked campaign is send-ready).
const STARTERS = [
  {
    seedKey: "system/newsletter",
    name: "Standard newsletter",
    subject: "The latest from {{company}}",
    previewText: "Your monthly roundup of news and updates.",
    body: () =>
      body([
        block("heading", { text: "This month at our company", level: 1, align: "left", color: "#1A1A1A" }),
        block("paragraph", { html: "Here is everything new since we last wrote. Thanks for reading.", align: "left", color: "#1A1A1A" }),
        block("image", { src: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80&auto=format&fit=crop", alt: "", width: 600, align: "center", linkHref: "" }),
        block("heading", { text: "Headline story", level: 2, align: "left", color: "#1A1A1A" }),
        block("paragraph", { html: "Walk your readers through the most important update. Keep paragraphs short and scannable.", align: "left", color: "#1A1A1A" }),
        block("button", { label: "Read more", href: "https://example.com", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 10 }),
        block("divider", { color: "#E5E5E7", thickness: 1 }),
        footerBlock(),
      ]),
  },
  {
    seedKey: "system/product-announcement",
    name: "Product announcement",
    subject: "Introducing something new",
    previewText: "We just shipped something we think you'll love.",
    body: () =>
      body([
        block("image", { src: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&q=80&auto=format&fit=crop", alt: "", width: 600, align: "center", linkHref: "" }),
        block("heading", { text: "Say hello to our newest feature", level: 1, align: "center", color: "#1A1A1A" }),
        block("paragraph", { html: "A short, punchy description of what it does and why it matters to your readers.", align: "center", color: "#1A1A1A" }),
        block("button", { label: "Try it now", href: "https://example.com", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 }),
        footerBlock(),
      ]),
  },
  {
    seedKey: "system/welcome",
    name: "Welcome email",
    subject: "Welcome aboard!",
    previewText: "We're glad you're here — let's get you started.",
    body: () =>
      body([
        block("heading", { text: "Welcome aboard", level: 1, align: "center", color: "#1A1A1A" }),
        block("image", { src: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=600&q=80&auto=format&fit=crop", alt: "A friendly team ready to help you get started", width: 600, align: "center", linkHref: "" }),
        block("paragraph", { html: "Thanks for joining us. Here's how to get the most out of your account from day one.", align: "center", color: "#1A1A1A" }),
        block("button", { label: "Get started", href: "https://example.com", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 }),
        block("divider", { color: "#E5E5E7", thickness: 1 }),
        block("paragraph", { html: "Questions? Just reply to this email — a real person reads every one.", align: "center", color: "#1A1A1A" }),
        footerBlock(),
      ]),
  },
  {
    seedKey: "system/plain-text",
    name: "Plain text update",
    subject: "A quick note",
    previewText: "A simple, text-only update.",
    body: () =>
      body([
        block("paragraph", { html: "Hi there,", align: "left", color: "#1A1A1A" }),
        block("paragraph", { html: "This is a plain, text-only message — no images, no buttons. Great for personal notes and announcements that should feel like a 1:1 email.", align: "left", color: "#1A1A1A" }),
        block("paragraph", { html: "Best,\nThe team", align: "left", color: "#1A1A1A" }),
        footerBlock(),
      ]),
  },
  {
    seedKey: "system/basic",
    name: "Basic header, body & CTA",
    subject: "{{subject}}",
    previewText: "A simple header, paragraph, and call-to-action.",
    body: () =>
      body([
        block("heading", { text: "Your headline goes here", level: 1, align: "center", color: "#1A1A1A" }),
        block("image", { src: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600&q=80&auto=format&fit=crop", alt: "Add your own hero image here", width: 600, align: "center", linkHref: "" }),
        block("paragraph", { html: "Add a short intro paragraph for your readers. Drag blocks from the left rail to keep building.", align: "center", color: "#1A1A1A" }),
        block("button", { label: "Click here", href: "https://example.com", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 }),
        footerBlock(),
      ]),
  },
  {
    seedKey: "system/blank",
    name: "Blank",
    subject: null,
    previewText: null,
    // Just the compliance footer — a clean canvas to build on.
    body: () => body([footerBlock()]),
  },
];

// Assign categories to the original starters without editing each entry.
const STARTER_CATEGORY = {
  "system/newsletter": "Newsletters",
  "system/product-announcement": "Announcements",
  "system/welcome": "Welcome & onboarding",
  "system/plain-text": "Newsletters",
  "system/basic": "Basics",
  "system/blank": "Basics",
};
for (const t of STARTERS) t.category = STARTER_CATEGORY[t.seedKey] || "Basics";

// The full system library = the original starters + every per-category file.
// Each category module (server/cloud/templates/<name>.js) exports an array of
// template definitions built with ./templates/_helpers. Adding a category =
// create the file + add it to this concat. A category file that exports [] (a
// stub not yet authored) is harmless.
const SYSTEM_TEMPLATES = [].concat(
  STARTERS,
  require("./templates/newsletters"),
  require("./templates/product-launch"),
  require("./templates/welcome-onboarding"),
  require("./templates/promotions"),
  require("./templates/events-webinars"),
  require("./templates/ecommerce"),
  require("./templates/reengagement"),
  require("./templates/seasonal"),
);

// Pull the first image block's src out of a template body so the gallery can
// show a real hero-image thumbnail (much more compelling than a wireframe).
// Returns null when the template has no image block.
function firstImageSrc(tpl) {
  const b = tpl.get("body");
  if (!b || !Array.isArray(b.blocks)) return null;
  const img = b.blocks.find((x) => x && x.type === "image" && x.props && x.props.src);
  return img ? img.props.src : null;
}

function templateToJSON(tpl) {
  return {
    id: tpl.id,
    name: tpl.get("name") || "",
    subject: tpl.get("subject") || null,
    previewText: tpl.get("previewText") || null,
    isSystem: tpl.get("isSystem") === true,
    seedKey: tpl.get("seedKey") || null,
    category: tpl.get("category") || (tpl.get("isSystem") ? "Basics" : "Saved"),
    thumbnail: tpl.get("thumbnail") || null,
    thumbUrl: firstImageSrc(tpl),
    createdAt: tpl.createdAt ? tpl.createdAt.toISOString() : null,
    updatedAt: tpl.updatedAt ? tpl.updatedAt.toISOString() : null,
  };
}

// ── seedSystemTemplates ───────────────────────────────────────────────────────
// Idempotent. For each definition, look it up by `seedKey` (master key) and
// create only if missing. Running this on every boot — or many times — always
// converges to exactly the 6 system templates. Safe to call concurrently-ish:
// the existence check + create is best-effort; a rare duplicate from a true
// race is harmless and would be a no-op on subsequent reads (dedup by seedKey
// in listTemplates). Returns how many were created this run + the total.
let seedPromise = null;
async function seedSystemTemplatesOnce() {
  // Single-flight: only dedupe calls that overlap IN TIME (require-time boot
  // seed + a concurrent first listTemplates). Once a run finishes we clear the
  // gate so a later call re-checks the DB freshly (and reports seeded:0 when
  // nothing was missing). The DB existence check is the real idempotency guard.
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const Template = Parse.Object.extend("Template");
    let seeded = 0;
    let updated = 0;

    for (const def of SYSTEM_TEMPLATES) {
      const q = new Parse.Query(Template);
      q.equalTo("seedKey", def.seedKey);
      q.equalTo("isSystem", true);
      const existing = await q.first({ useMasterKey: true });
      if (existing) {
        // Reconcile content with the code definition so edits to a template's
        // body/copy/category propagate on the next boot — system templates are
        // code-owned. seedKey, isSystem and the public-read ACL stay as-is.
        existing.set("name", def.name);
        existing.set("subject", def.subject);
        existing.set("previewText", def.previewText);
        existing.set("category", def.category || "Basics");
        existing.set("body", def.body());
        await existing.save(null, { useMasterKey: true });
        updated += 1;
        continue;
      }

      const tpl = new Template();
      tpl.set("seedKey", def.seedKey);
      tpl.set("name", def.name);
      tpl.set("subject", def.subject);
      tpl.set("previewText", def.previewText);
      tpl.set("isSystem", true);
      tpl.set("category", def.category || "Basics");
      tpl.set("organization", null); // GLOBAL — not org-scoped.
      tpl.set("body", def.body());

      // Public-read ACL: every tenant can read, none can write.
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(false);
      tpl.setACL(acl);

      await tpl.save(null, { useMasterKey: true });
      seeded += 1;
    }

    const total = await new Parse.Query(Template)
      .equalTo("isSystem", true)
      .count({ useMasterKey: true });
    return { seeded, updated, total };
  })();

  try {
    return await seedPromise;
  } finally {
    // Always clear the gate: on success so the next call re-checks freshly, and
    // on failure so a transient error (e.g. DB not ready at require time) can be
    // retried rather than caching a rejected promise.
    seedPromise = null;
  }
}

Parse.Cloud.define("seedSystemTemplates", async () => {
  return seedSystemTemplatesOnce();
});

// ── listTemplates ─────────────────────────────────────────────────────────────
// Returns { system, org }. System = global isSystem:true rows (public read);
// org = the caller's org-owned templates (ACL-isolated). Ensures the system
// starters exist first so a fresh DB still shows the gallery.
Parse.Cloud.define("listTemplates", async (request) => {
  const user = requireUser(request);

  // Make sure starters exist (idempotent, single-flight).
  await seedSystemTemplatesOnce().catch(() => {
    /* listing org templates should still work if seeding hiccups */
  });

  // System templates: read with master key (public-read, but be robust).
  const sysQ = new Parse.Query("Template");
  sysQ.equalTo("isSystem", true);
  sysQ.ascending("createdAt");
  sysQ.limit(1000);
  const sysRows = await sysQ.find({ useMasterKey: true });

  // Dedup by seedKey in case a rare race created duplicates.
  const seen = new Set();
  const system = [];
  for (const t of sysRows) {
    const key = t.get("seedKey") || t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    system.push(templateToJSON(t));
  }

  // Display order: the simple "Basics" lead the gallery (Blank first as a
  // start-from-scratch affordance), then the rest by category. Within a
  // category, keep seed order (createdAt asc above).
  const CAT_ORDER = [
    "Basics",
    "Newsletters",
    "Announcements",
    "Product launches",
    "Welcome & onboarding",
    "Promotions & sales",
    "Events & webinars",
    "E-commerce",
    "Re-engagement & surveys",
    "Seasonal & holiday",
  ];
  const rank = (c) => {
    const i = CAT_ORDER.indexOf(c);
    return i < 0 ? CAT_ORDER.length : i;
  };
  system.sort((a, b) => {
    if (a.seedKey === "system/blank") return -1;
    if (b.seedKey === "system/blank") return 1;
    return rank(a.category) - rank(b.category);
  });

  // Org templates: session-scoped (ACL isolates), explicit org filter for index
  // locality. Exclude any system rows defensively.
  const org = await getUserOrg(user, { useMasterKey: true });
  const orgQ = new Parse.Query("Template");
  orgQ.equalTo("organization", org);
  orgQ.notEqualTo("isSystem", true);
  orgQ.descending("updatedAt");
  orgQ.limit(1000);
  const orgRows = await orgQ.find({ sessionToken: user.getSessionToken() });

  return {
    system,
    org: orgRows.map(templateToJSON),
  };
});

// ── useTemplate ───────────────────────────────────────────────────────────────
// Fork a template's blocks into a NEW Campaign draft owned by the caller's org.
// Works for both system (global) and org templates. Returns { campaignId }.
// The new Campaign matches campaigns/new.vue's default shape so the existing
// editor opens it unchanged.
Parse.Cloud.define("useTemplate", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Template id is required.");
  }

  // Read the template with the master key — system templates aren't org-scoped,
  // and org templates the caller can see are still readable here; we then guard
  // org templates against cross-tenant access below.
  let tpl;
  try {
    tpl = await new Parse.Query("Template").get(id, { useMasterKey: true });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Template not found.");
  }

  // Cross-tenant guard: an ORG template must belong to the caller's org.
  if (tpl.get("isSystem") !== true) {
    const callerOrg = await getUserOrg(user, { useMasterKey: true });
    const tplOrg = tpl.get("organization");
    if (!tplOrg || tplOrg.id !== callerOrg.id) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Template not found.");
    }
  }

  // Deep-clone the body so the campaign owns its own block tree (and gets fresh
  // block ids — avoids any chance of shared-id collisions across copies).
  const srcBody = tpl.get("body") || { version: 1, blocks: [] };
  const blocks = (srcBody.blocks || []).map((b) => ({
    id: blockId(),
    type: b.type,
    props: JSON.parse(JSON.stringify(b.props || {})),
  }));
  const newBody = { version: srcBody.version || 1, blocks };

  // New draft Campaign — same default shape as pages/app/campaigns/new.vue.
  const Campaign = Parse.Object.extend("Campaign");
  const campaign = new Campaign();
  campaign.set("name", `${tpl.get("name") || "Template"} copy`);
  campaign.set("body", newBody);
  campaign.set("status", "draft");
  campaign.set("subject", tpl.get("subject") || null);
  campaign.set("preheader", tpl.get("previewText") || null);
  campaign.set("fromName", null);
  campaign.set("fromEmail", null);
  campaign.set("replyTo", null);
  campaign.set("audienceId", null);
  campaign.set("bodyBg", null);
  campaign.set("createdBy", user);

  // Save AS THE USER so the tenancy beforeSave stamps org + ACL on the campaign.
  await campaign.save(null, { sessionToken: user.getSessionToken() });

  return { campaignId: campaign.id };
});

// ── saveAsTemplate ────────────────────────────────────────────────────────────
// Create an org-owned Template from an existing campaign's body (F-14).
// Returns { id }. Tenancy stamping is automatic (saved as the user).
Parse.Cloud.define("saveAsTemplate", async (request) => {
  const user = requireUser(request);
  const campaignId = request.params && request.params.campaignId;
  const rawName = (request.params && request.params.name) || "";

  if (!campaignId) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "campaignId is required.");
  }
  const name = String(rawName).trim();
  if (!name) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Template name is required.");
  }
  if (name.length > MAX_NAME_LEN) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      `Template name must be ${MAX_NAME_LEN} characters or fewer.`,
    );
  }

  // Read the campaign session-scoped (ACL isolates to the caller's org).
  let campaign;
  try {
    campaign = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: user.getSessionToken(),
    });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Campaign not found.");
  }

  // Snapshot the body (deep clone, fresh block ids so the template is independent).
  const srcBody = campaign.get("body") || { version: 1, blocks: [] };
  const blocks = (srcBody.blocks || []).map((b) => ({
    id: blockId(),
    type: b.type,
    props: JSON.parse(JSON.stringify(b.props || {})),
  }));

  const Template = Parse.Object.extend("Template");
  const tpl = new Template();
  tpl.set("name", name);
  tpl.set("body", { version: srcBody.version || 1, blocks });
  tpl.set("subject", campaign.get("subject") || null);
  tpl.set("previewText", campaign.get("preheader") || null);
  tpl.set("isSystem", false);
  // organization + ACL stamped by tenantHooks beforeSave (saved as the user).
  await tpl.save(null, { sessionToken: user.getSessionToken() });

  return { id: tpl.id };
});

// ── deleteTemplate ────────────────────────────────────────────────────────────
// Delete an ORG template. System templates are never deletable. ACL isolation
// means a caller can only fetch (and thus delete) their own org's templates.
Parse.Cloud.define("deleteTemplate", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Template id is required.");
  }

  let tpl;
  try {
    tpl = await new Parse.Query("Template").get(id, {
      sessionToken: user.getSessionToken(),
    });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Template not found.");
  }

  if (tpl.get("isSystem") === true) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      "System templates cannot be deleted.",
    );
  }

  await tpl.destroy({ sessionToken: user.getSessionToken() });
  return { ok: true };
});

// ── Seed at require time ──────────────────────────────────────────────────────
// Kick off seeding when this module loads (boot). Deferred to the next tick so
// Parse Server has finished initializing its DB adapter; failures are swallowed
// (listTemplates re-attempts lazily). In tests, callers invoke
// seedSystemTemplates / listTemplates explicitly which also triggers it.
setImmediate(() => {
  seedSystemTemplatesOnce().catch(() => {
    /* boot-time seed best-effort; lazily retried on first listTemplates */
  });
});

module.exports = { SYSTEM_TEMPLATES, seedSystemTemplatesOnce };
