// Domain verification E2E — docs/testing/e2e.md §6.4.
//
// Surface: /app/settings/domains (pages/app/settings/domains.vue) backed by
// server/cloud/domains.js. The journey: empty state → add a domain → see the
// generated DKIM/SPF/DMARC DNS records → Verify → status reflects the outcome.
//
// What "Verify" does in dev (server/cloud/domains.js → verifyDomain):
//   It performs a best-effort REAL DNS TXT lookup of each record host. When NONE
//   of the hosts resolve (the case for a throwaway domain in the dev/test
//   environment — no real records published), it falls back to a MOCK PASS:
//   `mocked:true, verified:true`, status flips pending → "verified". The UI then
//   toasts "Domain verified (mock DNS)." and the card swaps to the verified
//   state. There is no deterministic way from the browser to force the `failed`
//   branch (it needs a host that RESOLVES but returns a mismatching TXT value),
//   so the failure/remediation path is split out as a separate fixme below.
//
// Relies on the `orgUser` fixture (a real User + Organization, session seeded
// into localStorage) because every domain cloud fn is org-scoped via getUserOrg.
//
// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER (2026-05-30): the domains page's cloud calls FAIL in the running app.
// composables/app/useDomains.ts imports `Parse from "parse/dist/parse.min.js"`
// and calls `Parse.Cloud.run(...)` DIRECTLY — but that module instance is never
// `Parse.initialize()`-d (the plugin initializes a different instance, exposed as
// useNuxtApp().$parse). Every call from the page therefore throws
//   "Cannot read properties of undefined (reading 'currentInstallationId')"
// so `listSendingDomains` (onMounted) errors out and the page is stuck on its
// load-error state — it NEVER reaches the empty state, the records table, or the
// Verify button. Confirmed by probe: /app/audiences + /app/settings/senders (which
// use the useCloud() wrapper / $parse) work, while /app/settings/domains AND
// /app/settings/suppression (both use the same raw direct-import pattern) both
// fail with currentInstallationId. The codebase rule in composables/app/useCloud.ts
// is explicit: "Do not call Parse.Cloud.run directly in feature code." The one-line
// fix is to make useDomains use `useCloud().runCloud` like useAudiences — an APP
// change, out of scope for this tests-only task.
//
// Effect on this spec: the cloud-dependent journey (empty state → add → records →
// verify, and invalid-domain rejection) is UNREACHABLE and gated behind
// DOMAINS_CLOUD_OK=false (skip-with-fixme). One test stays LIVE: it proves the page
// chrome renders and pins the current broken behavior (the load error surfaces),
// so this file gives a real signal today and the full journey arms automatically
// the moment useDomains is fixed (flip DOMAINS_CLOUD_OK to true).
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from "../setup/playwrightFixtures";

test.describe.configure({ mode: "serial", timeout: 120_000 });

// Flip to true once composables/app/useDomains.ts uses an initialized Parse SDK
// (useCloud().runCloud) so the page's cloud calls succeed. Until then the cloud
// journey is skipped with a fixme marker rather than left to fail.
const DOMAINS_CLOUD_OK = false;

const DOMAINS_URL = "/app/settings/domains";

// A domain unique per run so re-runs against the shared dev Mongo don't collide
// with a prior verified row (createSendingDomain dedupes per org+domain).
function freshDomain() {
  return `acme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.com`;
}

