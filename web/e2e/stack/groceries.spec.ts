import { expect, test } from "../support/stack";

// GRO-01, full stack. Nothing is faked.
test("[AC-GRO-01.1][AC-GRO-01.2][AC-GRO-01.3][AC-GRO-01.5][AC-OPS-04.3] items are added and sorted into sections, ticked, moved, kept after a reload, and finish trip clears the list", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/groceries");
  await expect(page.getByText("Your list is empty")).toBeVisible();

  await page.getByLabel("Add an item").fill("Spinach");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Added Spinach");
  await page.getByLabel("Add an item").fill("Milk");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("region", { name: "Produce" })).toContainText("Spinach");
  await expect(page.getByRole("region", { name: "Dairy and eggs" })).toContainText("Milk");
  await expect(page.getByText("Found 0 of 2")).toBeVisible();

  await page.getByRole("button", { name: /^Spinach/ }).click();
  await expect(page.getByRole("region", { name: "Found" })).toContainText("Spinach");
  await expect(page.getByText("Found 1 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Edit Milk" }).click();
  await page.getByLabel("Section").selectOption("Drinks");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByRole("region", { name: "Drinks" })).toContainText("Milk");

  await page.reload();
  await expect(page.getByRole("region", { name: "Drinks" })).toContainText("Milk");
  await expect(page.getByRole("region", { name: "Found" })).toContainText("Spinach");

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Groceries" })).toContainText("1 left");

  await page.goto("/groceries");
  await page.getByRole("button", { name: "Finish trip" }).click();
  await page.getByRole("button", { name: "Yes, finish the trip" }).click();
  await expect(page.getByText("Your list is empty")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Your list is empty")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Groceries" })).toHaveCount(0);
});
