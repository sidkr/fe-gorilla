// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for dashboard + campaign reporting aggregations. CommonJS.
//
// READ aggregations over List / Contact / Campaign / CampaignSend / EmailEvent,
// all org-scoped. We resolve the caller's org via getUserOrg and scope every
// query to it (ACLs already isolate; the org filter is for index locality and
// explicitness — see lib/tenancy.js).
//
// IMPORTANT — graceful zeros, never fabricated numbers:
//   The send pipeline does not exist yet, so CampaignSend and EmailEvent are
//   usually EMPTY and Campaign rows usually carry no engagement counters. Every
//   function below returns REAL values where data exists and honest ZEROS /
//   empty arrays otherwise. We read engagement counters defensively from the
//   Campaign's denormalized fields (sentCount, deliveredCount, ...) and only
//   fall back to counting CampaignSend / EmailEvent rows — both of which return
//   0 until sends happen. No metric is ever invented.
//
// Cloud functions:
//   getDashboardMetrics()                                   → org-wide rollup
//   getOnboardingState()                                    → setup checklist booleans
//   getCampaignReport({ campaignId })                       → headline counters (F-25)
//   getCampaignLinkBreakdown({ campaignId })                → per-link clicks (F-26)
//   getCampaignRecipients({ campaignId, page?, perPage?, filter? }) → recipients (F-26)
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");

// Campaign statuses we surface on the dashboard. The send pipeline owns the
// canonical lifecycle; we just bucket whatever `status` strings exist and zero
// the rest, so an unknown/extra status never breaks the dashboard.
const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "paused", "failed"];

const MAX_RECIPIENTS_PER_PAGE = 100;
const DEFAULT_RECIPIENTS_PER_PAGE = 50;

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "You must be signed in.");
  }
  return request.user;
}

// Read a numeric counter off an object, defaulting to 0 when the field is
// absent / null / non-numeric. The denormalized engagement counters do not
// exist on Campaign until the send pipeline writes them; treat missing as 0.
function counter(obj, name) {
  const v = obj.get(name);
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Safe rate as a fraction in [0, 1]. Returns 0 when the denominator is 0 so the
// UI shows a clean "0%" instead of NaN.
function rate(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return numerator / denominator;
}

// Count rows for a query, scoped to the caller's session (ACL-isolated).
async function countWhere(className, build, sessionToken) {
  const q = new Parse.Query(className);
  build(q);
  return q.count({ sessionToken });
}

// ── Onboarding state ──────────────────────────────────────────────────────────
// Computes real completion of the first-run setup steps from org data. Every
// step is a boolean derived from a count / field check scoped to the caller's
// org (ACL-isolated via the session token; org pointer for explicitness).
//
//   senderIdentity → Organization.defaultFromEmail is a non-empty string
//   audience       → ≥1 non-archived List
//   contact        → ≥1 non-deleted Contact
//   campaign       → ≥1 Campaign (any status)
//   sent           → ≥1 Campaign with status "sent" (the send pipeline sets this)
//
// `complete` is the AND of all steps, so the UI can hide the checklist once the
// org is fully set up. A fresh org returns every step false.
async function computeOnboardingState(org, sessionToken) {
  const fromEmail = org.get("defaultFromEmail");
  const senderIdentity =
    typeof fromEmail === "string" && fromEmail.trim().length > 0;

  const [audienceCount, contactCount, campaignCount, sentCampaignCount] =
    await Promise.all([
      countWhere(
        "List",
        (q) => {
          q.equalTo("organization", org);
          q.notEqualTo("archived", true);
        },
        sessionToken,
      ),
      countWhere(
        "Contact",
        (q) => {
          q.equalTo("organization", org);
          q.notEqualTo("deleted", true);
        },
        sessionToken,
      ),
      countWhere(
        "Campaign",
        (q) => q.equalTo("organization", org),
        sessionToken,
      ),
      countWhere(
        "Campaign",
        (q) => {
          q.equalTo("organization", org);
          q.equalTo("status", "sent");
        },
        sessionToken,
      ),
    ]);

  const steps = {
    senderIdentity,
    audience: audienceCount > 0,
    contact: contactCount > 0,
    campaign: campaignCount > 0,
    sent: sentCampaignCount > 0,
  };

  return {
    steps,
    complete: Object.values(steps).every(Boolean),
  };
}

// ── getOnboardingState ────────────────────────────────────────────────────────
// Standalone accessor for the setup checklist. Mirrors the `onboarding` block
// returned by getDashboardMetrics so the frontend can refresh just the checklist
// (e.g. after the user completes a step) without re-running the full rollup.
Parse.Cloud.define("getOnboardingState", async (request) => {
  const user = requireUser(request);
  const st = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });
  return computeOnboardingState(org, st);
});

