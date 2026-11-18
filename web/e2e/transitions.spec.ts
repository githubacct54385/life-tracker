import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// SET-02 motion: a confirmation panel fades out instead of vanishing, and does not animate for people who ask for
// reduced motion. The API edge is faked with synthetic readings (the end-to-end server has no database).
const READINGS = { readings: [{ id: 2, date: "2026-11-06", miles: 48_402 }, { id: 1, date: "2026-10-30", miles: 48_190 }] };

async function openDeletePanel(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext) {
  await page.route("**/api/odometer", (route) => route.fulfill({ json: READINGS }));
  await signInAs(context, OWNER);
  await page.goto("/car/log");
  await page.getByRole("button", { name: "Delete reading from Nov 6" }).click();
  await expect(page.getByText("Delete this reading?")).toBeVisible();
}

test("[AC-SET-02.6] the delete confirmation fades in and out, and is removed once it has left", { tag: "@AC-SET-02.6" }, async ({ page, context }) => {
  await openDeletePanel(page, context);
  const panel = page.locator(".lt-presence", { hasText: "Delete this reading?" });
  await expect(panel).toHaveClass(/lt-enter/);
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(panel).toHaveClass(/lt-leave/); // still on screen, leaving
  await expect(page.getByText("Delete this reading?")).toHaveCount(0); // gone after the animation
});

test("[AC-SET-02.6] with reduced motion the confirmation closes at once and nothing animates", { tag: "@AC-SET-02.6" }, async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDeletePanel(page, context);
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByText("Delete this reading?")).toHaveCount(0, { timeout: 100 });
  const animation = await page.evaluate(() => getComputedStyle(document.querySelector("main > div")!).animationName);
  expect(animation).toBe("none");
});
