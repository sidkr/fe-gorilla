// Flagship cross-page golden-path E2E (docs/testing/e2e.md §1a — the browser spine).
//
// Walks the user-visible journey end-to-end through the real UI against the
// running dev stack (Nuxt :3001 → Parse :8080 → dev Mongo):
//
//   signup → org   → create Audience → add Contact → build/save Segment
//   → Templates "Use this" (lands in the editor) → verify campaign opened
//   → Test-send → Send (pre-flight) and assert success/validation UI.
//
// Resilience notes:
//  - Most steps start logged-in via the `orgUser` fixture (signUpWithOrg over
//    REST + a seeded Parse session in localStorage). The signup-through-the-UI
//    path is exercised by its OWN focused test below, so a flaky signup form
//    never cascades into the rest of the journey.
//  - Web-first assertions (auto-retrying `expect(locator)`) + generous step
//    timeouts. We assert key observable outcomes — URL transitions, visible
//    elements, success panels — rather than brittle deep DOM.
//  - Split into focused test() blocks. The big journey is one continuous
//    test() because every step depends on the prior one's data; the signup-UI
//    and anonymous-redirect checks stand alone.
//
// Run ONLY this file (don't boot a second dev server):
//   PATH=".../v20/bin:$PATH" npx playwright test tests/e2e/golden-path.spec.ts --workers=1

import { test, expect } from "../setup/playwrightFixtures";

// The whole journey can do real cloud round-trips (create/save/send) against
// the shared dev stack; give each test (AND its fixture setup, which seeds the
// org + reloads the page) generous headroom. Individual web-first assertions
// still keep their own short, self-documenting timeouts. `test.setTimeout()`
// inside a test body can't extend fixture setup, so the cap is set here.
test.describe.configure({ mode: "serial", timeout: 180_000 });