// ── getDashboardMetrics ───────────────────────────────────────────────────────
// Org-wide rollup for the dashboard. Real counts for audiences/contacts/
// campaigns-by-status (these exist from day one). Lifetime engagement totals are
// summed from Campaign denormalized counters where present and are 0 until the
// send pipeline populates them.
Parse.Cloud.define("getDashboardMetrics", async (request) => {
  const user = requireUser(request);
  const st = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });

  // ── Audiences (non-archived Lists) ──────────────────────────────────────────
  const audiences = await countWhere(
    "List",
    (q) => {
      q.equalTo("organization", org);
      q.notEqualTo("archived", true);
    },
    st,
  );

  // ── Contacts: total (non-deleted) + subscribed ──────────────────────────────
  const totalContacts = await countWhere(
    "Contact",
    (q) => {
      q.equalTo("organization", org);
      q.notEqualTo("deleted", true);
    },
    st,
  );
  const subscribedContacts = await countWhere(
    "Contact",
    (q) => {
      q.equalTo("organization", org);
      q.notEqualTo("deleted", true);
      q.equalTo("status", "subscribed");
    },
    st,
  );

  // ── Campaigns by status ───────────────────────────────────────────────────--
  // One count per known status + a total. Unknown statuses still count toward
  // total (separate count without a status filter).
  const byStatus = {};
  await Promise.all(
    CAMPAIGN_STATUSES.map(async (status) => {
      byStatus[status] = await countWhere(
        "Campaign",
        (q) => {
          q.equalTo("organization", org);
          q.equalTo("status", status);
        },
        st,
      );
    }),
  );
  const totalCampaigns = await countWhere(
    "Campaign",
    (q) => q.equalTo("organization", org),
    st,
  );

  // ── Lifetime engagement totals ────────────────────────────────────────────--
  // Sum denormalized counters across all campaigns. These fields don't exist
  // until the send pipeline writes them, so counter() returns 0 for each — the
  // totals come out 0 for a fresh org, real once sends land. We page through
  // campaigns rather than relying on a server-side sum aggregation so this works
  // identically across parse-server versions.
  const totals = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 };
  // Revenue rollup (RevenueAttribution §5) — summed from the same Campaign page
  // pass off the denormalized revenue counters R1's ingest maintains. All money
  // INTEGER MINOR UNITS; the dashboard formats. Single-org-currency assumption.
  const revenue = { total: 0, orders: 0, aov: 0, currency: "USD" };
  const campaignQ = new Parse.Query("Campaign");
  campaignQ.equalTo("organization", org);
  campaignQ.select(
    "sentCount",
    "deliveredCount",
    "openCount",
    "clickCount",
    "bounceCount",
    "unsubscribeCount",
    "revenueTotal",
    "orderCount",
  );
  campaignQ.limit(1000);
  const campaigns = await campaignQ.find({ sessionToken: st });
  for (const c of campaigns) {
    totals.sent += counter(c, "sentCount");
    totals.delivered += counter(c, "deliveredCount");
    totals.opens += counter(c, "openCount");
    totals.clicks += counter(c, "clickCount");
    totals.bounces += counter(c, "bounceCount");
    totals.unsubscribes += counter(c, "unsubscribeCount");
    revenue.total += counter(c, "revenueTotal");
    revenue.orders += counter(c, "orderCount");
  }
  revenue.aov = revenue.orders > 0 ? Math.round(revenue.total / revenue.orders) : 0;

  // Setup-checklist booleans. Reuses the counts above where they overlap to
  // avoid redundant queries (audiences/contacts/campaigns are already known).
  const onboarding = {
    steps: {
      senderIdentity:
        typeof org.get("defaultFromEmail") === "string" &&
        org.get("defaultFromEmail").trim().length > 0,
      audience: audiences > 0,
      contact: totalContacts > 0,
      campaign: totalCampaigns > 0,
      sent: (byStatus.sent || 0) > 0,
    },
    get complete() {
      return Object.values(this.steps).every(Boolean);
    },
  };

  return {
    audiences,
    contacts: { total: totalContacts, subscribed: subscribedContacts },
    campaigns: { total: totalCampaigns, byStatus },
    totals,
    revenue, // { total, orders, aov, currency } — all money minor units
    rates: {
      open: rate(totals.opens, totals.delivered),
      click: rate(totals.clicks, totals.delivered),
      bounce: rate(totals.bounces, totals.sent),
      unsubscribe: rate(totals.unsubscribes, totals.delivered),
    },
    onboarding: { steps: onboarding.steps, complete: onboarding.complete },
  };
});

