import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// HLT-02: pushups are counted, not timed. The API edge is faked with synthetic workouts (the end-to-end server has no database).
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test("[AC-HLT-02.4] choosing Pushups asks how many, sends a count and no minutes, and nothing scrolls sideways at 360, 768 and 1280 px", { tag: "@AC-HLT-02.4" }, async ({ page, context }) => {
  let posted: unknown;
  await page.route("**/api/workouts", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id: 5, date: "2026-11-18", type: "Pushups", minutes: null, reps: 40, note: null, source: "manual" } });
    }
    return route.fulfill({ json: { workouts: [] } });
  });
  await signInAs(context, OWNER);
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto("/health/workouts");
    await page.getByLabel("Type").selectOption("Pushups");
    await expect(page.getByLabel("How many pushups?")).toBeVisible();
    await expect(page.getByLabel("Duration (minutes)")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.getByLabel("How many pushups?").fill("40");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page.getByRole("status")).toContainText("Saved Pushups, 40 pushups.");
  expect(posted).toEqual({ type: "Pushups", reps: 40, note: "" });
});
