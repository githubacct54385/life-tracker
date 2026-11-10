import { expect, test } from "@playwright/test";
import { ACCESS_HEADER, accessToken, OWNER, STRANGER, signInAs } from "./signIn";

// What these prove: the Worker lets the owner's signed token through and keeps everyone else out of the API.
// What they cannot prove: the redirect to GitHub and the access-denied screen come from Cloudflare Access at the edge,
// so those are manual checks (AC-MIG-04.1, AC-MIG-04.4, AC-MIG-04.7 in docs/manual-checks.md).

test("[AC-MIG-04.6] the owner opens the app and the app can reach its API", { tag: "@AC-MIG-04.6" }, async ({ page, context }) => {
  await signInAs(context, OWNER);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Life Tracker" })).toBeVisible();
  const status = await page.evaluate(async () => (await fetch("/api/health")).status);
  expect(status).toBe(200);
});

test("[AC-MIG-04.3][AC-MIG-04.6] a visitor with no token gets 401 and nothing from the API", { tag: "@AC-MIG-04.3" }, async ({ request }) => {
  for (const path of ["/api/health", "/api/health/db", "/api/mileage", "/api/anything-else"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  }
});

test("[AC-MIG-04.3][AC-MIG-04.6] a signed-in account that is not the owner gets 403 on every API call", { tag: "@AC-MIG-04.3" }, async ({ page, context }) => {
  await signInAs(context, STRANGER);
  for (const path of ["/api/health", "/api/mileage"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain("Life Tracker");
  }
  const write = await page.request.post("/api/health", { headers: { "x-life-tracker": "1" } });
  expect(write.status()).toBe(403);
});

test("[AC-MIG-04.2][AC-MIG-04.6] an expired token is refused, as is a token that was tampered with", { tag: "@AC-MIG-04.2" }, async ({ request }) => {
  const expired = await accessToken(OWNER, { expiresInSeconds: -30 });
  expect((await request.get("/api/health", { headers: { [ACCESS_HEADER]: expired } })).status()).toBe(401);
  const good = await accessToken(OWNER);
  const [header, payload, signature] = good.split(".");
  const tampered = `${header}.${Buffer.from(JSON.stringify({ email: STRANGER.email })).toString("base64url")}.${signature}`;
  expect(payload).not.toBe(tampered.split(".")[1]);
  expect((await request.get("/api/health", { headers: { [ACCESS_HEADER]: tampered } })).status()).toBe(401);
});

test("[AC-MIG-04.5] the demo path is served by the static files, not the API", { tag: "@AC-MIG-04.5" }, async ({ request }) => {
  const response = await request.get("/demo/api/health");
  expect(response.headers()["content-type"] ?? "").not.toContain("application/json");
});