// Sum the attributed revenue + order count for one campaign from its Conversion
// rows (RevenueAttribution §5). Money is INTEGER MINOR UNITS; the frontend
// formats. Org-scoped via the caller's session token (ACL-isolated). Returns
// honest zeros for a campaign with no conversions. Also surfaces the org's
// currency (read off the first conversion; single-currency assumption for now).
async function campaignRevenue(campaign, org, sessionToken) {
  const q = new Parse.Query("Conversion");
  q.equalTo("organization", org);
  q.equalTo("campaign", campaign);
  q.select("revenue", "currency");
  q.limit(100000);
  const convs = await q.find({ sessionToken });

  let revenue = 0;
  let currency = null;
  for (const c of convs) {
    revenue += counter(c, "revenue");
    if (!currency) currency = c.get("currency") || null;
  }
  return { revenue, orders: convs.length, currency: currency || "USD" };
}

// Build the headline counters for a single campaign object. Prefers the
// campaign's denormalized counters; if `sentCount` is absent (pipeline hasn't
// stamped it) we fall back to counting CampaignSend rows — which is 0 today.
async function buildCampaignReport(campaign, org, sessionToken) {
  let sent = counter(campaign, "sentCount");
  let delivered = counter(campaign, "deliveredCount");
  const opens = counter(campaign, "openCount");
  const clicks = counter(campaign, "clickCount");
  const bounces = counter(campaign, "bounceCount");
  const unsubscribes = counter(campaign, "unsubscribeCount");

  // Fallback: derive sent from CampaignSend rows when the counter is missing.
  // Returns 0 until the send pipeline creates send rows.
  if (!campaign.get("sentCount")) {
    sent = await countWhere(
      "CampaignSend",
      (q) => {
        q.equalTo("organization", org);
        q.equalTo("campaign", campaign);
      },
      sessionToken,
    );
  }
  // Delivered = sent − bounces when not explicitly denormalized.
  if (!campaign.get("deliveredCount")) {
    delivered = Math.max(sent - bounces, 0);
  }

  // Revenue block — attributed revenue / orders + the derived money metrics.
  //   aov                 = revenue / orders           (avg order value)
  //   conversionRate      = orders  / delivered        (orders per delivered email)
  //   revenuePerRecipient = revenue / delivered        (avg revenue per delivered)
  // All integer minor units; rates are fractions in [0, 1].
  const { revenue, orders, currency } = await campaignRevenue(campaign, org, sessionToken);
  const aov = orders > 0 ? Math.round(revenue / orders) : 0;
  const conversionRate = rate(orders, delivered);
  const revenuePerRecipient = delivered > 0 ? Math.round(revenue / delivered) : 0;

  return {
    id: campaign.id,
    name: campaign.get("name") || "",
    subject: campaign.get("subject") || "",
    status: campaign.get("status") || "draft",
    sentAt: campaign.get("sentAt") ? campaign.get("sentAt").toISOString() : null,
    counts: { sent, delivered, opens, clicks, bounces, unsubscribes },
    rates: {
      open: rate(opens, delivered),
      click: rate(clicks, delivered),
      bounce: rate(bounces, sent),
      unsubscribe: rate(unsubscribes, delivered),
    },
    // Revenue block (minor units). The reports page formats with formatCurrency.
    revenue,
    orders,
    aov,
    conversionRate,
    revenuePerRecipient,
    currency,
  };
}

