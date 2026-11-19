import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// MIL-05: the maintenance screen in a real browser at every width. The API edge is faked with synthetic data,
// because the end-to-end server has no database. Behaviour is proven in unit and integration tests.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const RECORD = { id: 1, date: "2026-11-03", services: ["Oil change", "Air filter"], doneBy: "shop", place: { id: 1, name: "Joe's Garage" }, costCents: 8999, odometerMiles: 48_150, note: "A long synthetic note that should wrap rather than push the page sideways at any width" };

test("[AC-MIL-05.1][AC-MIL-05.2][AC-MIL-05.3] the maintenance screen offers the services, the shop choice and its places, and nothing scrolls sideways at 360, 768 and 1280 px", { tag: "@AC-MIL-05.1" }, async ({ page, context }) => {
  await page.route("**/api/maintenance/places", (route) => route.fulfill({ json: { places: [RECORD.place] } }));
  await page.route("**/api/maintenance", (route) => route.fulfill({ json: { records: [RECORD] } }));
  await page.route("**/api/odometer", (route) => route.fulfill({ json: { readings: [{ id: 2, date: "2026-11-06", miles: 48_402 }] } }));
  await signInAs(context, OWNER);
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto("/car/maintenance");
    await expect(page.getByRole("checkbox", { name: "Oil change" })).toBeVisible();
    await expect(page.getByLabel("Place", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Odometer (optional)")).toHaveValue("48402");
    await expect(page.getByText("Oil change, Air filter")).toBeVisible();
    await page.getByRole("radio", { name: "I did it myself" }).check();
    await expect(page.getByLabel("Place", { exact: true })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});

test("[AC-MIL-05.5][AC-MIL-05.9] saving sends the date, the services, the place by name and the cost in cents", { tag: "@AC-MIL-05.5" }, async ({ page, context }) => {
  let posted: unknown;
  await page.route("**/api/maintenance/places", (route) => route.fulfill({ json: { places: [RECORD.place] } }));
  await page.route("**/api/odometer", (route) => route.fulfill({ json: { readings: [] } }));
  await page.route("**/api/maintenance", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { ...RECORD, id: 2 } });
    }
    return route.fulfill({ json: { records: [] } });
  });
  await signInAs(context, OWNER);
  await page.goto("/car/maintenance");
  await page.getByRole("checkbox", { name: "Brakes" }).check();
  await page.getByLabel("Place", { exact: true }).selectOption("Joe's Garage");
  await page.getByLabel("Date").fill("2026-11-01");
  await page.getByLabel("Cost (optional)").fill("249.50");
  await page.getByRole("button", { name: "Save service" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  expect(posted).toEqual({ date: "2026-11-01", services: ["Brakes"], doneBy: "shop", placeName: "Joe's Garage", costCents: 24_950 });
});
