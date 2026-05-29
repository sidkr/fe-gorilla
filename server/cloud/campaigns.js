// Cloud functions + beforeSave hooks on Campaign. CommonJS.
//
// The Campaign class already exists (created on-demand by the editor's save).
// This module owns:
//   - a compileBlocks beforeSave EXTENSION (body.blocks → MJML → compiledHtml),
//     registered via tenantHooks' registerBeforeSave (NOT Parse.Cloud.beforeSave,
//     which the tenancy stamp owns — see tenantHooks.js).
//   - listCampaigns()        → org-scoped summary rows + KPIs for /app/campaigns
//   - getCampaign({ id })    → one campaign as a plain object
//   - duplicateCampaign({ id }) → clone body + meta into a new draft
//   - archiveCampaign({ id })   → soft-delete (status = "archived")
//
// The Campaign block model is locked (see components/app/editor/blocks/registry.ts).
//   Campaign.body = { version: 1, blocks: [{ id, type, props }] }
//   Block types: heading, paragraph, image, button, divider, spacer, footer.
//   Compiled output lands in Campaign.compiledHtml (String).

const Parse = require("parse/node");
const mjml2html = require("mjml");
const { getUserOrg } = require("./lib/tenancy");
const { registerBeforeSave } = require("./tenantHooks");