// Fetch a campaign the caller is allowed to see, or throw OBJECT_NOT_FOUND.
async function getOwnedCampaign(campaignId, sessionToken) {
  if (!campaignId) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "campaignId is required.");
  }
  try {
    return await new Parse.Query("Campaign").get(campaignId, { sessionToken });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Campaign not found.");
  }
}

// ── exportCampaignRecipients ─────────────────────────────────────────────────
// Returns the full per-recipient delivery table for a campaign as CSV TEXT.
// Columns: email, status, deliveredAt, openedAt, clickedAt, bounceReason.
// Reuses the same org-scoped CampaignSend query shape as getCampaignRecipients
// (optionally filtered by `status`), but pages through ALL matching rows so the
// export is complete. Org-guarded the same way the other report fns are.
// Returns { filename, csv }.
const CSV_COLUMNS = [
  "email",
  "status",
  "deliveredAt",
  "openedAt",
  "clickedAt",
  "bounceReason",
];

// Quote a CSV cell per RFC 4180: wrap in quotes + double embedded quotes when
// the value contains a comma, quote, CR, or LF. Nullish → empty string.
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoOrEmpty(d) {
  return d ? d.toISOString() : "";
}

Parse.Cloud.define("exportCampaignRecipients", async (request) => {
  const user = requireUser(request);
  const st = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });
  const params = request.params || {};
  const campaign = await getOwnedCampaign(params.campaignId, st);

  const filter = typeof params.status === "string" ? params.status : "all";

  const PAGE = 1000;
  const lines = [CSV_COLUMNS.join(",")];
  let skip = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const q = new Parse.Query("CampaignSend");
    q.equalTo("organization", org);
    q.equalTo("campaign", campaign);
    if (filter && filter !== "all") q.equalTo("status", filter);
    q.ascending("createdAt");
    q.limit(PAGE);
    q.skip(skip);
    const rows = await q.find({ sessionToken: st });
    if (!rows.length) break;
    for (const s of rows) {
      lines.push(
        [
          csvCell(s.get("email")),
          csvCell(s.get("status")),
          csvCell(isoOrEmpty(s.get("deliveredAt"))),
          csvCell(isoOrEmpty(s.get("openedAt"))),
          // CampaignSend stores the click timestamp as lastClickedAt (see
          // getCampaignRecipients); accept clickedAt too for forward-compat.
          csvCell(isoOrEmpty(s.get("clickedAt") || s.get("lastClickedAt"))),
          csvCell(s.get("bounceReason")),
        ].join(","),
      );
    }
    if (rows.length < PAGE) break;
    skip += PAGE;
  }

  const safeName =
    (campaign.get("name") || "campaign")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "campaign";

  return {
    filename: `${safeName}-recipients.csv`,
    csv: lines.join("\r\n"),
  };
});

// ── getCampaignReport ─────────────────────────────────────────────────────────
// F-25 headline metrics for one campaign. Real where the campaign carries
// counters (or has CampaignSend rows); graceful zeros otherwise.
Parse.Cloud.define("getCampaignReport", async (request) => {
  const user = requireUser(request);
  const st = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });
  const campaignId = request.params && request.params.campaignId;
  const campaign = await getOwnedCampaign(campaignId, st);
  return buildCampaignReport(campaign, org, st);
});