// LIVE today: the page chrome renders for an authed org user. This proves the
// route is reachable + authed (no /login bounce) and the Add-domain affordance is
// present, independent of the broken cloud list call.
test("domains page renders authed chrome (tabs + add-domain form)", async ({ page, orgUser }) => {
  void orgUser;

  await page.goto(DOMAINS_URL);

  // Stayed authed (auth-required middleware did not bounce us to /login).
  await expect(page).toHaveURL(/\/app\/settings\/domains/, { timeout: 25_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Page chrome: heading, the Domains settings tab, and the add-domain form.
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByRole("link", { name: "Domains" })).toBeVisible();
  await expect(page.getByLabel("Domain")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add domain" })).toBeVisible();
});

// Documents the CURRENT broken behavior so a regression-to-green is visible: until
// useDomains is fixed, the onMounted listSendingDomains call errors and the page
// shows its load-error (with a Retry). When DOMAINS_CLOUD_OK flips true this test
// inverts to assert the empty state instead.
test("empty state / load behavior reflects the cloud call outcome", async ({ page, orgUser }) => {
  void orgUser;

  await page.goto(DOMAINS_URL);
  await expect(page.getByRole("button", { name: "Add domain" })).toBeVisible({ timeout: 25_000 });

  if (DOMAINS_CLOUD_OK) {
    // Fixed path: a fresh org has no domains → the empty state renders.
    await expect(page.getByRole("heading", { name: "No domains yet" })).toBeVisible({
      timeout: 15_000,
    });
  } else {
    // Broken path (useDomains uninitialized SDK): listSendingDomains throws and
    // the page surfaces a load error with a Retry control. See file header.
    await expect(page.locator(".dom-state--error")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  }
});

test("adding an invalid domain is rejected with an error message", async ({ page, orgUser }) => {
  test.fixme(!DOMAINS_CLOUD_OK, "blocked: useDomains uses an uninitialized Parse SDK — see header");
  void orgUser;

  await page.goto(DOMAINS_URL);
  await expect(page.getByRole("button", { name: "Add domain" })).toBeVisible({ timeout: 25_000 });

  // "not a domain" fails the DOMAIN_RE in createSendingDomain →
  // VALIDATION_ERROR "A valid domain is required.", which the page surfaces in
  // its createError slot (.dom-error).
  await page.getByLabel("Domain").fill("not a domain");
  await page.getByRole("button", { name: "Add domain" }).click();

  await expect(page.getByText("A valid domain is required.")).toBeVisible({ timeout: 15_000 });

  // No card was created → still the empty state.
  await expect(page.getByRole("heading", { name: "No domains yet" })).toBeVisible();
});

test("add a domain → DKIM/SPF/DMARC records shown → Verify flips status to verified", async ({
  page,
  orgUser,
}) => {
  test.fixme(!DOMAINS_CLOUD_OK, "blocked: useDomains uses an uninitialized Parse SDK — see header");
  void orgUser;
  const domain = freshDomain();

  await page.goto(DOMAINS_URL);
  await expect(page.getByRole("button", { name: "Add domain" })).toBeVisible({ timeout: 25_000 });

  // ── Add the domain. ────────────────────────────────────────────────────────
  await page.getByLabel("Domain").fill(domain);
  await page.getByRole("button", { name: "Add domain" }).click();

  // The new card renders, scoped by the domain name code element.
  const card = page.locator("section.dom-card", { hasText: domain }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });

  // Freshly created → status pill "pending" and the instruction/remediation copy.
  await expect(card.getByText("pending", { exact: true })).toBeVisible();
  await expect(
    card.getByText(/Add these records at your DNS provider, then click Verify/i),
  ).toBeVisible();

  // ── The three generated DNS records are displayed. ─────────────────────────
  // buildRecords() emits DKIM, SPF and DMARC rows; the kind is bolded per row.
  for (const kind of ["DKIM", "SPF", "DMARC"]) {
    await expect(card.getByText(kind, { exact: true })).toBeVisible();
  }
  // Stable literal values we can assert on exactly.
  await expect(card.getByText("v=spf1 include:_spf.gorilla-mail.com ~all")).toBeVisible();
  await expect(
    card.getByText("v=DMARC1; p=none; rua=mailto:dmarc@gorilla-mail.com"),
  ).toBeVisible();
  // Three record rows in the table (DKIM/SPF/DMARC).
  await expect(card.locator("tbody tr")).toHaveCount(3);

  // ── Verify. In dev, no real DNS resolves for this throwaway domain, so the
  //    cloud fn falls back to a mock pass → verified. ─────────────────────────
  await card.getByRole("button", { name: "Verify" }).click();

  // Success toast (mock-DNS branch).
  await expect(page.getByText(/Domain verified \(mock DNS\)\./i)).toBeVisible({ timeout: 20_000 });

  // The card reloads into the verified state: pill flips, Verify button is gone,
  // and the "all records verified" affirmation shows.
  const verifiedCard = page.locator("section.dom-card", { hasText: domain }).first();
  await expect(verifiedCard.getByText("verified", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    verifiedCard.getByText(/All records verified — you can send from this domain\./i),
  ).toBeVisible();
  // Verify action no longer offered once verified (only Remove remains).
  await expect(verifiedCard.getByRole("button", { name: "Verify" })).toHaveCount(0);

  // ── Cleanup: remove the domain so re-runs start clean. confirm() auto-accepts. ─
  page.once("dialog", (d) => d.accept());
  await verifiedCard.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("section.dom-card", { hasText: domain })).toHaveCount(0, {
    timeout: 15_000,
  });
});

// The true `failed` status + its remediation copy ("Records not found yet — DNS
// can take up to 48 hours.") requires a record host that RESOLVES over DNS but
// returns a TXT value that does NOT match. That can't be staged deterministically
// from a browser spec in the hermetic dev environment (no DNS, so verify always
// takes the mock-pass branch). Left as a marker for when a DNS-stub seam exists.
test.fixme(
  "Verify surfaces 'failed' status + remediation copy when DNS resolves but mismatches",
  async () => {
    // Needs a way to make lookupTxt() return a non-null mismatching value for the
    // record hosts (DNS stub / env hook). Until then verify can only mock-pass.
  },
);
