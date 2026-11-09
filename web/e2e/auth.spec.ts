import { expect, test } from "@playwright/test";
import { OWNER, STRANGER, signInAs } from "./signIn";

// Emulator limit: the SWA CLI sends a signed-in user who lacks the role to the same 401 sign-in redirect
// as a signed-out visitor. Real Azure returns 403 and shows access-denied.html. These tests prove the app and
// data stay out of reach; the 403 mapping is a manual check on the real site (docs/manual-checks.md).

test("[AC-FND-02.1] the owner signs in and sees the app", { tag: "@AC-FND-02.1" }, async ({ page, context }) => {
  await signInAs(context, OWNER);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Life Tracker" })).toBeVisible();
});

test("[AC-FND-02.1] a signed-out visitor is sent to GitHub sign-in, not shown the app", { tag: "@AC-FND-02.1" }, async ({ page }) => {
  const response = await page.request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toContain("/.auth/login/github");
});

test("[AC-FND-02.2] another account never sees the app", { tag: "@AC-FND-02.2" }, async ({ page, context }) => {
  await signInAs(context, STRANGER);
  await page.goto("/", { waitUntil: "commit" }); // the emulator's sign-in page loads scripts from an outside CDN
  await expect(page).toHaveURL(/\/\.auth\/login\/github/);
  await expect(page.getByRole("heading", { name: "Life Tracker" })).toHaveCount(0);
});

test("[AC-FND-02.2] another account cannot reach a deep link or the API", { tag: "@AC-FND-02.2" }, async ({ page, context }) => {
  await signInAs(context, STRANGER);
  for (const path of ["/money", "/api/transactions"]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(await response.text()).not.toContain("Life Tracker");
  }
});

test("[AC-FND-02.2] the access-denied page is readable without signing in and offers sign-out", { tag: "@AC-FND-02.2" }, async ({ page }) => {
  await page.goto("/access-denied.html");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign out/i })).toHaveAttribute("href", /\/\.auth\/logout/);
});

test("[AC-FND-02.2] the Microsoft sign-in is blocked", { tag: "@AC-FND-02.2" }, async ({ page }) => {
  const response = await page.request.get("/.auth/login/aad", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