// ── getCampaignLinkBreakdown ─────────────────────────────────────────────────-
// F-26 per-link click breakdown. Aggregates EmailEvent rows of type "click" for
// the campaign, grouped by the clicked URL, sorted by unique-click count desc.
// EmailEvent is empty until the pipeline lands → returns an empty array with the
// campaign's denominator so the UI can render an empty state without breaking.
Parse.Cloud.define("getCampaignLinkBreakdown", async (request) => {
  const user = requireUser(request);
  const st = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });
  const campaignId = request.params && request.params.campaignId;
  const campaign = await getOwnedCampaign(campaignId, st);

  const delivered = counter(campaign, "deliveredCount");

  // Pull click events for this campaign. Each event may carry a `url` (the
  // rendered link). We tally unique contacts per url. Capped — link breakdowns
  // are small relative to total events.
  const q = new Parse.Query("EmailEvent");
  q.equalTo("organization", org);
  q.equalTo("campaign", campaign);
  q.equalTo("type", "click");
  q.select("url", "contact");
  q.limit(100000);
  const events = await q.find({ sessionToken: st });

  // url → Set of contactId (unique clickers). Events with no url are bucketed
  // under "(unknown)" rather than dropped, so counts stay honest.
  const byUrl = new Map();
  for (const ev of events) {
    const url = ev.get("url") || "(unknown)";
    const contact = ev.get("contact");
    const key = contact ? contact.id : ev.id; // fall back to event id if no contact
    if (!byUrl.has(url)) byUrl.set(url, new Set());
    byUrl.get(url).add(key);
  }

  const links = Array.from(byUrl.entries())
    .map(([url, clickers]) => ({
      url,
      uniqueClicks: clickers.size,
      clickRate: rate(clickers.size, delivered),
    }))
    .sort((a, b) => b.uniqueClicks - a.uniqueClicks);

  return { campaignId: campaign.id, delivered, links };
});

// ── getCampaignRecipients ─────────────────────────────────────────────────────
// F-26 paginated recipient activity. Lists CampaignSend rows for the campaign
// with a derived per-recipient status, optionally filtered. Empty until the send
// pipeline creates send rows → returns { rows: [], total: 0 } gracefully.
//
// filter ∈ "opened" | "clicked" | "bounced" | "unsubscribed" | "notOpened" | "all"
// We filter on the CampaignSend.status string the pipeline maintains; rows
// without a status are treated as "sent".
Parse.Cloud.define("getCampaignRecipients", async (request) => {
  const user = requireUser(request);
  const st = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });
  const params = request.params || {};
  const campaign = await getOwnedCampaign(params.campaignId, st);

  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  let perPage = parseInt(params.perPage, 10) || DEFAULT_RECIPIENTS_PER_PAGE;
  perPage = Math.min(Math.max(perPage, 1), MAX_RECIPIENTS_PER_PAGE);
  const filter = typeof params.filter === "string" ? params.filter : "all";

  function applyFilter(q) {
    q.equalTo("organization", org);
    q.equalTo("campaign", campaign);
    switch (filter) {
      case "opened":
        q.equalTo("opened", true);
        break;
      case "clicked":
        q.equalTo("clicked", true);
        break;
      case "bounced":
        q.equalTo("status", "bounced");
        break;
      case "unsubscribed":
        q.equalTo("status", "unsubscribed");
        break;
      case "notOpened":
        q.notEqualTo("opened", true);
        break;
      // "all" / unknown → no extra constraint
      default:
        break;
    }
  }

  const total = await countWhere("CampaignSend", applyFilter, st);

  const q = new Parse.Query("CampaignSend");
  applyFilter(q);
  q.include("contact");
  q.descending("createdAt");
  q.skip((page - 1) * perPage);
  q.limit(perPage);
  const sends = await q.find({ sessionToken: st });

  const rows = sends.map((s) => {
    const contact = s.get("contact");
    return {
      id: s.id,
      email: s.get("email") || (contact ? contact.get("email") : "") || "",
      firstName: contact ? contact.get("firstName") || "" : "",
      lastName: contact ? contact.get("lastName") || "" : "",
      status: s.get("status") || "sent",
      opened: s.get("opened") === true,
      clicked: s.get("clicked") === true,
      openedAt: s.get("openedAt") ? s.get("openedAt").toISOString() : null,
      lastClickedAt: s.get("lastClickedAt") ? s.get("lastClickedAt").toISOString() : null,
      bounceReason: s.get("bounceReason") || null,
    };
  });

  return {
    campaignId: campaign.id,
    page,
    perPage,
    total,
    totalPages: Math.max(Math.ceil(total / perPage), 1),
    rows,
  };
});

