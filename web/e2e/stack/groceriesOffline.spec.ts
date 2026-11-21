import { expect, test } from "../support/stack";

// GRO-02, full stack: the browser's network is switched off and back on. Nothing is faked.
test(
  "[AC-GRO-02.1][AC-GRO-02.2][AC-GRO-02.3][AC-GRO-02.7][AC-OPS-04.3] with the network off the list opens from the saved copy, changes show at once, and they reach the server when the network returns",
  { tag: ["@AC-GRO-02.7", "@AC-OPS-04.3"] },
  async ({ page, context }) => {
    let n = 0;
    const progress = (what: string) => console.log(`[offline test ${++n}] ${what}`);
    progress("start");
    page.on("console", (m) => console.log(`[page ${m.type()}] ${m.text().slice(0, 200)}`));
    page.on("requestfailed", (r) => console.log(`[request failed] ${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText}`));
    page.on("pageerror", (e) => console.log(`[page error] ${e.message.slice(0, 200)}`));
    await page.goto("/groceries");
    progress("opened");
    const probe = await page.evaluate(
      () =>
        Promise.race([
          new Promise<string>((resolve) => {
            const request = indexedDB.open("probe-db", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("s");
            request.onerror = () => resolve(`open error ${request.error?.name}`);
            request.onblocked = () => resolve("open blocked");
            request.onsuccess = () => {
              const tx = request.result.transaction("s", "readwrite");
              tx.objectStore("s").put({ a: 1 }, "k");
              tx.oncomplete = () => resolve("round trip ok");
              tx.onerror = () => resolve(`tx error ${tx.error?.name}`);
              tx.onabort = () => resolve(`tx abort ${tx.error?.name}`);
            };
          }),
          new Promise<string>((resolve) => setTimeout(() => resolve("timed out after 5 s"), 5000)),
        ]),
    );
    progress(`indexeddb probe: ${probe}`);
    const dbs = await page.evaluate(async () => JSON.stringify(await indexedDB.databases()));
    progress(`databases: ${dbs}`);
    await page.getByLabel("Add an item").fill("Spinach");
    progress("typed");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    progress("added one");
    await page.waitForTimeout(1500);
    progress(`add button busy: ${await page.getByRole("button", { name: "Add", exact: true }).getAttribute("aria-busy")}, disabled: ${await page.getByRole("button", { name: "Add", exact: true }).isDisabled()}, status: ${await page.getByRole("status").allTextContents()}`);
    await page.getByLabel("Add an item").fill("Milk");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    progress("added two");
    await expect(page.getByText("Found 0 of 2")).toBeVisible();

    progress("items added");
    // The app shell is saved by the service worker; wait until it controls the page so a reload works with no network.
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), { timeout: 15_000, message: "the service worker is active" }).toBe(true);
    progress("service worker active, reloading online");
    await page.reload();
    progress("reloaded online");
    await expect(page.getByText("Found 0 of 2")).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000, message: "the service worker controls the page" }).toBe(true);
    // The worker saves each built file just after it serves it. Wait until every file this page loaded is saved, or the offline
    // reload below could find the app half saved (on a slow machine it does).
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const loaded = performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((path) => path.startsWith("/assets/"));
            const saved = (await (await caches.open("shell-v1")).keys()).map((r) => new URL(r.url).pathname);
            return loaded.length > 0 && loaded.every((path) => saved.includes(path));
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    progress("assets saved, going offline");
    await context.setOffline(true);
    await page.reload();
    progress("reloaded offline");
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

    progress("offline edits done");
    // The changes survive closing the app: reload with the network still off.
    await page.reload();
    await expect(page.getByText(/Offline\./)).toBeVisible();
    await expect(page.getByRole("region", { name: "Found" })).toContainText("Spinach");
    await expect(page.getByRole("region", { name: "Drinks" })).toContainText("Milk");

    progress("reloaded offline again");
    await context.setOffline(false);
    progress("back online");
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
