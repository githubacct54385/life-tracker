import { test } from "../support/stack";

// OPS-04: the full-stack guard must really fail a test. `test.fail()` says "this test is expected to fail": if the guard
// stopped working, the body would pass, the test would then be reported as an unexpected pass, and the run would go red.
test.fail("[AC-OPS-04.4] a console error on the page fails the test", { tag: "@AC-OPS-04.4" }, async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => console.error("synthetic problem for the guard test"));
});

test.fail("[AC-OPS-04.4] an API answer of 500 or more fails the test", { tag: "@AC-OPS-04.4" }, async ({ page }) => {
  await page.route("**/api/health", (route) => route.fulfill({ status: 500, json: { error: "internal" } }));
  await page.goto("/");
  await page.evaluate(() => fetch("/api/health"));
});