// ── getRevenueOverview ─────────────────────────────────────────────────────────
// Org-wide attributed-revenue report (RevenueAttribution §5). Scans the org's
// Conversion rows in a date range and rolls them up into:
//   { totalRevenue, orderCount, aov, currency,
//     trend: [{ day, revenue, orders }],            (one bucket per UTC day)
//     topCampaigns: [{ campaignId, name, revenue, orders, aov }],
//     byModel: [{ model, revenue, orders }],        (attribution-model split)
//     attributed: { revenue, orders },              (campaign-linked)
//     unattributed: { revenue, orders } }
// All money INTEGER MINOR UNITS; the frontend formats. Org-scoped via the
// caller's session token (ACL-isolated) + an explicit organization filter.
// Returns clean zeros / empty arrays for an org with no conversions.
//
// params: { from?: ISO/date, to?: ISO/date }. Defaults to the last 30 days.
function revenueDayKey(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

Parse.Cloud.define("getRevenueOverview", async (request) => {
  const user = requireUser(request);
  const st = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });

  const params = request.params || {};
  const toDate = params.to ? new Date(params.to) : new Date();
  const fromDate = params.from
    ? new Date(params.from)
    : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

  // Pull the org's conversions in range. occurredAt is the canonical event time;
  // fall back to createdAt only when a row predates the field.
  const q = new Parse.Query("Conversion");
  q.equalTo("organization", org);
  q.greaterThanOrEqualTo("occurredAt", new Date(revenueDayKey(fromDate) + "T00:00:00.000Z"));
  q.lessThanOrEqualTo("occurredAt", new Date(toDate));
  q.include("campaign");
  q.limit(100000);
  const convs = await q.find({ sessionToken: st });

  let totalRevenue = 0;
  let currency = null;
  const byDay = {}; // day -> { day, revenue, orders }
  const byCampaign = {}; // campaignId -> { campaignId, name, revenue, orders }
  const byModel = {}; // model -> { model, revenue, orders }
  let attRevenue = 0, attOrders = 0, unattRevenue = 0, unattOrders = 0;

  for (const c of convs) {
    const rev = counter(c, "revenue");
    totalRevenue += rev;
    if (!currency) currency = c.get("currency") || null;

    const day = revenueDayKey(c.get("occurredAt") || c.get("createdAt"));
    if (!byDay[day]) byDay[day] = { day, revenue: 0, orders: 0 };
    byDay[day].revenue += rev;
    byDay[day].orders += 1;

    const model = c.get("attributionModel") || "unattributed";
    if (!byModel[model]) byModel[model] = { model, revenue: 0, orders: 0 };
    byModel[model].revenue += rev;
    byModel[model].orders += 1;

    const camp = c.get("campaign");
    if (camp && camp.id) {
      if (!byCampaign[camp.id]) {
        byCampaign[camp.id] = {
          campaignId: camp.id,
          name: camp.get("name") || "(untitled)",
          revenue: 0,
          orders: 0,
        };
      }
      byCampaign[camp.id].revenue += rev;
      byCampaign[camp.id].orders += 1;
      attRevenue += rev;
      attOrders += 1;
    } else {
      unattRevenue += rev;
      unattOrders += 1;
    }
  }

  const orderCount = convs.length;
  const aov = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

  // Dense daily trend: one bucket per UTC day in [from, to], zero-filled.
  const trend = [];
  const cur = new Date(revenueDayKey(fromDate) + "T00:00:00.000Z");
  const end = new Date(revenueDayKey(toDate) + "T00:00:00.000Z");
  for (let guard = 0; cur <= end && guard < 1000; guard++) {
    const day = cur.toISOString().slice(0, 10);
    trend.push(byDay[day] || { day, revenue: 0, orders: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const topCampaigns = Object.values(byCampaign)
    .map((c) => ({ ...c, aov: c.orders > 0 ? Math.round(c.revenue / c.orders) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    totalRevenue,
    orderCount,
    aov,
    currency: currency || "USD",
    trend,
    topCampaigns,
    byModel: Object.values(byModel).sort((a, b) => b.revenue - a.revenue),
    attributed: { revenue: attRevenue, orders: attOrders },
    unattributed: { revenue: unattRevenue, orders: unattOrders },
  };
});
