import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import type { Api } from "../api/types";
import { createDemoApi } from "../demo/demoApi";
import { applyChange, createOfflineGroceries, enqueue } from "./offlineGroceries";
import { memoryStore, type GroceryStore, type QueuedChange } from "./offlineStore";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The demo API with a switch for the network: while it is off every grocery call fails the way a dead signal does. */
function switchable(api: Api = createDemoApi()) {
  const network = { up: true, status: 0 as number };
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      if (!network.up) return Promise.reject(new TypeError("Failed to fetch"));
      if (network.status) return Promise.reject(new ApiError(network.status));
      return fn(...args);
    };
  const wrapped: Api = {
    ...api,
    listGroceries: guard(api.listGroceries),
    addGrocery: guard(api.addGrocery),
    // Like the real server: changing an item that is not there is a 404.
    editGrocery: guard(async (id, edit) => {
      if (!(await api.listGroceries()).items.some((i) => i.id === id)) throw new ApiError(404);
      return api.editGrocery(id, edit);
    }),
    deleteGrocery: guard(api.deleteGrocery),
    clearGroceries: guard(api.clearGroceries),
  };
  return { api: wrapped, server: api, network };
}

const phone = (api: Api, store: GroceryStore = memoryStore(), online = () => true) => createOfflineGroceries(api, store, { online });
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe("grocery list with a copy on the device", () => {
  it("[AC-GRO-02.1] with no signal, opens the list this phone last saw and says it is offline", async () => {
    const { api, network } = switchable();
    const store = memoryStore();
    const first = await phone(api, store).open();
    expect(first.offline).toBe(false);
    expect(first.items.length).toBeGreaterThan(3);

    network.up = false; // a new session of the app, with no signal
    const view = await phone(api, store).open();
    expect(view.offline).toBe(true);
    expect(names(view.items)).toEqual(names(first.items));
  });

  it("[AC-GRO-02.1] with no signal and nothing saved, opens an empty list that says it is offline", async () => {
    const { api, network } = switchable();
    network.up = false;
    expect(await phone(api).open()).toMatchObject({ items: [], offline: true, pending: 0 });
  });

  it("[AC-GRO-02.1] does not even try the network when the browser says it is offline", async () => {
    const { api } = switchable();
    const view = await phone(api, memoryStore(), () => false).open();
    expect(view.offline).toBe(true);
  });

  it("[AC-GRO-02.2] while offline, adds, ticks, edits and removes show at once and wait to be sent", async () => {
    const { api, network, server } = switchable();
    const store = memoryStore();
    const list = phone(api, store);
    const start = await list.open();
    const [first, second, third] = start.items;
    network.up = false;

    let view = await list.add({ id: id(100), name: "Butter" });
    expect(names(view.items)).toContain("Butter");
    expect(view.items.find((i) => i.id === id(100))?.section).toBe("Dairy and eggs");
    view = await list.edit(first!.id, { ...first!, found: true });
    expect(view.items.find((i) => i.id === first!.id)?.found).toBe(true);
    view = await list.edit(second!.id, { name: "Renamed", quantity: "3", note: "n", section: "Frozen", found: false });
    expect(view.items.find((i) => i.id === second!.id)).toMatchObject({ name: "Renamed", section: "Frozen" });
    view = await list.remove(third!.id);
    expect(view.items.some((i) => i.id === third!.id)).toBe(false);
    expect(view).toMatchObject({ offline: true, pending: 4 });

    // Kept on the device: a new session sees the same list and the same waiting changes.
    const reopened = await phone(api, store).open();
    expect(reopened.pending).toBe(4);
    expect(names(reopened.items)).toEqual(names(view.items));
    expect((await server.listGroceries()).items.length).toBe(start.items.length); // the server has heard nothing yet
  });

  it("[AC-GRO-02.3] when signal returns, the waiting changes are sent in order, the notice clears, and the screen matches the server", async () => {
    const { api, network, server } = switchable();
    const list = phone(api);
    const start = await list.open();
    network.up = false;
    await list.add({ id: id(100), name: "Butter" });
    await list.edit(start.items[0]!.id, { ...start.items[0]!, found: true });
    await list.remove(start.items[1]!.id);

    network.up = true;
    const view = await list.sync();
    expect(view).toMatchObject({ offline: false, pending: 0, refusals: [] });
    expect(view.items).toEqual((await server.listGroceries()).items);
    expect(names(view.items)).toContain("Butter");
  });

  it("[AC-GRO-02.3] sends waiting changes when the app is opened again, and an add that is sent twice makes one item", async () => {
    const { api, network, server } = switchable();
    const store = memoryStore();
    await phone(api, store).open();
    network.up = false;
    await phone(api, store).add({ id: id(100), name: "Butter" });
    network.up = true;
    const view = await phone(api, store).open();
    expect(view.pending).toBe(0);
    expect((await server.listGroceries()).items.filter((i) => i.id === id(100))).toHaveLength(1);
    await server.addGrocery({ id: id(100), name: "Butter" }); // sent again
    expect((await server.listGroceries()).items.filter((i) => i.id === id(100))).toHaveLength(1);
  });

  it("[AC-GRO-02.3] a change the server refuses is shown with a message and is not lost silently; the rest are still sent", async () => {
    const { api, network, server } = switchable();
    const list = phone(api);
    const start = await list.open();
    const [first, second] = start.items;
    network.up = false;
    await list.edit(first!.id, { ...first!, found: true });
    await list.edit(second!.id, { ...second!, name: "Changed name" });
    await server.deleteGrocery(first!.id); // another device removed it meanwhile

    network.up = true;
    const view = await list.sync();
    expect(view.pending).toBe(0);
    expect(view.refusals).toHaveLength(1);
    expect(view.refusals[0]).toMatchObject({ what: `Change ${first!.name}`, reason: expect.stringContaining("removed on another device") });
    expect(names(view.items)).toContain("Changed name");
    expect(view.items.some((i) => i.id === first!.id)).toBe(false);

    expect(list.dismiss(view.refusals[0]!.id).refusals).toEqual([]);
  });

  it("[AC-GRO-02.3] an add the server refuses because the list is full is reported, not dropped silently", async () => {
    const { api, network, server } = switchable();
    await server.clearGroceries();
    for (let n = 1; n <= 300; n++) await server.addGrocery({ id: id(n), name: `item ${n}` });
    const list = phone(api);
    await list.open();
    network.up = false;
    await list.add({ id: id(500), name: "One more" });
    network.up = true;
    const view = await list.sync();
    expect(view.refusals[0]).toMatchObject({ what: "Add One more", reason: expect.stringContaining("full") });
    expect(view.items).toHaveLength(300);
  });

  it("[AC-GRO-02.3] a server error leaves the change waiting to be tried again", async () => {
    const { api, network, server } = switchable();
    const list = phone(api);
    await list.open();
    network.status = 503;
    const view = await list.add({ id: id(100), name: "Butter" });
    expect(view.pending).toBe(1);
    expect((await list.sync()).pending).toBe(1);
    network.status = 0;
    expect((await list.sync()).pending).toBe(0);
    expect(names((await server.listGroceries()).items)).toContain("Butter");
  });

  it("[AC-GRO-02.3] when the server answers the list with an error, the saved list stays and the view says it failed", async () => {
    const { api, network } = switchable();
    const store = memoryStore();
    const start = await phone(api, store).open();
    network.status = 500;
    const view = await phone(api, store).open();
    expect(view).toMatchObject({ failed: true, offline: false });
    expect(names(view.items)).toEqual(names(start.items));
  });

  it("[AC-GRO-02.4] if two phones change the same item, the change that reaches the server last wins", async () => {
    const server = createDemoApi();
    const a = switchable(server);
    const b = switchable(server);
    const phoneA = phone(a.api);
    const phoneB = phone(b.api);
    const { items } = await phoneA.open();
    await phoneB.open();
    const target = items[0]!;

    a.network.up = false;
    await phoneA.edit(target.id, { ...target, name: "From phone A", found: true });
    await phoneB.edit(target.id, { ...target, name: "From phone B" });
    await phoneB.sync();
    expect((await server.listGroceries()).items.find((i) => i.id === target.id)?.name).toBe("From phone B");

    a.network.up = true;
    const viewA = await phoneA.sync(); // A's change reaches the server last
    expect((await server.listGroceries()).items.find((i) => i.id === target.id)).toMatchObject({ name: "From phone A", found: true });
    expect(viewA.items.find((i) => i.id === target.id)?.name).toBe("From phone A");
  });

  it("[AC-GRO-02.5] finish trip leaves nothing on the device, whether or not there is signal", async () => {
    const { api, network, server } = switchable();
    const store = memoryStore();
    const list = phone(api, store);
    await list.open();
    expect(await store.read()).toBeDefined();

    await list.clear();
    await list.sync();
    expect(await store.read()).toBeUndefined();
    expect((await server.listGroceries()).items).toEqual([]);

    // With no signal the item names are gone from the device at once; only the waiting "clear" is kept, and it is gone once sent.
    await server.addGrocery({ id: id(7), name: "Milk" });
    await list.sync();
    network.up = false;
    await list.clear();
    expect(await store.read()).toEqual({ items: [], queue: [{ kind: "clear" }] });
    network.up = true;
    await list.sync();
    expect(await store.read()).toBeUndefined();
    expect((await server.listGroceries()).items).toEqual([]);
  });

  it("[AC-GRO-02.2] a device that cannot save still works for now", async () => {
    const { api } = switchable();
    const broken: GroceryStore = { read: async () => Promise.reject(new Error("no")), write: async () => Promise.reject(new Error("no")), clear: async () => {} };
    const view = await phone(api, broken).open();
    expect(view.items.length).toBeGreaterThan(0);
  });
});

