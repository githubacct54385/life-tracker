import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { ApiError } from "../../api/client";
import { createDemoApi } from "../../demo/demoApi";
import { GroceryStoreProvider } from "../../groceries/GroceryStoreContext";
import { memoryStore, type GroceryStore } from "../../groceries/offlineStore";
import { GroceriesPage } from "./GroceriesPage";

afterEach(cleanup);

// Synthetic items only. The demo list has 8 items: Bananas, Spinach (Produce), Milk, Eggs (Dairy and eggs, Eggs found), Chicken thighs,
// Pasta, Sparkling water, Paper towels.
async function empty() {
  const api = createDemoApi();
  await api.clearGroceries();
  return api;
}
function open(api: Api = createDemoApi()) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <GroceryStoreProvider store={memoryStore()}>
          <GroceriesPage />
        </GroceryStoreProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const region = (name: string) => screen.findByRole("region", { name });
const add = async (name: string) => {
  await userEvent.type(screen.getByLabelText("Add an item"), name);
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
};

describe("Groceries screen", () => {
  it("[AC-GRO-01.1] adds an item with one field and one tap, and keeps the cursor in the field for the next one", async () => {
    open(await empty());
    expect(await screen.findByText(/Your list is empty/)).toBeTruthy();
    await add("Yogurt");
    expect((await screen.findByRole("status")).textContent).toContain("Added Yogurt");
    expect(document.activeElement).toBe(screen.getByLabelText("Add an item"));
    expect((screen.getByLabelText("Add an item") as HTMLInputElement).value).toBe("");
    await add("Rice");
    expect(within(await region("Dairy and eggs")).getByText("Yogurt")).toBeTruthy();
    expect(within(await region("Pantry")).getByText("Rice")).toBeTruthy();
  });

  it("[AC-GRO-01.1] cannot add an empty name, and an optional quantity and note are shown with the item", async () => {
    open(await empty());
    await screen.findByText(/Your list is empty/);
    expect(screen.getByRole("button", { name: "Add" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByText("Add a quantity or a note"));
    await userEvent.type(screen.getByLabelText("Quantity"), "2 kg");
    await userEvent.type(screen.getByLabelText("Note"), "ripe ones");
    await add("Bananas");
    const produce = await region("Produce");
    expect(within(produce).getByText(/· 2 kg/)).toBeTruthy();
    expect(within(produce).getByText("ripe ones")).toBeTruthy();
  });

  it("[AC-GRO-01.3] groups items by store section in walking order, with the found ones in their own group at the bottom", async () => {
    open();
    await region("Produce");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Produce", "Meat and fish", "Dairy and eggs", "Pantry", "Drinks", "Household", "Found"]);
    expect(within(await region("Found")).getByText("Eggs")).toBeTruthy();
  });

  it("[AC-GRO-01.2] tapping an item marks it found, strikes it through and moves it to Found; tapping again puts it back; the count follows", async () => {
    const api = open();
    expect(await screen.findByText("Found 1 of 8")).toBeTruthy();
    await userEvent.click(within(await region("Produce")).getByRole("button", { name: /^Spinach/ }));
    expect(await screen.findByText("Found 2 of 8")).toBeTruthy();
    const found = await region("Found");
    const spinach = within(found).getByRole("button", { name: /^Spinach/ });
    expect(spinach.getAttribute("aria-pressed")).toBe("true");
    expect(spinach.querySelector(".line-through")).not.toBeNull();
    await waitFor(async () => expect((await api.listGroceries()).items.find((i) => i.name === "Spinach")?.found).toBe(true));

    await userEvent.click(spinach);
    expect(await screen.findByText("Found 1 of 8")).toBeTruthy();
    expect(within(await region("Produce")).getByRole("button", { name: /^Spinach/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("[AC-GRO-01.2] a tick made while the server cannot be reached stays on screen, and the screen says it is waiting", async () => {
    const api = { ...createDemoApi(), editGrocery: () => Promise.reject(new TypeError("Failed to fetch")) } as Api;
    open(api);
    await userEvent.click(within(await region("Produce")).getByRole("button", { name: /^Spinach/ }));
    expect(await screen.findByText("Found 2 of 8")).toBeTruthy();
    expect((await screen.findByText(/Offline\./)).parentElement?.textContent).toContain("1 change is waiting");
  });

  it("[AC-GRO-01.3][AC-GRO-01.4] tap Edit and choose a section to move an item, and the move sticks", async () => {
    const api = open();
    await userEvent.click(within(await region("Pantry")).getByRole("button", { name: "Edit Pasta" }));
    await userEvent.selectOptions(screen.getByLabelText("Section"), "Frozen");
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    expect(within(await region("Frozen")).getByText("Pasta")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Pantry" })).toBeNull();
    expect((await api.listGroceries()).items.find((i) => i.name === "Pasta")?.section).toBe("Frozen");
  });

  it("[AC-GRO-01.4] edits the name, quantity and note, and removes an item", async () => {
    const api = open();
    await userEvent.click(within(await region("Drinks")).getByRole("button", { name: "Edit Sparkling water" }));
    const form = within(screen.getByRole("form", { name: "Change Sparkling water" }));
    await userEvent.clear(form.getByLabelText("Name"));
    await userEvent.type(form.getByLabelText("Name"), "Still water");
    await userEvent.type(form.getByLabelText("Quantity"), "12");
    await userEvent.type(form.getByLabelText("Note"), "cold ones");
    await userEvent.click(form.getByRole("button", { name: "Save change" }));
    const drinks = await region("Drinks");
    expect(within(drinks).getByText("Still water")).toBeTruthy();
    expect(within(drinks).getByText(/· 12/)).toBeTruthy();
    expect(within(drinks).getByText("cold ones")).toBeTruthy();

    await userEvent.click(within(drinks).getByRole("button", { name: "Edit Still water" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove item" }));
    await waitFor(() => expect(screen.queryByText("Still water")).toBeNull());
    expect((await api.listGroceries()).items).toHaveLength(7);
  });

  it("[AC-GRO-01.5] finish trip asks first, and keeping the list changes nothing", async () => {
    const api = open();
    await userEvent.click(await screen.findByRole("button", { name: "Finish trip" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No history is kept");
    await userEvent.click(screen.getByRole("button", { name: "Keep the list" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((await api.listGroceries()).items).toHaveLength(8);
  });

  it("[AC-GRO-01.5] finish trip deletes every item after the confirmation, and clear list does the same at any time", async () => {
    const api = open();
    await userEvent.click(await screen.findByRole("button", { name: "Finish trip" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, finish the trip" }));
    expect(await screen.findByText(/Your list is empty/)).toBeTruthy();
    expect((await api.listGroceries()).items).toEqual([]);

    await add("Butter");
    await userEvent.click(await screen.findByRole("button", { name: "Clear list" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, clear the list" }));
    expect(await screen.findByText(/Your list is empty/)).toBeTruthy();
  });

  it("[AC-GRO-01.7] every control has a label, and every button is a real button (keyboard and screen readers)", async () => {
    open();
    await region("Produce");
    for (const input of screen.getAllByRole("textbox")) expect(input.id && document.querySelector(`label[for="${input.id}"]`)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Edit / }).length).toBe(8);
    expect(document.querySelector("[onclick], div[role=button]")).toBeNull();
  });

  it("[AC-GRO-01.7] reading the list does not need a sideways scroll: rows wrap long text", async () => {
    const api = await empty();
    await api.addGrocery({ id: "55555555-5555-4555-8555-555555555555", name: "a very long item name ".repeat(3).trim(), note: "and a long note ".repeat(5).trim() });
    open(api);
    const row = await screen.findByRole("button", { name: /^a very long item name/ });
    expect(row.className).toContain("min-h-11");
    expect(row.querySelector(".break-words")).not.toBeNull();
  });

  it("[AC-GRO-01.1] says why when the list is full", async () => {
    const api = await empty();
    for (let n = 1; n <= 300; n++) await api.addGrocery({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name: `item ${n}` });
    open(api);
    await screen.findByText("Found 0 of 300");
    await add("One more");
    expect((await screen.findByRole("status", { name: "" })).textContent).toContain("The list is full");
  });

  it("[AC-GRO-01.1] says so when the server answers the list with an error", async () => {
    open({ ...createDemoApi(), listGroceries: () => Promise.reject(new ApiError(500)) } as Api);
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load the list");
  });
});

describe("Groceries screen, typing quickly", () => {
  it("[AC-GRO-01.1] what is typed for the next item while the last one is still being saved is kept, and both items are added", async () => {
    // A device that saves slowly: the first save finishes only after the next item has been typed.
    const slow: GroceryStore = { ...memoryStore(), write: () => new Promise((resolve) => setTimeout(resolve, 150)) };
    render(
      <MemoryRouter>
        <ApiProvider api={await empty()}>
          <GroceryStoreProvider store={slow}>
            <GroceriesPage />
          </GroceryStoreProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findByText(/Your list is empty/);
    await add("Yogurt");
    await userEvent.type(screen.getByLabelText("Add an item"), "Rice"); // typed before the first save has finished
    expect((screen.getByLabelText("Add an item") as HTMLInputElement).value).toBe("Rice");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Found 0 of 2")).toBeTruthy();
    expect(within(await region("Dairy and eggs")).getByText("Yogurt")).toBeTruthy();
    expect(within(await region("Pantry")).getByText("Rice")).toBeTruthy();
  });
});
