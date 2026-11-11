import { expect, test } from "@playwright/test";

// No sign-in token is added anywhere in this file: demo mode must work as a signed-out visitor.
// Cloudflare Access is not in front of the local server. The demo is owner-only behind Access in production (AC-DEM-01.6 retired: a public bypass needs a custom domain).

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
