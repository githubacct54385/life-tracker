import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

test("[AC-FND-05.2] manifest, icons and worker are served with security headers", { tag: "@AC-FND-05.2" }, async ({ page, context }) => {
  await signInAs(context, OWNER);
  for (const path of ["/manifest.webmanifest", "/sw.js", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-security-policy"], path).toContain("worker-src 'self'");
  }
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect((await page.request.get("/sw.js")).headers()["content-type"]).toContain("javascript");
});

test("[AC-FND-05.2][AC-FND-05.3] offline: shell loads, message shows, API responses never cached", { tag: ["@AC-FND-05.2", "@AC-FND-05.3"] }, async ({ page, context }) => {
  await signInAs(context, OWNER);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker
  await page.evaluate(() => fetch("/api/health"));

  const cachedPaths = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cachedPaths).toContain("/");
  expect(cachedPaths.filter((p) => p.startsWith("/api"))).toEqual([]);

  await context.setOffline(true);
  await page.goto("/car");
  await expect(page.getByRole("alert")).toContainText("You're offline");
  await expect(page.getByRole("heading", { name: "Car" })).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Car" })).toBeVisible();
});