// ── HTML/attr escaping ──────────────────────────────────────────────────────
// Mirrors the client-side escapeAttr in registry.ts so server output matches
// the editor's preview contract. Coerces nullish to "" so partial/empty
// blocks degrade gracefully instead of emitting "undefined".
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Clamp a value to a finite number with a fallback (block props can be
// missing or malformed when a body is hand-edited or partially saved).
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Block → MJML mappers ─────────────────────────────────────────────────────
// One mapper per block type. Each returns a fragment of MJML that lives inside
// an <mj-column>. Kept deliberately close to registry.ts's compileMjml stubs so
// the server is the canonical, trustworthy renderer of the same contract.
const BLOCK_MJML = {
  heading(props = {}) {
    const level = num(props.level, 1);
    const tag = `h${level >= 1 && level <= 3 ? level : 1}`;
    const size = level === 1 ? 28 : level === 2 ? 22 : 18;
    return `<mj-text align="${esc(props.align || "left")}" color="${esc(
      props.color || "#1A1A1A",
    )}" font-size="${size}px" font-weight="700"><${tag} style="margin:0">${esc(
      props.text,
    )}</${tag}></mj-text>`;
  },

  paragraph(props = {}) {
    // `html` is treated as plain text and escaped — the editor stores plain
    // strings today and rendering raw markup would be an injection vector.
    return `<mj-text align="${esc(props.align || "left")}" color="${esc(
      props.color || "#1A1A1A",
    )}" font-size="15px" line-height="1.6">${esc(props.html)}</mj-text>`;
  },

  image(props = {}) {
    if (!props.src) return ""; // nothing to render — skip cleanly
    const href = props.linkHref ? ` href="${esc(props.linkHref)}"` : "";
    return `<mj-image src="${esc(props.src)}" alt="${esc(
      props.alt,
    )}" width="${num(props.width, 600)}px" align="${esc(
      props.align || "center",
    )}"${href} />`;
  },

  button(props = {}) {
    return `<mj-button background-color="${esc(
      props.bg || "#FF4E4E",
    )}" color="${esc(props.fg || "#FFFFFF")}" href="${esc(
      props.href || "#",
    )}" align="${esc(props.align || "center")}" border-radius="${num(
      props.radius,
      10,
    )}px">${esc(props.label)}</mj-button>`;
  },

  divider(props = {}) {
    return `<mj-divider border-color="${esc(
      props.color || "#E5E5E7",
    )}" border-width="${num(props.thickness, 1)}px" />`;
  },

  spacer(props = {}) {
    return `<mj-spacer height="${num(props.height, 24)}px" />`;
  },

  footer(props = {}) {
    const parts = [];
    parts.push(
      `<mj-text align="center" color="#8E8E93" font-size="12px" font-style="italic">${esc(
        props.businessAddress,
      )}</mj-text>`,
    );
    const links = [];
    if (props.showWebVersion) {
      links.push(
        '<a href="{{webVersionUrl}}" style="color:#8E8E93;text-decoration:underline">View in browser</a>',
      );
    }
    // Default to showing the unsubscribe link when the prop is absent — every
    // email needs an unsubscribe path (CAN-SPAM).
    if (props.showUnsubscribe !== false) {
      links.push(
        '<a href="{{unsubscribeUrl}}" style="color:#8E8E93;text-decoration:underline">Unsubscribe</a>',
      );
    }
    if (links.length) {
      parts.push(
        `<mj-text align="center" color="#8E8E93" font-size="12px">${links.join(
          " &middot; ",
        )}</mj-text>`,
      );
    }
    return parts.join("");
  },
};

// Build the full MJML document from a body + optional canvas background.
// Unknown/empty blocks are skipped so a partially-saved body never aborts.
function buildMjml(body, opts = {}) {
  const blocks = Array.isArray(body && body.blocks) ? body.blocks : [];
  const bg = opts.bodyBg && /^#?[0-9a-fA-F]{3,8}$/.test(String(opts.bodyBg))
    ? esc(opts.bodyBg)
    : "#F2F2F7";

  const fragments = [];
  for (const block of blocks) {
    if (!block || typeof block.type !== "string") continue;
    const mapper = BLOCK_MJML[block.type];
    if (!mapper) continue; // unknown type — skip, don't throw
    try {
      const frag = mapper(block.props || {});
      if (frag) fragments.push(frag);
    } catch (_) {
      // A single malformed block shouldn't sink the whole compile.
    }
  }

  const inner = fragments.length
    ? fragments.join("\n")
    : '<mj-text color="#8E8E93">This email has no content yet.</mj-text>';

  return [
    "<mjml>",
    "<mj-head>",
    '<mj-attributes><mj-all font-family="Helvetica, Arial, sans-serif" /></mj-attributes>',
    "</mj-head>",
    `<mj-body background-color="${bg}">`,
    '<mj-section background-color="#FFFFFF" padding="24px">',
    "<mj-column>",
    inner,
    "</mj-column>",
    "</mj-section>",
    "</mj-body>",
    "</mjml>",
  ].join("\n");
}

// Compile body.blocks → responsive table HTML. Returns a string (never throws).
function compileBodyToHtml(body, opts = {}) {
  try {
    const mjml = buildMjml(body, opts);
    const out = mjml2html(mjml, { validationLevel: "soft", minify: false });
    return out && out.html ? out.html : "";
  } catch (err) {
    // MJML should not throw with validationLevel "soft", but guard anyway so a
    // bad body can never block the editor's save path.
    console.error("[campaigns] compileBlocks failed:", err && err.message);
    return "";
  }
}

// ── beforeSave extension: compileBlocks ──────────────────────────────────────
// Runs AFTER tenant stamping (registerBeforeSave contract). Only recompiles
// when `body` is dirty or compiledHtml is missing, so counter-only updates
// (e.g. status flips, send counters) don't pay the MJML cost. Never throws —
// a compile failure leaves compiledHtml untouched rather than blocking the save.
registerBeforeSave("Campaign", async (request) => {
  const object = request.object;
  const needsCompile =
    object.dirty("body") || !object.get("compiledHtml");
  if (!needsCompile) return;

  const body = object.get("body");
  // No body at all → nothing to compile; leave the field alone.
  if (!body || typeof body !== "object") return;

  const html = compileBodyToHtml(body, { bodyBg: object.get("bodyBg") });
  if (html) object.set("compiledHtml", html);
});

// ── Summary mapping ──────────────────────────────────────────────────────────
// Shape returned to /app/campaigns rows. Names mirror the table component's
// expected props: { id, name, status, audience, audienceId, date, relative,
// openRate, clickRate, updatedAt }.
const MS_DAY = 24 * 60 * 60 * 1000;

function relativeTime(date, status) {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / MS_DAY);
  if (status === "scheduled" && diff < 0) {
    const ahead = Math.ceil(-diff / MS_DAY);
    return ahead <= 1 ? "soon" : `in ${ahead} days`;
  }
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function fmtDate(date, status) {
  if (!date) return "";
  const abs = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (status === "draft") return `Created ${abs}`;
  if (status === "scheduled") return `Sends ${abs}`;
  return abs;
}

function pct(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `${(v * 100).toFixed(1)}%`;
}

function toSummary(c, listNames) {
  const status = c.get("status") || "draft";
  // For sent campaigns prefer sentAt; otherwise fall back to updatedAt.
  const date =
    c.get("sentAt") || c.get("scheduledAt") || c.updatedAt || c.createdAt;
  const audienceId = c.get("audienceId") || null;
  return {
    id: c.id,
    name: c.get("name") || "Untitled campaign",
    status,
    audienceId,
    audience: (audienceId && listNames[audienceId]) || null,
    date: fmtDate(date, status),
    relative: relativeTime(date, status),
    openRate: pct(c.get("openRate")),
    clickRate: pct(c.get("clickRate")),
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
  };
}

// Resolve List ids → display names in one master-key query, scoped to the org.
// (audienceId on a Campaign is a STRING List id, not a pointer.)
async function resolveListNames(org, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const q = new Parse.Query("List");
  q.equalTo("organization", org);
  q.containedIn("objectId", unique);
  q.limit(1000);
  const lists = await q.find({ useMasterKey: true });
  const map = {};
  for (const l of lists) map[l.id] = l.get("name") || "Untitled list";
  return map;
}

// ── listCampaigns ────────────────────────────────────────────────────────────
// Returns { campaigns: [...summary], kpis: {...} } scoped to the caller's org.
// Archived campaigns are excluded by default. ACL already isolates by org; the
// explicit org filter is for index locality + clarity (see lib/tenancy.js).
Parse.Cloud.define("listCampaigns", async (request) => {
  const org = await getUserOrg(request.user, { useMasterKey: true });

  const q = new Parse.Query("Campaign");
  q.equalTo("organization", org);
  q.notEqualTo("status", "archived");
  q.descending("updatedAt");
  q.limit(1000);
  const results = await q.find({ sessionToken: request.user.getSessionToken() });

  const listNames = await resolveListNames(
    org,
    results.map((c) => c.get("audienceId")),
  );

  const campaigns = results.map((c) => toSummary(c, listNames));

  // KPI summary derived from the rows so the strip stays consistent with the
  // table. Avg open rate is over sent campaigns that have a numeric openRate.
  const drafts = results.filter((c) => (c.get("status") || "draft") === "draft").length;
  const sent = results.filter((c) => c.get("status") === "sent");
  const openRates = sent
    .map((c) => c.get("openRate"))
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  const avgOpen = openRates.length
    ? openRates.reduce((a, b) => a + b, 0) / openRates.length
    : null;

  return {
    campaigns,
    kpis: {
      total: results.length,
      drafts,
      sent: sent.length,
      scheduled: results.filter((c) => c.get("status") === "scheduled").length,
      avgOpenRate: avgOpen == null ? null : pct(avgOpen),
    },
  };
});

// ── getCampaign ──────────────────────────────────────────────────────────────
// One campaign as a plain object including its body + compiledHtml. Scoped by
// the caller's session (ACL isolates cross-org gets → OBJECT_NOT_FOUND).
Parse.Cloud.define("getCampaign", async (request) => {
  const { id } = request.params || {};
  if (!id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Missing campaign id.");
  }
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "Must be logged in.",
    );
  }
  const q = new Parse.Query("Campaign");
  const c = await q.get(id, { sessionToken: request.user.getSessionToken() });
  return {
    id: c.id,
    name: c.get("name") || "Untitled campaign",
    status: c.get("status") || "draft",
    subject: c.get("subject") || null,
    preheader: c.get("preheader") || null,
    fromName: c.get("fromName") || null,
    fromEmail: c.get("fromEmail") || null,
    replyTo: c.get("replyTo") || null,
    audienceId: c.get("audienceId") || null,
    bodyBg: c.get("bodyBg") || null,
    body: c.get("body") || null,
    compiledHtml: c.get("compiledHtml") || null,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
  };
});

