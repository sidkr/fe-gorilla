// Proves tests/setup/playwrightFixtures.ts wires up the freshUser fixture
// and that the dev server boots and serves the marketing homepage.
import { test, expect } from "../setup/playwrightFixtures";

test("freshUser fixture creates a Parse user and dev server serves /", async ({
  page,
  freshUser,
}) => {
  expect(freshUser.username).toBeTruthy();
  expect(freshUser.sessionToken).toBeTruthy();
  await page.goto("/");
  await expect(page).toHaveTitle(/Gorilla/i);
});
