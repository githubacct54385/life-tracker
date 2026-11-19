import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { MaintenancePage } from "./MaintenancePage";

afterEach(cleanup);

const TODAY = "2026-11-13";
// The demo has two services (Nov 3, oil change and air filter at Joe's Garage; Oct 12, wipers at home), one place,
// and its newest odometer reading is 48,402.
function open(api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) })) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <MaintenancePage today={TODAY} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
// The page opens on the history; the form is in a panel that "Log a service" opens (AC-MIL-06.9).
const loaded = () => screen.findByRole("group", { name: "Group services" });
async function openForm() {
  await loaded();
  await userEvent.click(screen.getByRole("button", { name: "Log a service" }));
  return screen.getByRole("dialog", { name: "Log a service" });
}
const history = () => within(screen.getByRole("region", { name: "Services" }));
const save = () => screen.getByRole("button", { name: "Save service" }) as HTMLButtonElement;
const tick = (name: string) => userEvent.click(screen.getByRole("checkbox", { name }));

describe("Maintenance screen", () => {
  it("[AC-MIL-05.1] offers the fixed list of services as ticks, and cannot be saved with none", async () => {
    open();
    await openForm();
    for (const name of ["Oil change", "Tires", "Rotate tires", "Multi-point inspection", "Brakes", "Battery", "Air filter", "Wipers", "Alignment"]) expect(screen.getByRole("checkbox", { name })).toBeTruthy();
    expect(save().disabled).toBe(true);
    await tick("Tires");
    expect(save().disabled).toBe(false);
  });

  it("[AC-MIL-05.1] the owner can add a service of their own, remove it, and not add the same one twice", async () => {
    open();
    await openForm();
    const field = screen.getByLabelText("Add your own service");
    const add = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await userEvent.type(field, "Cabin filter");
    await userEvent.click(add);
    const own = screen.getByRole("list", { name: "Your own services" });
    expect(within(own).getByText("Cabin filter")).toBeTruthy();
    expect(save().disabled).toBe(false); // an own service alone is enough
    await userEvent.type(field, "cabin FILTER");
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(own).getByRole("button", { name: "Remove Cabin filter" }));
    expect(screen.queryByRole("list", { name: "Your own services" })).toBeNull();
  });

  it("[AC-MIL-05.2] choosing 'I did it myself' hides the place and relabels the cost as parts", async () => {
    open();
    await openForm();
    expect(screen.getByLabelText("Place")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "I did it myself" }));
    expect(screen.queryByLabelText("Place")).toBeNull();
    expect(screen.queryByLabelText(/New place/)).toBeNull();
    expect(screen.getByLabelText("Parts cost (optional)")).toBeTruthy();
  });

  it("[AC-MIL-05.3] offers the places used before, and a typed new place is offered next time", async () => {
    open();
    await openForm();
    const place = screen.getByLabelText("Place") as HTMLSelectElement;
    expect([...place.options].map((o) => o.text)).toEqual(["No place named", "Joe's Garage", "Add a new place…"]);
    await tick("Brakes");
    await userEvent.selectOptions(place, "Add a new place…");
    await userEvent.type(screen.getByLabelText("New place"), "Acme Tire");
    await userEvent.click(save());
    expect((await screen.findByRole("status")).textContent).toContain("Saved Brakes.");
    await openForm();
    const after = screen.getByLabelText("Place") as HTMLSelectElement;
    expect([...after.options].map((o) => o.text)).toContain("Acme Tire");
  });

  it("[AC-MIL-05.3] a place used before can be chosen from the list", async () => {
    open();
    await openForm();
    await tick("Tires");
    await userEvent.selectOptions(screen.getByLabelText("Place"), "Joe's Garage");
    await userEvent.click(save());
    await screen.findByRole("status");
    expect(history().getAllByText(/^Nov \d+ · Joe's Garage/)).toHaveLength(2);
  });

  it("[AC-MIL-05.4] a cost of zero can be saved, and a cost that is not a dollar amount blocks saving", async () => {
    open();
    await openForm();
    await tick("Battery");
    await userEvent.type(screen.getByLabelText("Cost (optional)"), "abc");
    expect(save().disabled).toBe(true);
    expect(screen.getByText("Enter the cost in dollars, like 89.99.")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Cost (optional)"));
    await userEvent.type(screen.getByLabelText("Cost (optional)"), "0");
    await userEvent.click(save());
    await screen.findByRole("status");
    expect(history().getByText("$0.00")).toBeTruthy();
  });

  it("[AC-MIL-05.5] the date starts as today, can be changed, and cannot be after today", async () => {
    open();
    await openForm();
    const date = screen.getByLabelText("Date") as HTMLInputElement;
    expect(date.value).toBe(TODAY);
    expect(date.max).toBe(TODAY);
    await tick("Tires");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-11-01");
    expect(save().disabled).toBe(false);
    await userEvent.clear(date);
    await userEvent.type(date, "2026-11-20");
    expect(save().disabled).toBe(true);
    expect(screen.getByText("A service cannot be dated in the future.")).toBeTruthy();
  });

  it("[AC-MIL-05.6] the odometer starts as the latest reading, can be changed or cleared, and starts again after saving", async () => {
    open();
    await openForm();
    const odometer = screen.getByLabelText("Odometer (optional)") as HTMLInputElement;
    await screen.findByDisplayValue("48402");
    await userEvent.clear(odometer);
    await userEvent.type(odometer, "48500");
    await tick("Tires");
    await userEvent.click(save());
    await screen.findByRole("status");
    expect(history().getByText(/48,500 mi/)).toBeTruthy();
    await openForm();
    expect((screen.getByLabelText("Odometer (optional)") as HTMLInputElement).value).toBe("48402");
  });

  it("[AC-MIL-05.7] a note is saved and shown with the service", async () => {
    open();
    await openForm();
    await tick("Alignment");
    await userEvent.type(screen.getByLabelText("Note (optional)"), "Pulls left");
    await userEvent.click(save());
    await screen.findByRole("status");
    expect(history().getByText("Pulls left")).toBeTruthy();
  });

  it("[AC-MIL-05.8] edits a service, and a service moved to home loses its place", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: /^Edit service: Oil change, Air filter/ }));
    const editForm = screen.getByRole("button", { name: "Save change" }).closest("form")!;
    await userEvent.click(within(editForm).getByRole("radio", { name: "I did it myself" }));
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    expect(await history().findAllByText(/At home/)).toHaveLength(2);
    expect(history().queryByText(/· Joe's Garage/)).toBeNull();
  });

  it("[AC-MIL-05.8] asks before deleting, and removes the service for good", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: /^Delete service: Wipers/ }));
    expect(screen.getByText("Delete this service? It is removed for good.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByRole("button", { name: /^Delete service: Wipers/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Delete service: Wipers/ }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Delete service: Wipers/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^Delete service: Oil change, Air filter/ })).toBeTruthy();
  });

  it("[AC-MIL-05.8] says what to do when there are no services yet", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
    for (const r of (await api.listMaintenance()).records) await api.deleteMaintenance(r.id);
    open(api);
    expect(await screen.findByText(/No services yet\./)).toBeTruthy();
  });
});
