// ─────────────────────────────────────────────────────────────────────────────
// Sending-domain verification cloud functions (Track C, F-04).
//
// Mock-DNS-first: createSendingDomain issues deterministic DKIM/SPF/DMARC record
// snippets the user must publish; verifyDomain performs a best-effort real DNS
// lookup (node dns.promises) and falls back to a mock pass when DNS isn't
// resolvable in the current environment. Status flips pending → verified.
//
// Org-scoped: org resolved from the authed user via getUserOrg (pins to the
// caller's OWN org). SendingDomain is NOT in PER_TENANT_CLASSES (tenancy.js is
// owned by the orchestrator and out of this lane), so we set organization + a
// role ACL EXPLICITLY here, with the master key. Mirrors server/cloud/settings.js.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const crypto = require("crypto");
const { getUserOrg, orgRoleACL } = require("./lib/tenancy");

const MK = { useMasterKey: true };

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "You must be signed in.");
  }
  return request.user;
}

function normalizeDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

// Deterministic mock DKIM selector so re-issuing for the same org+domain is stable.
function dkimSelector(orgId, domain) {
  const hash = crypto.createHash("sha256").update(`${orgId}:${domain}`).digest("hex");
  return `grla${hash.slice(0, 8)}`;
}

// Deterministic mock DKIM public-key value (not a real key — a stable placeholder).
function dkimValue(orgId, domain) {
  const hash = crypto.createHash("sha256").update(`dkim:${orgId}:${domain}`).digest("base64");
  return `v=DKIM1; k=rsa; p=${hash.replace(/[^A-Za-z0-9+/=]/g, "")}`;
}

// The 3 DNS records the user must publish.
function buildRecords(orgId, domain) {
  const selector = dkimSelector(orgId, domain);
  return [
    {
      kind: "DKIM",
      type: "TXT",
      host: `${selector}._domainkey.${domain}`,
      value: dkimValue(orgId, domain),
      purpose: "Authenticates that mail was signed by Gorilla on your behalf.",
    },
    {
      kind: "SPF",
      type: "TXT",
      host: domain,
      value: "v=spf1 include:_spf.gorilla-mail.com ~all",
      purpose: "Authorizes Gorilla's sending servers for your domain.",
    },
    {
      kind: "DMARC",
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none; rua=mailto:dmarc@gorilla-mail.com",
      purpose: "Tells receivers how to handle messages that fail auth + where to send reports.",
    },
  ];
}

// Best-effort TXT lookup. Returns the flattened TXT strings, or null if the host
// could not be resolved (offline / NXDOMAIN / test environment).
async function lookupTxt(host) {
  try {
    const dns = require("dns").promises;
    const records = await dns.resolveTxt(host);
    return records.map((chunks) => chunks.join(""));
  } catch (_e) {
    return null;
  }
}

function domainToJSON(d) {
  return {
    id: d.id,
    domain: d.get("domain") || "",
    selector: d.get("selector") || "",
    status: d.get("status") || "pending",
    verified: !!d.get("verified"),
    records: d.get("records") || [],
    lastCheckedAt: d.get("lastCheckedAt") ? d.get("lastCheckedAt").toISOString() : null,
    lastCheckResult: d.get("lastCheckResult") || null,
    createdAt: d.get("createdAt") ? d.get("createdAt").toISOString() : null,
  };
}

// ── createSendingDomain ─────────────────────────────────────────────────────-
Parse.Cloud.define("createSendingDomain", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);
  const domain = normalizeDomain(request.params && request.params.domain);

  if (!domain || !DOMAIN_RE.test(domain)) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "A valid domain is required.");
  }

  // Dedupe per org.
  const existingQ = new Parse.Query("SendingDomain");
  existingQ.equalTo("organization", org);
  existingQ.equalTo("domain", domain);
  const existing = await existingQ.first(MK);
  if (existing) return domainToJSON(existing);

  const SendingDomain = Parse.Object.extend("SendingDomain");
  const obj = new SendingDomain();
  obj.set("organization", org);
  obj.set("domain", domain);
  obj.set("selector", dkimSelector(org.id, domain));
  obj.set("status", "pending");
  obj.set("verified", false);
  obj.set("records", buildRecords(org.id, domain));
  obj.setACL(orgRoleACL(org.id));
  await obj.save(null, MK);
  return domainToJSON(obj);
});

// ── listSendingDomains ──────────────────────────────────────────────────────-
Parse.Cloud.define("listSendingDomains", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);

  const q = new Parse.Query("SendingDomain");
  q.equalTo("organization", org);
  q.descending("createdAt");
  q.limit(1000);
  const rows = await q.find(MK);
  return rows.map(domainToJSON);
});

// ── verifyDomain ────────────────────────────────────────────────────────────-
// Best-effort real DNS check; falls back to a mock pass when DNS is unresolvable
// (offline / test). Flips status pending|failed → verified when all records pass.
Parse.Cloud.define("verifyDomain", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);
  const id = request.params && request.params.id;
  if (!id) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "A domain id is required.");

  const q = new Parse.Query("SendingDomain");
  q.equalTo("organization", org);
  q.equalTo("objectId", id);
  const obj = await q.first(MK);
  if (!obj) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Domain not found.");

  const records = obj.get("records") || buildRecords(org.id, obj.get("domain"));

  const checks = [];
  let anyResolved = false;
  for (const rec of records) {
    const txts = await lookupTxt(rec.host);
    if (txts !== null) anyResolved = true;
    const passed =
      txts !== null &&
      txts.some((t) => t.replace(/\s+/g, "") === rec.value.replace(/\s+/g, ""));
    checks.push({ kind: rec.kind, host: rec.host, passed });
  }

  let allPassed;
  let mocked = false;
  if (!anyResolved) {
    // No DNS available (offline / test) — mock all records as passing.
    mocked = true;
    allPassed = true;
    for (const c of checks) c.passed = true;
  } else {
    allPassed = checks.every((c) => c.passed);
  }

  obj.set("status", allPassed ? "verified" : "failed");
  obj.set("verified", allPassed);
  obj.set("lastCheckedAt", new Date());
  obj.set("lastCheckResult", { mocked, checks });
  await obj.save(null, MK);

  return { status: obj.get("status"), verified: allPassed, mocked, checks, domain: domainToJSON(obj) };
});

// ── deleteSendingDomain ─────────────────────────────────────────────────────-
Parse.Cloud.define("deleteSendingDomain", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);
  const id = request.params && request.params.id;
  if (!id) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "A domain id is required.");

  const q = new Parse.Query("SendingDomain");
  q.equalTo("organization", org);
  q.equalTo("objectId", id);
  const obj = await q.first(MK);
  if (!obj) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Domain not found.");

  await obj.destroy(MK);
  return { deleted: true, id };
});

module.exports = { normalizeDomain, buildRecords, dkimSelector };
