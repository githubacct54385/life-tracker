import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { MaintenancePage } from "./MaintenancePage";

afterEach(cleanup);

const TODAY = "2026-11-13";
// Demo data: Nov 3 oil change + air filter at Joe's Garage ($89.99, 48,150 mi), Oct 12 wipers at home ($18.00, 47,700 mi).
// The newest odometer reading is 48,402.
const demo = () => createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
function open(api: Api = demo()) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <MaintenancePage today={TODAY} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const lastDone = () => within(screen.getByRole("region", { name: "Last done" }));
const history = () => screen.getByRole("region", { name: "Services" });
const places = () => within(screen.getByRole("region", { name: "Places" }));

describe("Last done", () => {
  it("[AC-MIL-06.2] shows each type with its latest date and mileage, and Not recorded yet for a fixed type with none", async () => {
    open();
    const oil = (await lastDone().findByText("Oil change")).closest("li")!;
    expect(oil.textContent).toContain("Nov 3");
    expect(oil.textContent).toContain("48,150 mi");
    expect(lastDone().getAllByRole("listitem")).toHaveLength(9);
    expect(within(lastDone().getByText("Tires").closest("li")!).getByText("Not recorded yet")).toBeTruthy();
  });

  it("[AC-MIL-06.2] adds the owner's own type once a service uses it", async () => {
    const api = demo();
    await api.logMaintenance({ date: "2026-11-10", services: ["Cabin filter"], doneBy: "home" });
    open(api);
    const row = (await lastDone().findByText("Cabin filter")).closest("li")!;
    expect(row.textContent).toContain("Nov 10");
    expect(lastDone().getAllByRole("listitem")).toHaveLength(10);
  });

  it("[AC-MIL-06.3] shows the miles driven since each service, from the latest odometer reading", async () => {
    open();
    const oil = (await lastDone().findByText("Oil change")).closest("li")!;
    await waitFor(() => expect(oil.textContent).toContain("252 mi since"));
    expect(lastDone().getByText("Wipers").closest("li")!.textContent).toContain("702 mi since");
  });

  it("[AC-MIL-06.3] shows no miles since for a service saved without a mileage", async () => {
    const api = demo();
    await api.logMaintenance({ date: "2026-11-10", services: ["Tires"], doneBy: "home" });
    open(api);
    const tires = (await lastDone().findByText("Tires")).closest("li")!;
    await screen.findAllByText(/252 mi since/);
    expect(tires.textContent).toContain("Nov 10");
    expect(tires.textContent).not.toContain("since");
  });
});

