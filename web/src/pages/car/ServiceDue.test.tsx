import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextDue } from "@life-tracker/shared";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { MaintenancePage } from "./MaintenancePage";
import { dueText, fullDate, STATE_WORDS } from "./ServiceDue";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = "2026-11-13";
// The demo: oil change done 2026-11-03 at 48,150 mi, wipers 2026-10-12, newest odometer reading 48,402. Sample intervals: oil change
// 5,000 mi or 6 months, wipers 12 months, tires 40,000 mi (never logged).
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
const card = async () => within(await screen.findByRole("region", { name: "Service due" }));
const rowOf = async (service: string) => {
  const list = (await card()).getByRole("list");
  return within(within(list).getAllByRole("listitem").find((li) => li.textContent?.startsWith(service))!);
};

describe("Service due", () => {
  it("[AC-MIL-09.2][AC-MIL-09.4] shows each tracked type with its state in words and when it is next due", async () => {
    open();
    const oil = await rowOf("Oil change");
    expect(oil.getByText(STATE_WORDS.ok)).toBeTruthy();
    expect(oil.getByText(/Due at 53,150 mi, 4,748 miles to go.*or on May 3, 2027, 171 days to go \(whichever comes first\)/)).toBeTruthy();
    expect((await rowOf("Wipers")).getByText(/Due on Oct 12, 2027/)).toBeTruthy();
    const tires = await rowOf("Tires");
    expect(tires.getByText("Never logged", { selector: "span" })).toBeTruthy();
    expect(tires.getByText(/Log this service to start the clock/)).toBeTruthy();
  });

  it("[AC-MIL-09.4] says Due soon within 500 miles, and Overdue once the mileage has passed, in words and not by colour alone", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
    await api.saveServiceInterval({ service: "Oil change", miles: 400 }); // due at 48,550, so 148 miles to go
    await api.saveServiceInterval({ service: "Wipers", miles: 1 });
    await api.logMaintenance({ date: "2026-11-01", services: ["Wipers"], doneBy: "home", odometerMiles: 48_000 }); // due at 48,001, so 401 miles past
    open(api);
    expect((await rowOf("Oil change")).getByText("Due soon")).toBeTruthy();
    const wipers = await rowOf("Wipers");
    expect(wipers.getByText("Overdue")).toBeTruthy();
    expect(wipers.getByText(/401 miles past/)).toBeTruthy();
  });

  it("[AC-MIL-09.1] a type with no interval is never listed as due", async () => {
    open();
    await rowOf("Oil change");
    const items = (await card()).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items.some((text) => text.startsWith("Air filter"))).toBe(false);
  });

  it("[AC-MIL-09.1][AC-MIL-09.7] sets an interval with miles, months or both, changes it, and stops tracking it", async () => {
    const api = open();
    const section = await card();
    await userEvent.type(section.getByLabelText("Service"), "air filter");
    await userEvent.type(section.getByLabelText("Every (miles)"), "12,000");
    await userEvent.click(section.getByRole("button", { name: "Save interval" }));
    expect(await screen.findByText("Saved the interval for air filter.")).toBeTruthy();
    // The filter was logged in the demo on Nov 3 at 48,150 mi: due at 60,150.
    expect((await rowOf("air filter")).getByText(/Due at 60,150 mi/)).toBeTruthy();

    await userEvent.click((await rowOf("air filter")).getByText("Change"));
    expect((section.getByLabelText("Service") as HTMLInputElement).value).toBe("air filter");
    expect((section.getByLabelText("Every (miles)") as HTMLInputElement).value).toBe("12000");
    await userEvent.type(section.getByLabelText("Every (months)"), "12");
    await userEvent.click(section.getByRole("button", { name: "Save interval" }));
    await waitFor(async () => expect((await rowOf("air filter")).getByText(/or on Nov 3, 2027/)).toBeTruthy());
    expect((await api.listServiceIntervals()).intervals.find((i) => i.service === "air filter")).toMatchObject({ miles: 12_000, months: 12 });

    await userEvent.click((await rowOf("air filter")).getByText("Stop tracking"));
    await waitFor(async () => expect((await api.listServiceIntervals()).intervals.some((i) => i.service === "air filter")).toBe(false));
    expect(await screen.findByText("Stopped tracking air filter.")).toBeTruthy();
  });

  it("[AC-MIL-09.7] refuses a blank name, no interval, and numbers out of range, and nothing is saved", async () => {
    const api = open();
    const section = await card();
    const before = (await api.listServiceIntervals()).intervals.length;
    const save = () => userEvent.click(section.getByRole("button", { name: "Save interval" }));
    await save();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Type a service name/);
    await userEvent.type(section.getByLabelText("Service"), "Brakes");
    await save();
    expect(screen.getByRole("alert").textContent).toBe("Give the miles, the months, or both.");
    await userEvent.type(section.getByLabelText("Every (miles)"), "0");
    await save();
    expect(screen.getByRole("alert").textContent).toMatch(/Miles must be a whole number from 1 to 200,000/);
    await userEvent.clear(section.getByLabelText("Every (miles)"));
    await userEvent.type(section.getByLabelText("Every (months)"), "121");
    await save();
    expect(screen.getByRole("alert").textContent).toMatch(/Months must be a whole number from 1 to 120/);
    expect((await api.listServiceIntervals()).intervals).toHaveLength(before);
  });

  it("[AC-MIL-09.7] says so when saving fails, and keeps what was typed", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
    api.saveServiceInterval = async () => {
      throw new Error("down");
    };
    open(api);
    const section = await card();
    await userEvent.type(section.getByLabelText("Service"), "Brakes");
    await userEvent.type(section.getByLabelText("Every (miles)"), "30000");
    await userEvent.click(section.getByRole("button", { name: "Save interval" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That did not work. Try again.");
    expect((section.getByLabelText("Service") as HTMLInputElement).value).toBe("Brakes");
  });

  it("[AC-MIL-09.7] says nothing is tracked when there are no intervals, and offers a retry when loading fails", async () => {
    const empty = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
    for (const interval of (await empty.listServiceIntervals()).intervals) await empty.deleteServiceInterval(interval.id);
    open(empty);
    expect(await screen.findByText(/Nothing is tracked yet/)).toBeTruthy();
    cleanup();

    const broken = createDemoApi();
    broken.listServiceIntervals = async () => {
      throw new Error("down");
    };
    open(broken);
    expect(await screen.findByText(/Could not load this/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("[AC-MIL-09.6] gives a calendar file with only the service name and the date", async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => (created.push(blob), "blob:test")) as never;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open();
    await rowOf("Oil change");
    await userEvent.click((await rowOf("Oil change")).getByText("Add to calendar"));
    expect(click).toHaveBeenCalledOnce();
    const text = await created[0]!.text();
    expect(text).toContain("SUMMARY:Oil change due");
    expect(text).toMatch(/DTSTART;VALUE=DATE:20(26|27)\d{4}/);
    expect(text).not.toMatch(/Joe|8999|48150|53150|Front pair/);
    // A type that was never logged has no date, so it has no calendar button.
    expect((await rowOf("Tires")).queryByText("Add to calendar")).toBeNull();
  });

  it("[AC-MIL-09.8] every control is a labelled field or button, reachable by keyboard, and Enter in a field saves", async () => {
    const api = open();
    const section = await card();
    for (const label of ["Service", "Every (miles)", "Every (months)"]) expect(section.getByLabelText(label)).toBeTruthy();
    section.getByLabelText("Service").focus();
    await userEvent.keyboard("Brakes");
    await userEvent.tab();
    await userEvent.keyboard("30000{Enter}");
    expect(await screen.findByText("Saved the interval for Brakes.")).toBeTruthy();
    expect((await api.listServiceIntervals()).intervals.find((i) => i.service === "Brakes")).toMatchObject({ miles: 30_000, months: null });
    // Every button in the card is a real button, so Tab reaches it.
    for (const button of section.getAllByRole("button")) expect(button.tagName).toBe("BUTTON");
  });
});

describe("dueText and fullDate", () => {
  const base: NextDue = { service: "Oil change", intervalMiles: 5000, intervalMonths: null, state: "ok", lastDate: "2026-11-03", dueMiles: 53_150, milesLeft: 4748, dueDate: null, daysLeft: null, estimatedDate: null, daysUntilDue: null };

  it("[AC-MIL-09.3] shows the estimated date for the due mileage when there is one, and the mileage only when there is not", () => {
    expect(dueText({ ...base, estimatedDate: "2027-03-06" })).toBe("Due at 53,150 mi, 4,748 miles to go, about Mar 6, 2027.");
    expect(dueText(base)).toBe("Due at 53,150 mi, 4,748 miles to go.");
  });

  it("[AC-MIL-09.2] uses singular words for one, and says how far past when overdue", () => {
    expect(dueText({ ...base, milesLeft: 1 })).toBe("Due at 53,150 mi, 1 mile to go.");
    expect(dueText({ ...base, milesLeft: -1, intervalMonths: 6, dueMiles: 100, dueDate: "2026-11-12", daysLeft: -1, state: "overdue" })).toBe("Due at 100 mi, 1 mile past, or on Nov 12, 2026, 1 day past (whichever comes first).");
  });

  it("[AC-MIL-09.2] formats a date with its year and no time zone shift", () => {
    expect(fullDate("2027-01-01")).toBe("Jan 1, 2027");
    expect(fullDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("[AC-MIL-09.2] explains a type that needs a mileage", () => {
    expect(dueText({ ...base, state: "needs-mileage", dueMiles: null, milesLeft: null })).toMatch(/no mileage kept with it/);
  });
});
