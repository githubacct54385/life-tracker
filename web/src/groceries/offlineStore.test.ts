import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoApi } from "../demo/demoApi";
import { clearGroceryDevice, GROCERY_DATABASE, indexedDbStore, memoryStore, type SavedGroceries } from "./offlineStore";

const SAVED: SavedGroceries = {
  items: [{ id: "00000000-0000-4000-8000-000000000001", name: "Milk", quantity: "2", note: "", section: "Dairy and eggs", found: false }],
  queue: [{ kind: "remove", id: "00000000-0000-4000-8000-000000000002" }],
};

afterEach(async () => {
  await clearGroceryDevice(indexedDbStore());
});

describe("the grocery copy on the device", () => {
  it.each([
    ["IndexedDB", indexedDbStore],
    ["memory", memoryStore],
  ])("[AC-GRO-02.1][AC-GRO-02.2] %s keeps the list and the waiting changes between reads, and starts empty", async (_name, make) => {
    const store = make();
    expect(await store.read()).toBeUndefined();
    await store.write(SAVED);
    expect(await store.read()).toEqual(SAVED);
    if (make === indexedDbStore) expect(await make().read()).toEqual(SAVED); // a fresh handle (as after closing the app) sees it too
  });

  it.each([
    ["IndexedDB", indexedDbStore],
    ["memory", memoryStore],
  ])("[AC-GRO-02.5] %s: clearing deletes the saved copy and the waiting changes", async (_name, make) => {
    const store = make();
    await store.write(SAVED);
    await clearGroceryDevice(store);
    expect(await store.read()).toBeUndefined();
  });

  it("[AC-GRO-02.5] clearing never throws, even when the device cannot be cleared", async () => {
    const broken = { read: async () => undefined, write: async () => {}, clear: async () => Promise.reject(new Error("blocked")) };
    await expect(clearGroceryDevice(broken)).resolves.toBeUndefined();
  });

  it("[AC-GRO-02.6] the only database this app creates on the device is the grocery one, and the other screens' data never goes in it", async () => {
    await new Promise((resolve) => Object.assign(indexedDB.deleteDatabase(GROCERY_DATABASE), { onsuccess: resolve }));
    expect(await indexedDB.databases()).toEqual([]);
    // Everything else the app can read goes through the same API object. Reading and changing it writes nothing to the device.
    const api = createDemoApi();
    await api.listWeights();
    await api.listReadings();
    await api.listGifts();
    await api.listWorkouts();
    await api.listMaintenance();
    await api.logWeight(170);
    expect(await indexedDB.databases()).toEqual([]);

    await indexedDbStore().write(SAVED);
    expect((await indexedDB.databases()).map((d) => d.name)).toEqual([GROCERY_DATABASE]);
    const saved = (await indexedDbStore().read())!;
    expect(Object.keys(saved).sort()).toEqual(["items", "queue"]);
    expect(Object.keys(saved.items[0]!).sort()).toEqual(["found", "id", "name", "note", "quantity", "section"]);
  });
});
