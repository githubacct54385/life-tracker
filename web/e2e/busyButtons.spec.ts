import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// SET-02: a button that starts a save is disabled and shows a spinner while the server works, and one press sends
// one request. The API edge is faked with a slow, synthetic answer (the end-to-end server has no database).
test("[AC-SET-02.7] saving a reading disables the button and shows a spinner while it works, and sends one request", { tag: "@AC-SET-02.7" }, async ({ page, context }) => {
  let posts = 0;
  await page.route("**/api/odometer", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ json: { status: "saved", reading: { id: 3, date: "2026-11-18", miles: 48_500 } } });
    }
    return route.fulfill({ json: { readings: [{ id: 2, date: "2026-11-06", miles: 48_402 }] } });
  });
  await signInAs(context, OWNER);
  await page.goto("/car/log");
  await page.getByLabel("Odometer reading").fill("48500");
  const save = page.getByRole("button", { name: "Save reading" });
  await save.dblclick(); // a double tap
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(save.locator(".lt-spinner")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Saved 48,500 mi", { timeout: 5000 });
  expect(posts).toBe(1);
});
