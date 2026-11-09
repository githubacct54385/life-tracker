import { expect, test } from "@playwright/test";

test("[AC-FND-01.2] built site loads in a browser", { tag: "@AC-FND-01.2" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Life Tracker" })).toBeVisible();
});
