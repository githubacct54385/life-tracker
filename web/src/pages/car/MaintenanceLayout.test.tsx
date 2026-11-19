import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { MaintenancePage } from "./MaintenancePage";

afterEach(cleanup);

// Demo data: Nov 3 oil change + air filter at Joe's Garage ($89.99), Oct 12 wipers at home ($18.00). Newest odometer reading 48,402.
const TODAY = "2026-11-13";
const demo = () => createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
async function withMore(): Promise<Api> {
  const api = demo();
  await api.logMaintenance({ date: "2026-11-12", services: ["Rotate tires", "Multi-point inspection"], doneBy: "shop", placeName: "Acme Tire", costCents: 3900, odometerMiles: 48_402 });
  await api.logMaintenance({ date: "2026-09-02", services: ["Oil change"], doneBy: "shop", placeName: "Joe's Garage", costCents: 7100, note: "Synthetic oil" });
  return api;
}
async function open(api: Api = demo()) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <MaintenancePage today={TODAY} />
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("group", { name: "Group services" });
  return api;
}
const history = () => within(screen.getByRole("region", { name: "Services" }));
const cards = () => [...screen.getByRole("region", { name: "Services" }).querySelectorAll<HTMLElement>("ul[id^='group-'] > li")];
const view = (name: string) => userEvent.click(screen.getByRole("button", { name }));
const group = (title: RegExp) => history().getByRole("button", { name: title });

