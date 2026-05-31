// Demo seed — builds a rich, realistic demo org for the homepage live-demo capture.
//
//   node scripts/demo/seed.mjs            (against the running dev stack on :8090)
//
// Creates: an org + user, three audiences, ~280 contacts (names/statuses/tags +
// dated signups for the growth chart), one richly designed DRAFT campaign (for the
// editor screenshot), five "sent" campaigns with realistic denormalized counters
// (so Dashboard + Reports look alive without actually sending), one dynamic
// segment, and an installed Welcome-series automation. Writes the session + the
// objectIds the capture tour deep-links into to scripts/demo/.seed-context.json.
//
// Uses cloud functions (session-scoped, so org + ACL auto-stamp) for the things
// that have them, and master-key writes for the bits no cloud fn exposes (campaign
// counters / "already sent" state). Dev-only: reads the master key from local.env.
import Parse from "parse/node.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const APP_ID = process.env.PARSE_APP_ID || "gorilla";
const SERVER_URL = process.env.PARSE_SERVER_URL || "http://localhost:8090/api";

function masterKey() {
  if (process.env.PARSE_MASTER_KEY) return process.env.PARSE_MASTER_KEY;
  const txt = fs.readFileSync(path.join(ROOT, "server/local.env"), "utf8");
  const m = txt.match(/^PARSE_MASTER_KEY=(.+)$/m);
  if (!m) throw new Error("PARSE_MASTER_KEY not found in env or server/local.env");
  return m[1].trim();
}

Parse.initialize(APP_ID, null, masterKey());
Parse.serverURL = SERVER_URL;
const MK = { useMasterKey: true };

// ── deterministic-ish data pools ────────────────────────────────────────────
const FIRST = ["Ada", "Grace", "Mara", "Leo", "Nina", "Theo", "Iris", "Owen", "June", "Kai",
  "Rosa", "Felix", "Maya", "Hugo", "Elsa", "Milo", "清", "Yara", "Noor", "Sven", "Lena",
  "Arlo", "Priya", "Dario", "Tess", "Omar", "Greta", "Cyrus", "Beth", "Ravi"];
const LAST = ["Okonkwo", "Lovelace", "Singh", "Moreau", "Tanaka", "Costa", "Bauer", "Nolan",
  "Park", "Diaz", "Schmidt", "Haddad", "Rossi", "Berg", "Khan", "Flores", "Novak", "Walsh",
  "Mensah", "Petrov", "Ibrahim", "Lund", "Reyes", "Chen", "Adeyemi"];
const COMPANY = ["Northwind Co.", "Folkways", "Maple & Co.", "Argonaut", "Kindling",
  "Atlas Coffee", "Brightside", "Harbor Goods", "Lumen Studio", "Wayfare", "Tidewater",
  "Foundry 9", "Greenline", "Cobalt", "Driftwood"];
const CITY = [["Portland", "US"], ["Austin", "US"], ["Berlin", "DE"], ["Lisbon", "PT"],
  ["Toronto", "CA"], ["Osaka", "JP"], ["Nairobi", "KE"], ["Amsterdam", "NL"], ["Denver", "US"]];
const TAGS = ["vip", "newsletter", "early-adopter", "wholesale", "webinar", "trial", "loyal"];
const DOMAINS = ["gmail.com", "outlook.com", "fastmail.com", "hey.com", "proton.me"];

