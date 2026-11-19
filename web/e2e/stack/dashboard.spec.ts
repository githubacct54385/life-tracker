import { expect, test } from "../support/stack";

// DSH-01, full stack: the dashboard shows what is really in the database, and the odometer banner follows the readings.
test("[AC-DSH-01.1][AC-DSH-01.2][AC-OPS-04.3] the dashboard shows the saved weight, workout, giving and odometer state", { tag: "@AC-OPS-04.3" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your odometer reading for this week is due.")).toBeVisible(); // nothing logged yet
  await expect(page.getByText(/No weights yet/)).toBeVisible();
  await expect(page.getByText("No workouts yet this week.")).toBeVisible();

  // Save through the real API, as the screens do.
  const send = (path: string, body: unknown) =>
    page.evaluate(async ([p, b]) => (await fetch(p as string, { method: "POST", headers: { "content-type": "application/json", "x-life-tracker": "1" }, body: JSON.stringify(b) })).status, [path, body] as const);
  expect(await send("/api/odometer", { miles: 48000 })).toBe(201);
  expect(await send("/api/weight", { pounds: 180 })).toBe(201);
  expect(await send("/api/workouts", { type: "Run", minutes: 45 })).toBe(201);
  expect(await send("/api/workouts", { type: "Pushups", reps: 60 })).toBe(201);
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  expect(await send("/api/gifts", { dateGiven: today, forMonth: month, cents: 12_500, method: "check", description: "Monthly tithe" })).toBe(201);

  await page.reload();
  await expect(page.getByText("Your odometer reading for this week is due.")).toHaveCount(0);
  const weight = page.getByRole("region", { name: "Weight" });
  await expect(weight.getByText("180.0 lb", { exact: true })).toBeVisible();
  const workouts = page.getByRole("region", { name: "Workouts this week" });
  await expect(workouts.getByText("2 workouts")).toBeVisible();
  await expect(workouts.getByText(/45 min/)).toBeVisible();
  await expect(workouts.getByText(/60 pushups/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Giving this year" }).getByText("$125.00").first()).toBeVisible();
});