describe("The history is what the page opens on", () => {
  it("[AC-MIL-06.7] opens on the history, with no form on the page until Log a service is pressed", async () => {
    await open();
    expect(screen.queryByRole("button", { name: "Save service" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Log a service" })).toBeTruthy();
  });

  it("[AC-MIL-06.7] groups services under month headings, newest first, each with its count and cost", async () => {
    await open(await withMore());
    const headings = history().getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["November 20262 services · $128.99", "October 20261 service · $18.00", "September 20261 service · $71.00"]);
  });

  it("[AC-MIL-06.7] shows each service as its own card with its date, what was done, place, odometer, cost and note", async () => {
    await open(await withMore());
    const card = cards().find((c) => c.textContent?.includes("Synthetic oil"))!;
    expect(card.textContent).toContain("Oil change");
    expect(card.textContent).toContain("Sep 2");
    expect(card.textContent).toContain("Joe's Garage");
    expect(card.textContent).toContain("$71.00");
    expect(within(cards()[0]!).getByRole("list", { name: "What was done" }).querySelectorAll("li")).toHaveLength(2); // a visit that did two things shows two tags
    expect(cards()).toHaveLength(4);
  });
});

describe("The switch between By date, By place and By service", () => {
  it("[AC-MIL-06.8] By place has one group per shop, one for done at home, each with count, cost and last visit", async () => {
    await open(await withMore());
    expect(screen.getByRole("button", { name: "By date" }).getAttribute("aria-pressed")).toBe("true");
    await view("By place");
    expect(screen.getByRole("button", { name: "By place" }).getAttribute("aria-pressed")).toBe("true");
    expect(group(/^Acme Tire/).textContent).toContain("1 service · $39.00 · last Nov 12");
    expect(group(/^Joe's Garage/).textContent).toContain("2 services · $160.99 · last Nov 3");
    expect(group(/^Done at home/).textContent).toContain("1 service · $18.00 · last Oct 12");
  });

  it("[AC-MIL-06.8] the newest group starts open, the others closed, and a group opens and closes", async () => {
    await open(await withMore());
    await view("By place");
    expect(group(/^Acme Tire/).getAttribute("aria-expanded")).toBe("true");
    expect(group(/^Joe's Garage/).getAttribute("aria-expanded")).toBe("false");
    expect(cards()).toHaveLength(1);
    await userEvent.click(group(/^Joe's Garage/));
    expect(group(/^Joe's Garage/).getAttribute("aria-expanded")).toBe("true");
    expect(cards()).toHaveLength(3);
    await userEvent.click(group(/^Acme Tire/));
    expect(cards()).toHaveLength(2);
  });

  it("[AC-MIL-06.8] By service has one group per kind of service, with how many times and the last date", async () => {
    await open(await withMore());
    await view("By service");
    expect(group(/^Oil change/).textContent).toContain("2 times · last Nov 3");
    expect(group(/^Wipers/).textContent).toContain("1 time · last Oct 12");
    expect(group(/^Rotate tires/)).toBeTruthy();
    expect(group(/^Multi-point inspection/)).toBeTruthy();
  });

  it("[AC-MIL-06.8] going back to By date shows the month headings again", async () => {
    await open(await withMore());
    await view("By service");
    await view("By date");
    expect(history().getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(history().queryByRole("button", { name: /^Oil change/ })).toBeNull();
  });
});

describe("Log a service opens a panel", () => {
  const button = () => screen.getByRole("button", { name: "Log a service" });

  it("[AC-MIL-06.9] opens the form as a dialog with focus on its title, and Cancel closes it and saves nothing", async () => {
    const api = await open();
    await userEvent.click(button());
    const dialog = screen.getByRole("dialog", { name: "Log a service" });
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "Log a service" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Brakes" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((await api.listMaintenance()).records).toHaveLength(2);
    expect(document.activeElement).toBe(button());
  });

  it("[AC-MIL-06.9] Escape and Close also close it without saving", async () => {
    const api = await open();
    await userEvent.click(button());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(button());
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((await api.listMaintenance()).records).toHaveLength(2);
  });

  it("[AC-MIL-06.9] keeps Tab inside the panel while it is open", async () => {
    await open();
    await userEvent.click(button());
    const dialog = screen.getByRole("dialog");
    const last = within(dialog).getByRole("button", { name: "Cancel" });
    last.focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  it("[AC-MIL-06.9] saving closes the panel, says what was saved, and the new service is in the list", async () => {
    await open();
    await userEvent.click(button());
    await userEvent.click(screen.getByRole("checkbox", { name: "Brakes" }));
    await userEvent.click(screen.getByRole("button", { name: "Save service" }));
    expect((await screen.findByRole("status")).textContent).toBe("Saved Brakes.");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(cards()[0]!.textContent).toContain("Brakes");
  });

  it("[AC-MIL-06.9] stays open with a message when saving fails, so nothing typed is lost", async () => {
    const base = demo();
    const api = { ...base, logMaintenance: async () => Promise.reject(new Error("down")) } as Api;
    await open(api);
    await userEvent.click(button());
    await userEvent.click(screen.getByRole("checkbox", { name: "Brakes" }));
    await userEvent.click(screen.getByRole("button", { name: "Save service" }));
    expect((await screen.findByRole("alert")).textContent).toContain("That did not work");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Brakes" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("Search", () => {
  const search = () => screen.getByLabelText("Search");

  it("[AC-MIL-06.10] finds services by what was done, the place or the note", async () => {
    await open(await withMore());
    await userEvent.type(search(), "wiper");
    expect(cards()).toHaveLength(1);
    await userEvent.clear(search());
    await userEvent.type(search(), "acme");
    expect(cards()).toHaveLength(1);
    await userEvent.clear(search());
    await userEvent.type(search(), "synthetic");
    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.textContent).toContain("Sep 2");
  });

  it("[AC-MIL-06.10] the count and total follow the search, and it works with the filters and the other views", async () => {
    await open(await withMore());
    await userEvent.type(search(), "joe");
    expect(history().getByText(/total/).textContent).toContain("2 services · $160.99");
    await userEvent.click(history().getByRole("button", { name: /^Filters/ }));
    await userEvent.selectOptions(history().getByLabelText("Show service"), "Oil change");
    expect(history().getByText(/total/).textContent).toContain("2 services");
    await view("By place");
    expect(history().queryByRole("button", { name: /^Acme Tire/ })).toBeNull();
    expect(group(/^Joe's Garage/).textContent).toContain("2 services");
  });

  it("[AC-MIL-06.10] says when nothing matches, and the Filters button shows how many filters are on", async () => {
    await open();
    await userEvent.type(search(), "zzz");
    expect(history().getByText(/No services match/)).toBeTruthy();
    await userEvent.clear(search());
    await userEvent.click(history().getByRole("button", { name: /^Filters/ }));
    await userEvent.selectOptions(history().getByLabelText("Show service"), "Wipers");
    expect(history().getByRole("button", { name: "Filters (1)" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Last done is a strip", () => {
  it("[AC-MIL-06.11] is closed at first, shows the most recent service, and opens to the full list", async () => {
    await open();
    const toggle = screen.getByRole("button", { name: /^Last done/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(toggle.textContent).toContain("Oil change"));
    expect(toggle.textContent).toContain("Nov 3");
    expect(within(screen.getByRole("region", { name: "Last done" })).queryAllByRole("listitem")).toHaveLength(0);
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(screen.getByRole("region", { name: "Last done" })).getAllByRole("listitem")).toHaveLength(9);
  });

  it("[AC-MIL-06.11] leaves the places list, rename and delete as they were", async () => {
    await open();
    const places = within(screen.getByRole("region", { name: "Places" }));
    expect(places.getByRole("button", { name: "Rename place: Joe's Garage" })).toBeTruthy();
  });
});
