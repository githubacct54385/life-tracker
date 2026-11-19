import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// SET-01: the owner's time zone from Settings travels with every request, so the server dates new entries in it.
// The API edge is faked with synthetic data (the end-to-end server has no database).
test("[AC-SET-01.5] saving a reading sends the time zone chosen in Settings", { tag: "@AC-SET-01.5" }, async ({ page, context }) => {
  let zone: string | undefined;
  await page.route("**/api/odometer", async (route) => {
    if (route.request().method() === "POST") {
      zone = route.request().headers()["x-owner-time-zone"];
      return route.fulfill({ json: { status: "saved", reading: { id: 3, date: "2026-11-14", miles: 48_500 } } });
    }
    return route.fulfill({ json: { readings: [] } });
  });
  await signInAs(context, OWNER);
  await page.addInitScript(() => localStorage.setItem("life-tracker.preferences", JSON.stringify({ theme: "system", timeZone: "Asia/Tokyo", weightUnit: "lb" })));
  await page.goto("/car/log");
  await page.getByLabel("Odometer reading").fill("48500");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 48,500 mi");
  expect(zone).toBe("Asia/Tokyo");
});