let SEED = 1337;
const rnd = () => (SEED = (SEED * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function makeContacts(n, listLabel) {
  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const f = pick(FIRST), l = pick(LAST);
    let email = `${slug(f)}.${slug(l)}${rnd() < 0.3 ? Math.floor(rnd() * 90) : ""}@${pick(DOMAINS)}`;
    if (used.has(email)) email = `${slug(f)}.${slug(l)}.${i}@${pick(DOMAINS)}`;
    used.add(email);
    // 72% subscribed, 16% unsubscribed, 12% pending → a lively engagement donut.
    const r = rnd();
    const status = r < 0.72 ? "subscribed" : r < 0.88 ? "unsubscribed" : "pending";
    const [city, country] = pick(CITY);
    const tags = rnd() < 0.45 ? [pick(TAGS), ...(rnd() < 0.3 ? [pick(TAGS)] : [])] : [];
    out.push({
      email,
      firstName: f,
      lastName: l,
      status,
      company: rnd() < 0.6 ? pick(COMPANY) : undefined,
      city,
      country,
      tags: Array.from(new Set(tags)),
      // spread signups across ~120 days so the growth chart climbs
      _ageDays: Math.floor(rnd() * 120),
      _listLabel: listLabel,
    });
  }
  return out;
}

const orgPtr = (id) => Parse.Object.extend("Organization").createWithoutData(id);

// A nicely composed campaign body for the editor screenshot.
const bid = () => "b_" + Math.floor(rnd() * 1e9).toString(36).slice(0, 5);
function designedBody() {
  return {
    version: 1,
    blocks: [
      { id: bid(), type: "image", props: { src: "https://picsum.photos/seed/gorilla-spring/1200/520", alt: "Spring collection", width: 600, align: "center", linkHref: "" } },
      { id: bid(), type: "spacer", props: { height: 16 } },
      { id: bid(), type: "heading", props: { text: "Spring picks, forged for you", level: 1, align: "center", color: "#18181B" } },
      { id: bid(), type: "paragraph", props: { html: "Hi {{firstName|there}}, the new season is here. We pulled together the pieces our team can't stop reaching for — limited runs, built to last.", align: "center", color: "#56565E" } },
      { id: bid(), type: "button", props: { label: "Shop the collection", href: "https://example.com/spring", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 } },
      { id: bid(), type: "divider", props: { color: "#E5E5E7", height: 1 } },
      { id: bid(), type: "paragraph", props: { html: "Members get early access + free shipping over $50. Reply any time — a real human reads every note.", align: "left", color: "#56565E" } },
      { id: bid(), type: "footer", props: { businessAddress: "Atlas Coffee Co., 90 Forge St, Portland OR 97201", showUnsubscribe: true, showWebVersion: true } },
    ],
  };
}

async function run(name, fn) {
  try { return await fn(); }
  catch (e) { console.warn(`  · ${name} failed (continuing): ${e.message}`); return null; }
}

async function main() {
  const stamp = Date.now();
  console.log("→ Seeding demo org against", SERVER_URL);

  // 1) Org + user.
  const signup = await Parse.Cloud.run("signUpWithOrg", {
    username: `demo_${stamp}@gorilla.email`,
    password: "demo-password-1234",
    email: `demo_${stamp}@gorilla.email`,
    name: "Maya Okonkwo",
    company: "Atlas Coffee Co.",
  });
  const sessionToken = signup.sessionToken;
  const orgId = signup.orgId;
  const opt = { sessionToken };
  // Give the user a real display name so the dashboard greeting + sidebar read
  // "Maya Okonkwo", not the raw signup email. The greeting is `name || username`.
  const displayName = "Maya Okonkwo";
  await run("set display name", async () => {
    const u = new Parse.User();
    u.id = signup.userId;
    u.set("name", displayName);
    await u.save(null, MK);
  });
  console.log(`  ✓ org ${orgId} (Atlas Coffee Co.) + user (${displayName})`);

  // 2) Settings + a verified sender so the app looks configured.
  await run("updateOrgSettings", () => Parse.Cloud.run("updateOrgSettings", {
    patch: {
      name: "Atlas Coffee Co.",
      defaultFromName: "Maya at Atlas Coffee",
      defaultFromEmail: "maya@atlascoffee.co",
      replyTo: "hello@atlascoffee.co",
      address: "90 Forge St, Portland OR 97201",
      timezone: "America/Los_Angeles",
    },
  }, opt));
  await run("createSenderIdentity", () => Parse.Cloud.run("createSenderIdentity", {
    fromName: "Maya at Atlas Coffee", fromEmail: "maya@atlascoffee.co",
  }, opt));

  // 3) Audiences.
  const audienceSpecs = [
    { label: "Newsletter subscribers", n: 160 },
    { label: "Product updates", n: 80 },
    { label: "VIP customers", n: 44 },
  ];
  const audiences = [];
  for (const spec of audienceSpecs) {
    const a = await Parse.Cloud.run("createAudience", { name: spec.label, description: "Demo audience" }, opt);
    audiences.push({ id: a.id, label: spec.label, n: spec.n });
    console.log(`  ✓ audience "${spec.label}" (${a.id})`);
  }

  // 4) Contacts (batched bulk add), then backdate signups for the growth chart.
  for (const aud of audiences) {
    const contacts = makeContacts(aud.n, aud.label);
    for (let i = 0; i < contacts.length; i += 100) {
      const batch = contacts.slice(i, i + 100).map(({ _ageDays, _listLabel, ...c }) => c);
      await Parse.Cloud.run("addContactsBulk", { audienceId: aud.id, contacts: batch }, opt);
    }
    console.log(`  ✓ ${aud.n} contacts → "${aud.label}"`);
    // Spread subscribedAt back in time so the dashboard growth line climbs.
    await run("backdate signups", async () => {
      const q = new Parse.Query("Contact");
      q.equalTo("organization", orgPtr(orgId));
      q.equalTo("lists", aud.id);
      q.limit(1000);
      const rows = await q.find(MK);
      const saves = rows.map((c, i) => {
        const days = Math.floor(rnd() * 120);
        const when = new Date(stamp - days * 864e5);
        c.set("subscribedAt", when);
        return c;
      });
      await Parse.Object.saveAll(saves, MK);
    });
  }

  // 5) One designed DRAFT campaign (editor screenshot).
  const draft = new Parse.Object("Campaign");
  draft.set("name", "Spring collection launch");
  draft.set("status", "draft");
  draft.set("subject", "Spring picks, forged for you 🌱");
  draft.set("preheader", "Limited runs, built to last — members get early access.");
  draft.set("fromName", "Maya at Atlas Coffee");
  draft.set("fromEmail", "maya@atlascoffee.co");
  draft.set("replyTo", "hello@atlascoffee.co");
  draft.set("audienceId", audiences[0].id);
  draft.set("body", designedBody());
  draft.set("organization", orgPtr(orgId));
  await draft.save(null, MK);
  console.log(`  ✓ draft campaign "${draft.get("name")}" (${draft.id})`);

  // 6) Five "sent" campaigns with realistic counters → Dashboard + Reports come alive.
  const sentSpecs = [
    { name: "May newsletter — Spring picks", recip: 4200, open: 0.481, click: 0.112, bounce: 0.021, unsub: 0.004, orders: 86, aov: 3400, days: 6 },
    { name: "Flash sale · 24 hours only", recip: 3850, open: 0.523, click: 0.146, bounce: 0.018, unsub: 0.006, orders: 124, aov: 2900, days: 11 },
    { name: "Product launch: Atlas 2.0", recip: 2980, open: 0.447, click: 0.098, bounce: 0.031, unsub: 0.005, orders: 52, aov: 5200, days: 17 },
    { name: "Welcome series · Email 1", recip: 1120, open: 0.612, click: 0.203, bounce: 0.012, unsub: 0.003, orders: 38, aov: 3100, days: 22 },
    { name: "April recap & what's next", recip: 4010, open: 0.452, click: 0.104, bounce: 0.024, unsub: 0.005, orders: 71, aov: 3300, days: 30 },
  ];
  for (const s of sentSpecs) {
    const c = new Parse.Object("Campaign");
    const delivered = Math.round(s.recip * (1 - s.bounce));
    c.set("name", s.name);
    c.set("status", "sent");
    c.set("subject", s.name);
    c.set("fromName", "Maya at Atlas Coffee");
    c.set("fromEmail", "maya@atlascoffee.co");
    c.set("audienceId", audiences[0].id);
    c.set("body", designedBody());
    c.set("sentAt", new Date(stamp - s.days * 864e5));
    c.set("sentCount", s.recip);
    c.set("deliveredCount", delivered);
    c.set("openCount", Math.round(delivered * s.open));
    c.set("clickCount", Math.round(delivered * s.click));
    c.set("bounceCount", Math.round(s.recip * s.bounce));
    c.set("unsubscribeCount", Math.round(delivered * s.unsub));
    c.set("revenueTotal", s.orders * s.aov); // minor units (cents)
    c.set("orderCount", s.orders);
    c.set("organization", orgPtr(orgId));
    await c.save(null, MK);
  }
  console.log(`  ✓ ${sentSpecs.length} sent campaigns with metrics`);

  // 7) A dynamic segment.
  const seg = await run("createSegment", () => Parse.Cloud.run("createSegment", {
    name: "Engaged Gmail subscribers",
    kind: "dynamic",
    rules: { op: "and", conditions: [
      { field: "status", operator: "eq", value: "subscribed" },
      { field: "email", operator: "contains", value: "@gmail.com" },
    ] },
  }, opt));
  if (seg) console.log(`  ✓ segment "${seg.name}" (${seg.id})`);

  // 8) An installed automation (Welcome series).
  const auto = await run("installRecipe", () => Parse.Cloud.run("installRecipe", { recipe: "welcome_series" }, opt));
  if (auto) console.log(`  ✓ automation installed (${auto.id || "welcome_series"})`);

  // 9) Context for the capture tour.
  const ctx = {
    generatedAt: new Date(stamp).toISOString(),
    appId: APP_ID,
    user: { objectId: signup.userId, username: `demo_${stamp}@gorilla.email`, name: displayName, sessionToken },
    orgId,
    audiences,
    primaryAudienceId: audiences[0].id,
    draftCampaignId: draft.id,
    segmentId: seg && seg.id,
    automationId: auto && (auto.id || null),
  };
  fs.writeFileSync(path.join(HERE, ".seed-context.json"), JSON.stringify(ctx, null, 2));
  console.log("→ wrote scripts/demo/.seed-context.json");
  console.log("✓ Demo seed complete.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("SEED FAILED:", e); process.exit(1); });
