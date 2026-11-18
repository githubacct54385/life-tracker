import { expect, test } from "@playwright/test";

// No sign-in token is added anywhere in this file: demo mode must work as a signed-out visitor.
// Cloudflare Access is not in front of the local server. The demo is owner-only behind Access in production (a public bypass would need a custom domain, which the owner chose not to buy).

const widths = [
  { name: "mobile", width: 360, height: 740 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const { name, width, height } of widths) {
  test(`[AC-DEM-01.1][AC-DEM-01.2][AC-DEM-01.4] /demo at ${name} width shows the ribbon, makes no API request, and does not scroll sideways`, { tag: ["@AC-DEM-01.1", "@AC-DEM-01.2", "@AC-DEM-01.4"] }, async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api")) apiRequests.push(request.url());
    });
    await page.setViewportSize({ width, height });
    await page.goto("/demo");
    await expect(page.getByText("Demo, fake data")).toBeVisible();
    await expect(page.getByText("Demo data status: ok")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(apiRequests).toEqual([]);
  });
}

for (const { name, width, height } of widths) {
  test(`[AC-DEM-02.1][AC-DEM-02.2][AC-DEM-02.3] /demo at ${name} width walks through the sample mileage import without any API request`, { tag: ["@AC-DEM-02.1", "@AC-DEM-02.2", "@AC-DEM-02.3"] }, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api") || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) requests.push(request.url());
    });
    await page.setViewportSize({ width, height });
    await page.goto("/demo");
    await expect(page.getByRole("list", { name: "Steps" }).locator('[aria-current="step"]')).toHaveText("1. Upload");
    await page.getByRole("button", { name: "Use the sample file" }).click();
    await expect(page.getByText(/10 readings found/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Steps" }).locator('[aria-current="step"]')).toHaveText("2. Preview");
    await page.getByRole("button", { name: "Import 10 readings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 10 readings" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Steps" }).locator('[aria-current="step"]')).toHaveText("3. Done");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(requests).toEqual([]);
  });
}