// ── duplicateCampaign ────────────────────────────────────────────────────────
// Clones body + meta into a NEW draft owned by the same org. The tenancy hook
// stamps org + ACL on save; compileBlocks recompiles from the cloned body.
// Returns { id } of the new draft.
Parse.Cloud.define("duplicateCampaign", async (request) => {
  const { id } = request.params || {};
  if (!id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Missing campaign id.");
  }
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "Must be logged in.",
    );
  }
  const sessionToken = request.user.getSessionToken();

  // Read the source as the caller so ACL prevents cross-org duplication.
  const src = await new Parse.Query("Campaign").get(id, { sessionToken });

  const dupe = new Parse.Object("Campaign");
  // Deep-clone the body so the new draft doesn't share object references.
  const srcBody = src.get("body");
  dupe.set(
    "body",
    srcBody ? JSON.parse(JSON.stringify(srcBody)) : null,
  );
  dupe.set("name", `${src.get("name") || "Untitled campaign"} (copy)`);
  dupe.set("status", "draft");
  dupe.set("subject", src.get("subject") || null);
  dupe.set("preheader", src.get("preheader") || null);
  dupe.set("fromName", src.get("fromName") || null);
  dupe.set("fromEmail", src.get("fromEmail") || null);
  dupe.set("replyTo", src.get("replyTo") || null);
  dupe.set("audienceId", src.get("audienceId") || null);
  dupe.set("bodyBg", src.get("bodyBg") || null);
  dupe.set("createdBy", request.user);
  // Never carry over sent-only stats / scheduling onto a fresh draft.

  // Save as the caller — tenancy beforeSave stamps org + ACL, compileBlocks
  // fills compiledHtml.
  await dupe.save(null, { sessionToken });
  return { id: dupe.id };
});

// ── archiveCampaign ──────────────────────────────────────────────────────────
// Soft-delete: flips status to "archived" so listCampaigns hides it. Returns
// { ok: true }. (Hard delete is intentionally not exposed here.)
Parse.Cloud.define("archiveCampaign", async (request) => {
  const { id } = request.params || {};
  if (!id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Missing campaign id.");
  }
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "Must be logged in.",
    );
  }
  const sessionToken = request.user.getSessionToken();
  const c = await new Parse.Query("Campaign").get(id, { sessionToken });
  c.set("status", "archived");
  await c.save(null, { sessionToken });
  return { ok: true };
});
