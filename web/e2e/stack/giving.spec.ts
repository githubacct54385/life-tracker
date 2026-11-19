import { expect, test } from "../support/stack";

// GIV-01 to GIV-03, full stack. Nothing is faked.
test("[AC-GIV-01.1][AC-GIV-02.3][AC-OPS-04.3] a regular gift keeps the default description, shows in the giving totals, and can be edited and deleted", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/giving/log");
  await expect(page.getByLabel("Description")).toHaveValue(/ tithe$/); // "<Month> tithe", the default
  await page.getByLabel("Amount").fill("150.00");
  await page.getByRole("button", { name: "Save gift" }).click();
  const gifts = page.getByRole("region", { name: "Gifts by month" });
  await expect(gifts.getByText("$150.00").first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Gifts by month" }).getByText("$150.00").first()).toBeVisible();

  await page.goto("/giving");
  const totals = page.getByRole("region", { name: /Year to date|Total for/ });
  await expect(totals.getByText("$150.00").first()).toBeVisible();

  await page.goto("/giving/log");
  await page.getByRole("button", { name: /^Edit gift/ }).first().click();
  await page.getByLabel("Amount").last().fill("175.00");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByRole("region", { name: "Gifts by month" }).getByText("$175.00").first()).toBeVisible();
  await page.getByRole("button", { name: /^Delete gift/ }).first().click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText(/No gifts yet/)).toBeVisible();
});

test("[AC-GIV-02.1][AC-GIV-02.2][AC-OPS-04.3] a special contribution has a description, no month, and is totaled on its own", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/giving/special");
  await page.getByLabel(/Occasion|Description/).first().fill("Building fund appeal");
  await page.getByLabel("Amount").fill("250.00");
  await page.getByRole("button", { name: /Save/ }).first().click();
  await expect(page.getByText("Building fund appeal").first()).toBeVisible();
  await page.goto("/giving");
  const totals = page.getByRole("region", { name: /Year to date|Total for/ });
  await expect(totals.getByText("$250.00").first()).toBeVisible();
});
