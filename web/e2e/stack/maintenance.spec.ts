import { expect, test } from "../support/stack";

// MIL-05, full stack. Nothing is faked: the place drop-down is filled by the real API from the real database.
const save = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Save service" });

test("[AC-MIL-05.1][AC-MIL-05.2][AC-MIL-05.3][AC-MIL-05.4][AC-OPS-04.3] a shop service with a new place is saved, and that place is offered next time", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/maintenance");
  await page.getByRole("checkbox", { name: "Oil change" }).check();
  await page.getByLabel("Add your own service").fill("Cabin filter");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Place (optional)").fill("Joe's Garage"); // no places yet: the name is typed
  await page.getByLabel("Cost (optional)").fill("89.99");
  await page.getByLabel("Note (optional)").fill("Synthetic oil");
  await save(page).click();
  await expect(page.getByRole("status")).toContainText("Saved Oil change, Cabin filter.");
  const list = page.getByRole("region", { name: "Services" }).getByRole("list");
  await expect(list.getByText("Oil change, Cabin filter")).toBeVisible();
  await expect(list.getByText("$89.99")).toBeVisible();
  await expect(list.getByText(/Joe's Garage/)).toBeVisible();

  // Next time the place is in the drop-down, and a different letter case does not add a second one.
  await page.reload();
  await expect(page.getByLabel("Place", { exact: true }).locator("option")).toHaveText(["No place named", "Joe's Garage", "Add a new place…"]);
  await page.getByRole("checkbox", { name: "Tires" }).check();
  await page.getByLabel("Place", { exact: true }).selectOption("Add a new place…");
  await page.getByLabel("New place").fill("JOE'S GARAGE");
  await save(page).click();
  await expect(page.getByRole("region", { name: "Services" }).getByRole("list").getByText("Tires")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Place", { exact: true }).locator("option")).toHaveText(["No place named", "Joe's Garage", "Add a new place…"]);
});

test("[AC-MIL-05.2][AC-MIL-05.4][AC-OPS-04.3] a service done at home is saved with no place and a cost of zero", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/maintenance");
  await page.getByRole("checkbox", { name: "Air filter" }).check();
  await page.getByRole("radio", { name: "I did it myself" }).check();
  await expect(page.getByLabel("Place", { exact: true })).toHaveCount(0);
  await page.getByLabel("Parts cost (optional)").fill("0");
  await save(page).click();
  const list = page.getByRole("region", { name: "Services" }).getByRole("list");
  await expect(list.getByText("Air filter", { exact: true })).toBeVisible();
  await expect(list.getByText(/At home/)).toBeVisible();
  await expect(list.getByText("$0.00")).toBeVisible();
});

test("[AC-MIL-05.6][AC-OPS-04.3] the odometer starts as the latest reading, and a service does not create a reading", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/log");
  await page.getByLabel("Odometer reading").fill("48402");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.goto("/car/maintenance");
  await expect(page.getByLabel("Odometer (optional)")).toHaveValue("48402");
  await page.getByLabel("Odometer (optional)").fill("48500");
  await page.getByRole("checkbox", { name: "Brakes" }).check();
  await save(page).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.goto("/car/log");
  const recent = page.getByRole("region", { name: "Recent readings" });
  await expect(recent.getByText("48,402 mi", { exact: true })).toBeVisible();
  await expect(recent.getByText("48,500 mi")).toHaveCount(0);
});

test("[AC-MIL-05.5][AC-OPS-04.3] a date in the future cannot be saved, in the screen or in the API", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/maintenance");
  await page.getByRole("checkbox", { name: "Tires" }).check();
  await page.getByLabel("Date").fill("2999-01-01");
  await expect(save(page)).toBeDisabled();
  await expect(page.getByText("A service cannot be dated in the future.")).toBeVisible();
  const answer = await page.evaluate(async () => {
    const res = await fetch("/api/maintenance", { method: "POST", headers: { "content-type": "application/json", "x-life-tracker": "1" }, body: JSON.stringify({ date: "2999-01-01", services: ["Tires"], doneBy: "home" }) });
    return { status: res.status, body: await res.json() };
  });
  expect(answer).toEqual({ status: 400, body: { error: "future_date" } });
});

test("[AC-MIL-05.8][AC-OPS-04.3] a service can be edited and deleted, and the changes are in the database", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/maintenance");
  await page.getByRole("checkbox", { name: "Battery" }).check();
  await page.getByLabel("Cost (optional)").fill("150");
  await save(page).click();
  await expect(page.getByRole("region", { name: "Services" }).getByRole("list").getByText("$150.00")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Edit service/ }).click();
  const editForm = page.getByRole("button", { name: "Save change" }).locator("xpath=ancestor::form");
  await editForm.getByLabel("Cost (optional)").fill("175");
  await editForm.getByRole("checkbox", { name: "Alignment" }).check();
  await page.getByRole("button", { name: "Save change" }).click();
  const list = page.getByRole("region", { name: "Services" }).getByRole("list");
  await expect(list.getByText("Battery, Alignment")).toBeVisible();
  await expect(list.getByText("$175.00")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Services" }).getByRole("list").getByText("$175.00")).toBeVisible();
  await page.getByRole("button", { name: /^Delete service/ }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText(/No services yet/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/No services yet/)).toBeVisible();
});