// A namespaced, collision-proof suffix for anything we type into forms.
function uniq(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 (alt): signup → org THROUGH THE UI.
//
// docs §1a row 1: fill the signup form, submit, land on /app/dashboard with the
// app chrome rendered. This is the only place we drive the signup form; the rest
// of the journey starts pre-authed via the fixture for speed + isolation.
// ─────────────────────────────────────────────────────────────────────────────
test("signup form creates an account and lands in the authed app", async ({
  page,
  request,
}) => {
  const stamp = uniq("ui");
  const email = `${stamp}@test.gorilla.local`;

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();

  // The signup FormField labels aren't programmatically associated with the
  // inner <input> (TextInput doesn't render an id), so target by placeholder /
  // input type rather than getByLabel.
  const nameField = page.getByPlaceholder("Your name");
  const emailField = page.getByPlaceholder("name@company.com");
  const companyField = page.getByPlaceholder("Your company or brand");
  const passwordField = page.locator('input[type="password"]');

  // Fill, then assert the value stuck. This is a CSR page; on a cold compile
  // the first paint can hydrate after the initial fill and clobber the value,
  // so the toHaveValue assertions (which auto-retry) re-settle the form before
  // we submit — otherwise the email shows up empty and the client rejects it.
  await nameField.fill(`UI Tester ${stamp}`);
  await emailField.fill(email);
  await companyField.fill(`UICo ${stamp}`);
  await passwordField.fill("test-password-1234");

  await expect(emailField).toHaveValue(email, { timeout: 10_000 });
  await expect(passwordField).toHaveValue("test-password-1234");
  // Terms checkbox defaults to checked in the form; leave as-is.

  await page.getByRole("button", { name: /create account/i }).click();

  // Lands inside the authed app. signup() resolves the session then navigates
  // to the safe `next` (defaults to the dashboard).
  await expect(page).toHaveURL(/\/app\//, { timeout: 20_000 });
  // App chrome present (the sidebar brand lockup renders on every /app/* page).
  await expect(page.getByRole("link", { name: /Fe-Mail Gorilla home/i })).toBeVisible({
    timeout: 15_000,
  });

  // Best-effort teardown: delete the user we created through the UI.
  const masterKey = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("node:fs");
      const path = require("node:path");
      const txt = fs.readFileSync(
        path.resolve(__dirname, "../../server/local.env"),
        "utf8",
      );
      const m = txt.match(/^PARSE_MASTER_KEY=(.+)$/m);
      return m ? m[1].trim() : process.env.PARSE_MASTER_KEY;
    } catch {
      return process.env.PARSE_MASTER_KEY;
    }
  })();
  if (masterKey) {
    const who = await request.get(`/api/users/me`, {
      headers: {
        "X-Parse-Application-Id": "gorilla",
        "X-Parse-Session-Token": (await page.evaluate(() => {
          const raw = window.localStorage.getItem("Parse/gorilla/currentUser");
          return raw ? (JSON.parse(raw).sessionToken as string) : "";
        })),
      },
    });
    if (who.ok()) {
      const { objectId } = await who.json();
      await request
        .delete(`/api/users/${objectId}`, {
          headers: {
            "X-Parse-Application-Id": "gorilla",
            "X-Parse-Master-Key": masterKey,
          },
        })
        .catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous-redirect guard: an /app/* route bounces a logged-out visitor to
// /login. (docs §1a precondition #2 — the CSR auth gate.)
// ─────────────────────────────────────────────────────────────────────────────
test("anonymous visitor to /app/* is redirected to /login", async ({ page }) => {
  // Fresh context (no fixture) — nothing in localStorage, so the auth-required
  // middleware redirects once the auth store hydrates client-side.
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// The flagship continuous journey, starting pre-authed via `orgUser`.
//
// Covers docs §1a steps 2/6/7/8/9/10/11/12 (the user-visible spine). Steps that
// require real SES inboxes (the open/click/bounce tail) are owned by the wired
// Vitest sibling §1b and are out of scope for the browser spine.
// ─────────────────────────────────────────────────────────────────────────────
test("golden path: audience → contact → segment → template → editor → test-send → send", async ({
  page,
  orgUser,
}) => {
  // The fixture already seeded the Parse session in localStorage. Each step
  // below is its own UI-driven leg with web-first assertions. (The overall
  // per-test cap is raised at the describe level above.)

  // ── Step A · Dashboard renders for the authed org user ────────────────────
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 20_000 });
  // The signed-in user's name (or username) shows in the sidebar user block.
  await expect(
    page.getByText(orgUser.name, { exact: false }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // ── Step B · Create an Audience ───────────────────────────────────────────
  const audienceName = uniq("Newsletter");
  await page.goto("/app/audiences");
  await expect(page.getByRole("heading", { name: "Audiences", level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  // Open the create modal (header CTA). There may be two "New audience" buttons
  // (header + empty state); the first is the always-present header CTA.
  await page.getByRole("button", { name: "New audience" }).first().click();

  const createDialog = page.getByRole("dialog", { name: /New audience/i });
  await expect(createDialog).toBeVisible();
  await createDialog.getByPlaceholder(/Newsletter subscribers/i).fill(audienceName);
  await createDialog.getByRole("button", { name: /Create audience/i }).click();

  // The new audience card appears in the grid (optimistic prepend + reload).
  await expect(createDialog).toBeHidden({ timeout: 15_000 });
  const audienceCard = page.getByRole("link", { name: new RegExp(audienceName) });
  await expect(audienceCard.first()).toBeVisible({ timeout: 15_000 });

  // ── Step C · Open the audience + add a Contact ────────────────────────────
  await audienceCard.first().click();
  await expect(page).toHaveURL(/\/app\/audiences\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: audienceName, level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  const contactEmail = `${uniq("avery")}@test.gorilla.local`;
  await page.getByRole("button", { name: "Add contact" }).first().click();

  const contactDialog = page.getByRole("dialog", { name: /Add contact/i });
  await expect(contactDialog).toBeVisible();
  await contactDialog.getByPlaceholder("name@example.com").fill(contactEmail);
  // Distinct firstName so the merge-tag preview (step E) and segment sample have
  // something to show. FormField labels aren't id-associated, so reach the input
  // via the field whose label text is "First name".
  await contactDialog
    .locator(".form-field", { hasText: "First name" })
    .locator("input")
    .fill("Avery");
  // Tag it so a segment rule has something to match.
  await contactDialog.getByPlaceholder(/vip, beta, newsletter/i).fill("vip");
  await contactDialog.getByRole("button", { name: "Add contact" }).click();

  await expect(contactDialog).toBeHidden({ timeout: 15_000 });
  // The contact row renders in the table.
  await expect(page.getByText(contactEmail).first()).toBeVisible({ timeout: 15_000 });

  // ── Step D · Build + save a Segment ───────────────────────────────────────
  const segmentName = uniq("VIP segment");
  await page.goto("/app/segments/new");
  await expect(page.getByRole("heading", { name: "New segment", level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByPlaceholder(/Engaged gmail subscribers/i).fill(segmentName);

  // Add one condition: tags contains "vip". The builder seeds a new condition as
  // (email contains ""), so switch the field → tags, then set the value.
  await page.getByRole("button", { name: "Add condition" }).click();
  // Each condition row's controls are <SelectInput>/<TextInput> with the parent
  // class merged onto the native element, so the <select> itself carries
  // `rb-field` and the value <input> carries `rb-value`.
  const condRow = page.locator(".rb-cond").first();
  await expect(condRow).toBeVisible({ timeout: 10_000 });
  await condRow.locator("select.rb-field").selectOption("tags");
  // After field change the value input is a plain text box; type the tag.
  await condRow.locator("input.rb-value").fill("vip");

  // Live preview should resolve to a number (our 1 tagged contact, ≥ 1).
  const previewNum = page.locator(".se-count-num");
  await expect(previewNum).toBeVisible({ timeout: 15_000 });
  // Wait for the debounced preview to settle off the "…" placeholder.
  await expect
    .poll(async () => (await previewNum.innerText()).trim(), { timeout: 15_000 })
    .not.toBe("…");

  await page.getByRole("button", { name: /Create segment/i }).click();
  // On create the editor replaces the URL with the saved segment's id.
  await expect(page).toHaveURL(/\/app\/segments\/(?!new)[^/]+$/, { timeout: 20_000 });

  // It also shows up on the segments list.
  await page.goto("/app/segments");
  await expect(page.getByRole("link", { name: new RegExp(segmentName.slice(0, 20)) }).first()).toBeVisible({
    timeout: 15_000,
  });

  // ── Step E · Templates gallery → "Use this" → lands in the editor ─────────
  await page.goto("/app/templates");
  await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  // 49 system templates are seeded; the gallery cards each carry a "Use this".
  const useThis = page.getByRole("button", { name: "Use this" }).first();
  await expect(useThis).toBeVisible({ timeout: 20_000 });
  await useThis.click();

  // Forking creates a draft Campaign and navigates to its editor.
  await expect(page).toHaveURL(/\/app\/campaigns\/[^/]+\/edit/, { timeout: 25_000 });

  // ── Step F · Verify the campaign opened in the editor ─────────────────────
  // The EditorShell mounts its top bar (Send CTA + the Setup/name button).
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByRole("button", { name: /Open setup/i })).toBeVisible();

  // ── Step G · Test-send popover (sendTestEmail, mock SES) ──────────────────
  await page.getByRole("button", { name: "Test send" }).click();
  const testDialog = page.getByRole("dialog", { name: "Test send" });
  await expect(testDialog).toBeVisible({ timeout: 10_000 });
  // Pre-filled with the current user's email; send to it.
  await testDialog.getByPlaceholder("you@example.com").fill(orgUser.email);
  await testDialog.getByRole("button", { name: "Send test" }).click();

  // Success panel confirms the recipient (mock SES returns a messageId).
  await expect(testDialog.getByText(/Test sent to/i)).toBeVisible({ timeout: 25_000 });
  // Close it.
  await testDialog.getByRole("button", { name: "Done" }).click();
  await expect(testDialog).toBeHidden();

  // ── Step H · Pre-flight + Send ────────────────────────────────────────────
  // Open the pre-flight checklist. A freshly-forked template will fail several
  // checks (no subject / from / audience), so the journey first fills them via
  // the Setup popover, then sends.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  // The pre-flight modal is teleported to <body>; in the checklist state it has
  // an accessible name, but the result panels drop it (the labelledby target
  // loses its heading), so we anchor on the stable `.pf-modal` container.
  const preflight = page.locator(".pf-modal");
  await expect(preflight.getByText("Ready to send?")).toBeVisible({ timeout: 10_000 });

  // Use the checklist's "Edit →" deep-link on the Subject row to open Setup
  // anchored + focused, then fill the required sender metadata.
  // (Each failing row exposes an "Edit" button that opens the Setup popover.)
  const subjectRow = preflight.locator(".pf-row", { hasText: "Subject set" });
  await subjectRow.getByRole("button", { name: "Edit" }).click();

  const setup = page.getByRole("dialog", { name: "Campaign setup" });
  await expect(setup).toBeVisible({ timeout: 10_000 });
  await setup.getByPlaceholder(/Spring sale is here/i).fill("Golden path subject");
  // "Folkways" is a substring of the from/reply-to placeholders too — match exact.
  await setup.getByPlaceholder("Folkways", { exact: true }).fill("Golden Path Sender");
  await setup.getByPlaceholder("team@folkways.io").fill(orgUser.email);

  // Pick the audience we created via the custom AudienceSelector dropdown.
  await setup.getByRole("button", { name: /Choose an audience|contacts/i }).click();
  await page.getByRole("option", { name: new RegExp(audienceName) }).first().click();

  // Close Setup (Escape) and re-open the pre-flight checklist.
  await page.keyboard.press("Escape");
  await expect(setup).toBeHidden({ timeout: 10_000 });

  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(preflight.getByText("Ready to send?")).toBeVisible({ timeout: 10_000 });

  // The primary CTA now reads "Send to N recipients" (checks all pass). Click it.
  const sendCta = preflight.getByRole("button", { name: /Send to .* recipient/i });
  await expect(sendCta).toBeEnabled({ timeout: 10_000 });
  await sendCta.click();

  // Assert the observable send OUTCOME: either the success panel ("Sending… /
  // Track it in Reports") or, if the server rejects (e.g. unverified sender in
  // this dev config), the validation panel. Both are valid "send UI fired"
  // outcomes for the browser spine — the data-correctness of the send is owned
  // by the wired Vitest sibling (§1b). The modal's accessible name drops in the
  // result state, so assert on the page-level text, not the named dialog.
  const successPanel = page.getByText(/Track it in Reports/i);
  const errorPanel = page.getByText("Couldn't send");
  await expect(successPanel.or(errorPanel)).toBeVisible({ timeout: 30_000 });

  // If it succeeded, "View campaigns" routes back to the list.
  if (await successPanel.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "View campaigns" }).click();
    await expect(page).toHaveURL(/\/app\/campaigns/, { timeout: 20_000 });
  }
});
