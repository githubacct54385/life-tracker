import { expect, test } from "../support/stack";

// HLT-01, HLT-02, HLT-04, full stack. Nothing is faked.
test("[AC-HLT-01.1][AC-HLT-01.3][AC-OPS-04.3] a weight is saved, a second one the same day asks before replacing, and delete removes it", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/health/weight");
  await page.getByLabel(/^Weight \(/).fill("172.4");
  await page.getByRole("button", { name: "Save weight" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 172.4 lb");
  await page.getByLabel(/^Weight \(/).fill("171.8");
  await page.getByRole("button", { name: "Save weight" }).click();
  await expect(page.getByRole("alert")).toContainText("already saved");
  await page.getByRole("button", { name: "Replace it" }).click();
  const entries = page.getByRole("region", { name: "Entries" });
  await expect(entries.getByText("171.8 lb", { exact: true })).toBeVisible();
  await expect(entries.getByText("172.4 lb", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Entries" }).getByText("171.8 lb", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Delete/ }).first().click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("region", { name: "Entries" }).getByText("171.8 lb", { exact: true })).toHaveCount(0);
});

test("[AC-HLT-02.1][AC-HLT-02.4][AC-OPS-04.3] a timed workout and a pushups count are saved, listed, edited, and counted on the health screen", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/health/workouts");
  await page.getByLabel("Duration (minutes)").fill("30");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page.getByRole("status")).toContainText("Saved Run, 30 min");
  await page.getByLabel("Type").selectOption("Pushups");
  await page.getByLabel("How many pushups?").fill("40");
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page.getByRole("status")).toContainText("Saved Pushups, 40 pushups.");
  const recent = page.getByRole("region", { name: "Recent workouts" });
  await expect(recent.getByText("Pushups, 40 pushups")).toBeVisible();
  await expect(recent.getByText("Run, 30 min")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /^Edit Pushups on/ }).click();
  await page.getByLabel("How many pushups?").last().fill("55");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByRole("region", { name: "Recent workouts" }).getByText("Pushups, 55 pushups")).toBeVisible();

  await page.goto("/health");
  const history = page.getByRole("region", { name: "History" });
  await expect(history.getByText("Pushups, 55 pushups")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Pushups" }).first()).toBeVisible(); // the totals have a pushups column
});

test("[AC-HLT-02.4][AC-OPS-04.3] the database refuses a pushups workout that has minutes, through the API", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/");
  const status = await page.evaluate(async () => (await fetch("/api/workouts", { method: "POST", headers: { "content-type": "application/json", "x-life-tracker": "1" }, body: JSON.stringify({ type: "Pushups", reps: 10, minutes: 5 }) })).status);
  expect(status).toBe(400);
});
