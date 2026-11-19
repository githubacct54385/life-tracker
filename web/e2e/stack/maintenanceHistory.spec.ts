import { expect, test } from "../support/stack";

// MIL-06, full stack. Nothing is faked: the summary, filters and place changes go through the real API and database.
const save = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Save service" });

async function saveReading(page: import("@playwright/test").Page, miles: string) {
  await page.goto("/car/log");
  await page.getByLabel("Odometer reading").fill(miles);
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
}

async function addService(page: import("@playwright/test").Page, opts: { type: string; place?: string; cost?: string; odometer?: string; home?: boolean }) {
  await page.goto("/car/maintenance");
  await page.getByRole("checkbox", { name: opts.type }).check();
  if (opts.home) await page.getByRole("radio", { name: "I did it myself" }).check();
  else if (opts.place) {
    const select = page.getByLabel("Place", { exact: true });
    if (await select.count()) {
      await select.selectOption("Add a new place…");
      await page.getByLabel("New place").fill(opts.place);
    } else await page.getByLabel("Place (optional)").fill(opts.place);
  }
  await page.getByLabel("Odometer (optional)").fill(opts.odometer ?? "");
  if (opts.cost) await page.getByLabel(opts.home ? "Parts cost (optional)" : "Cost (optional)").fill(opts.cost);
  await save(page).click();
  await expect(page.getByRole("status")).toContainText("Saved");
}

test("[AC-MIL-06.2][AC-MIL-06.3][AC-OPS-04.3] the summary shows when each type was last done and the miles since, and Not recorded yet for the rest", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await saveReading(page, "48402");
  await addService(page, { type: "Oil change", place: "Joe's Garage", cost: "89.99", odometer: "48150" });
  await page.reload();
  const summary = page.getByRole("region", { name: "Last done" });
  const oil = summary.getByRole("listitem").filter({ hasText: "Oil change" });
  await expect(oil).toContainText("48,150 mi");
  await expect(oil).toContainText("252 mi since");
  await expect(summary.getByRole("listitem").filter({ hasText: "Tires" })).toContainText("Not recorded yet");
});

test("[AC-MIL-06.1][AC-MIL-06.4][AC-OPS-04.3] the history can be limited to one type or one place, with the total of what is shown", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await addService(page, { type: "Oil change", place: "Joe's Garage", cost: "89.99", odometer: "48150" });
  await addService(page, { type: "Wipers", home: true, cost: "18" });
  const history = page.getByRole("region", { name: "Services" });
  await expect(history).toContainText("2 services");
  await expect(history).toContainText("$107.99 total");
  await history.getByLabel("Show service").selectOption("Wipers");
  await expect(history).toContainText("1 service");
  await expect(history).toContainText("$18.00 total");
  await history.getByLabel("Show service").selectOption("");
  await history.getByLabel("Show place").selectOption("Joe's Garage");
  await expect(history).toContainText("$89.99 total");
  await expect(history.getByRole("list").getByText("At home")).toHaveCount(0);
});

test("[AC-MIL-06.5][AC-OPS-04.3] a place can be renamed and the service keeps it; it is deleted only when no service uses it", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await addService(page, { type: "Tires", place: "Acme Tire" });
  await addService(page, { type: "Brakes", place: "Joe's Garage" });
  const places = page.getByRole("region", { name: "Places" });
  await places.getByRole("button", { name: "Rename place: Acme Tire" }).click();
  await places.getByLabel("New name").fill("Joe's Garage");
  await places.getByRole("button", { name: "Save name" }).click();
  await expect(places.getByRole("alert")).toContainText("Another place already has that name");
  await places.getByLabel("New name").fill("Acme Tire & Wheel");
  await places.getByRole("button", { name: "Save name" }).click();
  await expect(places.getByText("Acme Tire & Wheel")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Services" }).getByRole("list").getByText(/Acme Tire & Wheel/)).toBeVisible();

  // A place with a service has no Delete; the API refuses it too (409). Once the service is gone it can be deleted.
  await expect(places.getByRole("button", { name: /^Delete place/ })).toHaveCount(0);
  const answers = await page.evaluate(async () => {
    const headers = { "content-type": "application/json", "x-life-tracker": "1" };
    const list = await (await fetch("/api/maintenance/places")).json();
    const acme = list.places.find((p: { name: string }) => p.name.startsWith("Acme"));
    return { id: acme.id, status: (await fetch(`/api/maintenance/places/${acme.id}`, { method: "DELETE", headers })).status };
  });
  expect(answers.status).toBe(409);
  await page.getByRole("button", { name: /^Delete service: Tires/ }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(places.getByText("Not used yet")).toBeVisible();
  await places.getByRole("button", { name: "Delete place: Acme Tire & Wheel" }).click();
  await places.getByRole("button", { name: "Yes, delete" }).click();
  await expect(places.getByText("Acme Tire & Wheel")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Place", { exact: true }).locator("option")).toHaveText(["No place named", "Joe's Garage", "Add a new place…"]);
});

test("[AC-MIL-06.6][AC-OPS-04.3] with no services the summary says what to do next", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/car/maintenance");
  await expect(page.getByText(/Nothing is recorded yet. Save a service/)).toBeVisible();
  await expect(page.getByText("Not recorded yet")).toHaveCount(9);
  await expect(page.getByText(/No services yet/)).toBeVisible();
});
