import { expect, test } from "../support/stack";

// GRO-02, full stack: the browser's network is switched off and back on. Nothing is faked.
test(
  "[AC-GRO-02.1][AC-GRO-02.2][AC-GRO-02.3][AC-GRO-02.7][AC-OPS-04.3] with the network off the list opens from the saved copy, changes show at once, and they reach the server when the network returns",
  { tag: ["@AC-GRO-02.7", "@AC-OPS-04.3"] },
  async ({ page, context }) => {
    await page.goto("/groceries");
    await page.getByLabel("Add an item").fill("Spinach");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByLabel("Add an item").fill("Milk");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Found 0 of 2")).toBeVisible();

    // The app shell is saved by the service worker; wait until it controls the page so a reload works with no network.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByText("Found 0 of 2")).toBeVisible();
    await expect(page.evaluate(() => !!navigator.serviceWorker.controller)).resolves.toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(/Offline\./)).toBeVisible();
    await expect(page.getByRole("region", { name: "Produce" })).toContainText("Spinach");
    await expect(page.getByText("Found 0 of 2")).toBeVisible();

    await page.getByRole("button", { name: /^Spinach/ }).click();
    await expect(page.getByText("Found 1 of 2")).toBeVisible();
    await page.getByLabel("Add an item").fill("Bread");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("region", { name: "Bakery" })).toContainText("Bread");
    await page.getByRole("button", { name: "Edit Milk" }).click();
    await page.getByLabel("Section").selectOption("Drinks");
    await page.getByRole("button", { name: "Save change" }).click();
    await expect(page.getByRole("region", { name: "Drinks" })).toContainText("Milk");
    await page.getByRole("button", { name: "Edit Bread" }).click();
    await page.getByRole("button", { name: "Remove item" }).click();
    await expect(page.getByRole("region", { name: "Bakery" })).toHaveCount(0);
    await expect(page.getByText(/changes? (is|are) waiting/)).toBeVisible();

    // The changes survive closing the app: reload with the network still off.
    await page.reload();
    await expect(page.getByText(/Offline\./)).toBeVisible();
    await expect(page.getByRole("region", { name: "Found" })).toContainText("Spinach");
    await expect(page.getByRole("region", { name: "Drinks" })).toContainText("Milk");

    await context.setOffline(false);
    await expect(page.getByText(/Offline\./)).toHaveCount(0);
    await expect(page.getByText(/changes? (is|are) waiting/)).toHaveCount(0);

    // The server has them: ask it directly, then reload.
    const server = await page.evaluate(async () => (await (await fetch("/api/groceries")).json()).items.map((i: { name: string; section: string; found: boolean }) => `${i.name}|${i.section}|${i.found}`));
    expect(server.sort()).toEqual(["Milk|Drinks|false", "Spinach|Produce|true"]);
    await page.reload();
    await expect(page.getByRole("region", { name: "Drinks" })).toContainText("Milk");
    await expect(page.getByText("Found 1 of 2")).toBeVisible();
  },
);