describe("History filters", () => {
  it("[AC-MIL-06.1] lists services newest first with date, types, place or At home, cost and odometer", async () => {
    open();
    await screen.findByText("Oil change, Air filter");
    const rows = within(within(history()).getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Nov 3");
    expect(rows[0]!.textContent).toContain("Joe's Garage");
    expect(rows[0]!.textContent).toContain("$89.99");
    expect(rows[0]!.textContent).toContain("48,150 mi");
    expect(rows[1]!.textContent).toContain("At home");
  });

  it("[AC-MIL-06.4] shows the total cost of everything, then of one type, then of one place", async () => {
    open();
    await screen.findByText("Oil change, Air filter");
    const summary = () => within(history()).getByText(/total/).textContent;
    expect(summary()).toContain("2 services");
    expect(summary()).toContain("$107.99");
    await userEvent.selectOptions(within(history()).getByLabelText("Show service"), "Wipers");
    expect(summary()).toContain("1 service");
    expect(summary()).toContain("$18.00");
    expect(within(within(history()).getByRole("list")).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.selectOptions(within(history()).getByLabelText("Show service"), "");
    await userEvent.selectOptions(within(history()).getByLabelText("Show place"), "Joe's Garage");
    expect(summary()).toContain("$89.99");
  });

  it("[AC-MIL-06.4] says so when nothing matches both choices, and offers a way back", async () => {
    open();
    await screen.findByText("Oil change, Air filter");
    await userEvent.selectOptions(within(history()).getByLabelText("Show service"), "Wipers");
    await userEvent.selectOptions(within(history()).getByLabelText("Show place"), "Joe's Garage");
    expect(within(history()).getByText(/No services match/)).toBeTruthy();
    expect(within(history()).getByText(/0 services/).textContent).toContain("$0.00");
  });
});

describe("Places", () => {
  it("[AC-MIL-06.5] renames a place, and the services show the new name", async () => {
    open();
    await screen.findByRole("region", { name: "Places" });
    await userEvent.click(await places().findByRole("button", { name: "Rename place: Joe's Garage" }));
    const input = places().getByLabelText("New name");
    await userEvent.clear(input);
    await userEvent.type(input, "Joe's Auto");
    await userEvent.click(places().getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(places().getByText("Joe's Auto")).toBeTruthy());
    expect(within(within(history()).getByRole("list")).getByText(/Joe's Auto/)).toBeTruthy();
  });

  it("[AC-MIL-06.5] says when the new name is already taken by another place", async () => {
    const api = demo();
    await api.logMaintenance({ date: "2026-11-10", services: ["Tires"], doneBy: "shop", placeName: "Acme Tire" });
    open(api);
    await screen.findByRole("region", { name: "Places" });
    await userEvent.click(await places().findByRole("button", { name: "Rename place: Acme Tire" }));
    const input = places().getByLabelText("New name");
    await userEvent.clear(input);
    await userEvent.type(input, "joe's garage");
    await userEvent.click(places().getByRole("button", { name: "Save name" }));
    expect((await places().findByRole("alert")).textContent).toContain("Another place already has that name");
  });

  it("[AC-MIL-06.5] offers delete only for a place no service uses, and asks first", async () => {
    const api = demo();
    const saved = await api.logMaintenance({ date: "2026-11-10", services: ["Tires"], doneBy: "shop", placeName: "Acme Tire" });
    await api.deleteMaintenance(saved.id);
    open(api);
    await screen.findByRole("region", { name: "Places" });
    await places().findByText("Acme Tire");
    expect(places().queryByRole("button", { name: "Delete place: Joe's Garage" })).toBeNull();
    expect(places().getByText("Used by 1 service")).toBeTruthy();
    await userEvent.click(places().getByRole("button", { name: "Delete place: Acme Tire" }));
    await userEvent.click(places().getByRole("button", { name: "Keep it" }));
    expect(places().getByText("Acme Tire")).toBeTruthy();
    await userEvent.click(places().getByRole("button", { name: "Delete place: Acme Tire" }));
    await userEvent.click(places().getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(places().queryByText("Acme Tire")).toBeNull());
    expect((await api.listServicePlaces()).places.map((p) => p.name)).toEqual(["Joe's Garage"]);
  });
});

describe("Loading, empty and failed states", () => {
  it("[AC-MIL-06.6] shows a loading placeholder in the summary and the history until the services arrive", async () => {
    const api = { ...demo(), listMaintenance: () => new Promise<never>(() => undefined) } as Api;
    open(api);
    expect(within(screen.getByRole("region", { name: "Last done" })).getByText("Loading…")).toBeTruthy();
    expect(within(history()).getByText("Loading…")).toBeTruthy();
  });

  it("[AC-MIL-06.6] says what to do next when there are no services yet, and still lists the fixed types", async () => {
    const base = demo();
    const api = { ...base, listMaintenance: async () => ({ records: [] }), listServicePlaces: async () => ({ places: [] }) } as Api;
    open(api);
    expect(await lastDone().findByText(/Nothing is recorded yet. Save a service/)).toBeTruthy();
    expect(lastDone().getAllByText("Not recorded yet")).toHaveLength(9);
    expect(within(history()).getByText(/No services yet. Choose what was done above, then save./)).toBeTruthy();
  });

  it("[AC-MIL-06.6] says the services could not be loaded, and loads them when the owner tries again", async () => {
    const base = demo();
    let fail = true;
    const api = {
      ...base,
      listMaintenance: async () => {
        if (fail) throw new Error("down");
        return base.listMaintenance();
      },
    } as Api;
    open(api);
    expect((await within(history()).findByRole("alert")).textContent).toContain("We could not load your services.");
    expect(within(screen.getByRole("region", { name: "Last done" })).getByRole("alert").textContent).toContain("We could not load your services.");
    fail = false;
    await userEvent.click(within(history()).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Oil change, Air filter")).toBeTruthy();
  });
});
