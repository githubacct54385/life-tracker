import { expect, test } from "../support/stack";

// MIL-01, full stack: the real page, API, Postgres and app role. Nothing is faked.
test("[AC-MIL-01.1][AC-OPS-04.3] a reading is saved to the database, listed, and still there after a reload", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/log");
  await page.getByLabel("Odometer reading").fill("48000");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 48,000 mi.");
  const recent = page.getByRole("region", { name: "Recent readings" });
  await expect(recent.getByText("48,000 mi", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Recent readings" }).getByText("48,000 mi", { exact: true })).toBeVisible();
});

test("[AC-MIL-01.2][AC-OPS-04.3] a lower reading shows a warning and is saved only after confirming", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/log");
  await page.getByLabel("Odometer reading").fill("48000");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 48,000 mi.");
  await page.getByLabel("Odometer reading").fill("47000");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("alert")).toContainText("Save anyway?");
  await expect(page.getByRole("region", { name: "Recent readings" }).getByText("47,000 mi", { exact: true })).toHaveCount(0); // not saved yet
  await page.getByRole("button", { name: "Yes, save" }).click();
  await expect(page.getByRole("region", { name: "Recent readings" }).getByText("47,000 mi", { exact: true })).toBeVisible();
});

test("[AC-MIL-01.4][AC-OPS-04.3] a reading can be edited and deleted, and the change is in the database", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/log");
  await page.getByLabel("Odometer reading").fill("48000");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByRole("button", { name: /^Edit reading/ }).click();
  await page.getByLabel("New odometer reading").fill("48100");
  await page.getByRole("button", { name: "Save change" }).click();
  const recent = page.getByRole("region", { name: "Recent readings" });
  await expect(recent.getByText("48,100 mi", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Recent readings" }).getByText("48,100 mi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Delete reading/ }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText(/No readings yet/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/No readings yet/)).toBeVisible();
});
