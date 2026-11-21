import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { ApiProvider } from "../api/ApiContext";
import { ApiError } from "../api/client";
import type { Api } from "../api/types";
import { createDemoApi } from "../demo/demoApi";
import { SettingsPage } from "../settings/SettingsPage";
import { GroceryStoreProvider } from "./GroceryStoreContext";
import { memoryStore, type GroceryStore } from "./offlineStore";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}
afterEach(() => {
  cleanup();
  setOnline(true);
});

// The demo's made-up list (8 items: Spinach, Pasta and so on) stands in for the server. The switch makes the grocery calls fail like a dead signal.
function setup() {
  const server = createDemoApi();
  const network = { up: true };
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      network.up ? fn(...args) : Promise.reject(new TypeError("Failed to fetch"));
  const api: Api = {
    ...server,
    listGroceries: guard(server.listGroceries),
    addGrocery: guard(server.addGrocery),
    // Like the real server: changing an item that is not there is a 404.
    editGrocery: guard(async (id, edit) => {
      if (!(await server.listGroceries()).items.some((i) => i.id === id)) throw new ApiError(404);
      return server.editGrocery(id, edit);
    }),
    deleteGrocery: guard(server.deleteGrocery),
    clearGroceries: guard(server.clearGroceries),
  };
  const store = memoryStore();
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const show = (path = "/groceries") =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <ApiProvider api={api}>
          <GroceryStoreProvider store={store}>
            <App />
          </GroceryStoreProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
  const goOffline = () => {
    network.up = false;
    act(() => setOnline(false));
  };
  const goOnline = () => {
    network.up = true;
    act(() => setOnline(true));
  };
  return { server, store, network, show, goOffline, goOnline };
}

describe("grocery list with no signal", () => {
  it("[AC-GRO-02.1] opens from the saved copy with an Offline notice, while other screens still say you are offline", async () => {
    const { show, goOffline, store } = setup();
    show();
    expect(await screen.findByText("Found 1 of 8")).toBeTruthy();
    await waitFor(async () => expect(await store.read()).toBeDefined());
    cleanup();

    goOffline();
    show();
    expect(await screen.findByText("Found 1 of 8")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Groceries" })).toBeTruthy();
    expect(screen.getByText(/Offline\./)).toBeTruthy();
    expect(screen.getByText("Spinach")).toBeTruthy();
    cleanup();

    show("/car");
    expect((await screen.findByRole("alert")).textContent).toContain("You're offline");
  });

  it("[AC-GRO-02.2][AC-GRO-02.3] adds, ticks, edits and removes show at once offline, and are sent when the signal returns", async () => {
    const { show, goOffline, goOnline, server } = setup();
    show();
    await screen.findByText("Found 1 of 8");
    goOffline();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add an item"), "Butter");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(within(await screen.findByRole("region", { name: "Dairy and eggs" })).getByText("Butter")).toBeTruthy();
    await user.click(within(screen.getByRole("region", { name: "Produce" })).getByRole("button", { name: /^Spinach/ }));
    expect(await screen.findByText("Found 2 of 9")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit Pasta" }));
    const form = within(screen.getByRole("form", { name: "Change Pasta" }));
    await user.clear(form.getByLabelText("Name"));
    await user.type(form.getByLabelText("Name"), "Spaghetti");
    await user.click(form.getByRole("button", { name: "Save change" }));
    await user.click(screen.getByRole("button", { name: "Edit Paper towels" }));
    await user.click(screen.getByRole("button", { name: "Remove item" }));
    expect(await screen.findByText(/3 changes are waiting|4 changes are waiting/)).toBeTruthy();
    expect((await server.listGroceries()).items).toHaveLength(8); // the server has heard nothing

    goOnline();
    await waitFor(() => expect(screen.queryByText(/Offline\./)).toBeNull());
    await waitFor(async () => {
      const items = (await server.listGroceries()).items;
      expect(items.map((i) => i.name)).toContain("Butter");
      expect(items.map((i) => i.name)).toContain("Spaghetti");
      expect(items.map((i) => i.name)).not.toContain("Paper towels");
      expect(items.find((i) => i.name === "Spinach")?.found).toBe(true);
    });
    expect(screen.getByText("Found 2 of 8")).toBeTruthy();
  });

  it("[AC-GRO-02.3] sends what is waiting when the app comes back to the front", async () => {
    const { show, goOffline, server, network } = setup();
    show();
    await screen.findByText("Found 1 of 8");
    goOffline();
    await userEvent.type(screen.getByLabelText("Add an item"), "Butter");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/1 change is waiting/);

    // The signal returned while the app was in the background: only the "visible again" event tells it.
    network.up = true;
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(async () => expect((await server.listGroceries()).items.map((i) => i.name)).toContain("Butter"));
  });

  it("[AC-GRO-02.3] shows a clear message for a change the server refused", async () => {
    const { show, goOffline, goOnline, server } = setup();
    show();
    await screen.findByText("Found 1 of 8");
    goOffline();
    await userEvent.click(screen.getByRole("button", { name: "Edit Pasta" }));
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit Pasta" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Spaghetti");
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    const pasta = (await server.listGroceries()).items.find((i) => i.name === "Pasta")!;
    await server.deleteGrocery(pasta.id); // removed on another device
    goOnline();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Change Spaghetti was not saved");
    await userEvent.click(within(alert).getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[AC-GRO-02.5] finish trip deletes the saved copy and the waiting changes from the device", async () => {
    const { show, store } = setup();
    show();
    await screen.findByText("Found 1 of 8");
    await waitFor(async () => expect(await store.read()).toBeDefined());
    await userEvent.click(screen.getByRole("button", { name: "Finish trip" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, finish the trip" }));
    await screen.findByText(/Your list is empty/);
    await waitFor(async () => expect(await store.read()).toBeUndefined());
  });

  it("[AC-GRO-02.5] signing out deletes the saved copy from the device before leaving", async () => {
    const store: GroceryStore & { cleared: boolean } = Object.assign(memoryStore(), { cleared: false });
    await store.write({ items: [{ id: "00000000-0000-4000-8000-000000000001", name: "Milk", quantity: "", note: "", section: "Dairy and eggs", found: false }], queue: [] });
    const clear = store.clear;
    store.clear = async () => {
      store.cleared = true;
      await clear();
    };
    const went: string[] = [];
    render(
      <MemoryRouter>
        <GroceryStoreProvider store={store}>
          <SettingsPage navigate={(url) => went.push(url)} />
        </GroceryStoreProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Sign out" }));
    await waitFor(() => expect(went).toEqual(["/cdn-cgi/access/logout"]));
    expect(store.cleared).toBe(true);
    expect(await store.read()).toBeUndefined();
  });
});