describe("folding waiting changes", () => {
  const item = (n: number, name = `item ${n}`) => ({ id: id(n), name, quantity: "", note: "", section: "Other" as const, found: false });
  const add = (n: number): QueuedChange => ({ kind: "add", item: { id: id(n), name: `item ${n}` } });
  const edit = (n: number, name: string): QueuedChange => ({ kind: "edit", id: id(n), edit: { name, quantity: "", note: "", section: "Other", found: false } });

  it("[AC-GRO-02.2] the latest edit of an item replaces the earlier ones", () => {
    expect(enqueue(enqueue([], edit(1, "a")), edit(1, "b"))).toEqual([edit(1, "b")]);
  });

  it("[AC-GRO-02.2] an item added and removed while offline is never sent", () => {
    expect(enqueue(enqueue(enqueue([], add(1)), edit(1, "x")), { kind: "remove", id: id(1) })).toEqual([]);
  });

  it("[AC-GRO-02.2] removing an item that is already on the server drops its waiting edits and keeps one remove", () => {
    expect(enqueue([edit(1, "x"), edit(2, "y")], { kind: "remove", id: id(1) })).toEqual([edit(2, "y"), { kind: "remove", id: id(1) }]);
  });

  it("[AC-GRO-02.5] a clear replaces everything that was waiting", () => {
    expect(enqueue([add(1), edit(2, "y")], { kind: "clear" })).toEqual([{ kind: "clear" }]);
  });

  it("[AC-GRO-02.2] changes apply to the list the way the server will apply them", () => {
    const items = [item(1), item(2)];
    expect(applyChange(items, add(3)).map((i) => i.id)).toEqual([id(1), id(2), id(3)]);
    expect(applyChange(items, add(1))).toEqual(items);
    expect(applyChange(items, edit(2, "new"))[1]!.name).toBe("new");
    expect(applyChange(items, { kind: "remove", id: id(1) }).map((i) => i.id)).toEqual([id(2)]);
    expect(applyChange(items, { kind: "clear" })).toEqual([]);
  });
});
