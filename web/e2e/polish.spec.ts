import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// SET-02 polish: navigation icons, tab titles, loading placeholders and tappable tiles in a real browser.
// The API edge is faked with synthetic data (the end-to-end server has no database).
test("[AC-SET-02.8] each screen sets its own tab title and every navigation item shows an icon", { tag: "@AC-SET-02.8" }, async ({ page, context }) => {
  await signInAs(context, OWNER);
  for (const [path, title] of [["/", "Life Tracker"], ["/giving", "Giving · Life Tracker"], ["/health", "Health · Life Tracker"], ["/car", "Car · Life Tracker"], ["/settings", "Settings · Life Tracker"]] as const) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
  }
  const icons = page.locator('nav[aria-label="Main"] a svg');
  await expect(icons.first()).toBeVisible();
  expect(await icons.count()).toBeGreaterThanOrEqual(5);
});

test("[AC-SET-02.9] a slow screen shows placeholder bars, not bare text", { tag: "@AC-SET-02.9" }, async ({ page, context }) => {
  await page.route("**/api/weight", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return route.fulfill({ json: { entries: [{ id: 1, date: "2026-11-18", pounds: 180 }] } });
  });
  await page.route("**/api/**", (route) => (route.request().url().includes("/api/weight") ? route.fallback() : route.fulfill({ json: { readings: [], gifts: [], contributions: [], workouts: [], entries: [] } })));
  await signInAs(context, OWNER);
  await page.goto("/");
  await expect(page.locator('section[aria-labelledby="tile-weight"] .lt-skeleton').first()).toBeVisible();
  await expect(page.locator('section[aria-labelledby="tile-weight"]').getByText("180.0 lb", { exact: true })).toBeVisible();
});

test("[AC-SET-02.10] tapping anywhere on a dashboard tile opens its screen", { tag: "@AC-SET-02.10" }, async ({ page, context }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: { readings: [], gifts: [], contributions: [], workouts: [], entries: [{ id: 1, date: "2026-11-18", pounds: 180 }] } }));
  await signInAs(context, OWNER);
  await page.goto("/");
  const number = await page.locator('section[aria-labelledby="tile-weight"]').getByText("180.0 lb", { exact: true }).boundingBox();
  await page.mouse.click(number!.x + number!.width / 2, number!.y + number!.height / 2); // a tap on the number, not the title
  await expect(page).toHaveURL(/\/health\/weight$/);
});
