import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { LogWeightPage } from "./LogWeightPage";
import { parseWeight, formatWeight, weightToInput } from "./weightFormat";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// Synthetic values only. The demo's newest seeded weight is 2026-11-17; "today" in these tests is 2026-11-18.
const today = () => new Date(2026, 10, 18, 9, 0);

function open(api = createDemoApi({ now: today })) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <LogWeightPage />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const enter = async (value: string) => {
  const input = screen.getByLabelText(/^Weight \(/) as HTMLInputElement;
  await userEvent.clear(input);
  await userEvent.type(input, value);
};

describe("Weight screen", () => {
  it("[AC-HLT-01.1] asks for a weight only, never a date or time, and dates the entry when it is saved", async () => {
    open();
    await screen.findByText("Weight trend");
    expect(screen.getByLabelText("Weight (lb)")).toBeTruthy();
    expect(document.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]')).toBeNull();
    await enter("172.4");
    await userEvent.click(screen.getByRole("button", { name: "Save weight" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved 172.4 lb");
    expect((screen.getByLabelText("Weight (lb)") as HTMLInputElement).value).toBe("");
    expect(within(await screen.findByRole("region", { name: "Entries" })).getByText("Nov 18")).toBeTruthy();
  });

  it("[AC-HLT-01.1] will not save without a usable weight", async () => {
    open();
    await screen.findByText("Weight trend");
    const save = screen.getByRole("button", { name: "Save weight" });
    expect(save.hasAttribute("disabled")).toBe(true);
    await enter("abc");
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Enter a weight in pounds/)).toBeTruthy();
    await enter("172.4");
    expect(save.hasAttribute("disabled")).toBe(false);
  });

  it("[AC-HLT-01.3] a second entry for the day asks to replace the first, and keeping it saves nothing", async () => {
    const api = open();
    await screen.findByText("Weight trend");
    await enter("172.4");
    await userEvent.click(screen.getByRole("button", { name: "Save weight" }));
    await screen.findByRole("status");
    await enter("171.0");
    await userEvent.click(screen.getByRole("button", { name: "Save weight" }));
    expect((await screen.findByRole("alert")).textContent).toContain("You already saved 172.4 lb today. Replace it with 171.0 lb?");
    await userEvent.click(screen.getByRole("button", { name: "Keep the first one" }));
    expect((await api.listWeights()).entries.filter((e) => e.date === "2026-11-18")).toEqual([expect.objectContaining({ pounds: 172.4 })]);
  });

  it("[AC-HLT-01.3] confirming replaces the first entry, leaving one for the day", async () => {
    const api = open();
    await screen.findByText("Weight trend");
    await enter("172.4");
    await userEvent.click(screen.getByRole("button", { name: "Save weight" }));
    await screen.findByRole("status");
    await enter("171.0");
    await userEvent.click(screen.getByRole("button", { name: "Save weight" }));
    await userEvent.click(await screen.findByRole("button", { name: "Replace it" }));
    await waitFor(async () => expect((await api.listWeights()).entries.filter((e) => e.date === "2026-11-18")).toEqual([expect.objectContaining({ pounds: 171 })]));
  });

  it("[AC-HLT-01.2] shows a chart with a text alternative: a summary and a table of the numbers", async () => {
    open();
    const chart = await screen.findByRole("img", { name: /Line chart of 14 daily weights with a 7-day moving average/ });
    expect(chart.getAttribute("aria-label")).toContain("The latest weight is 173.6 lb on Nov 17");
    const table = screen.getByRole("table", { name: /Daily weight and 7-day moving average/ });
    expect(within(table).getAllByRole("row")).toHaveLength(15); // header + 14 days
    expect(within(table).getByText("173.6")).toBeTruthy();
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Date", "Weight (lb)", "Trend (lb)"]);
  });

  it("[AC-HLT-01.2] says what to do next when there are no entries", async () => {
    const api = createDemoApi({ now: today });
    for (const entry of (await api.listWeights()).entries) await api.deleteWeight(entry.id);
    open(api);
    expect(await screen.findAllByText(/No weights yet\. Enter today/)).toHaveLength(2); // the chart and the entries list
    expect(screen.queryByRole("img", { name: /Line chart/ })).toBeNull();
  });

  it("[AC-HLT-01.1] edits an entry's value and keeps its date", async () => {
    const api = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit 173.6 lb on Nov 17" }));
    const form = screen.getByRole("button", { name: "Save change" }).closest("form")!;
    const input = within(form).getByLabelText("Weight (lb)") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "170.2");
    expect(within(form).getByText("The date stays Nov 17.")).toBeTruthy();
    await userEvent.click(within(form).getByRole("button", { name: "Save change" }));
    await waitFor(async () => expect((await api.listWeights()).entries[0]).toMatchObject({ date: "2026-11-17", pounds: 170.2 }));
  });

  it("[AC-HLT-01.1] deleting asks first, then removes the entry", async () => {
    const api = open();
    await userEvent.click(await screen.findByRole("button", { name: "Delete 173.6 lb on Nov 17" }));
    expect(screen.getByRole("alert").textContent).toContain("removed for good");
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect((await api.listWeights()).entries).toHaveLength(14);
    await userEvent.click(screen.getByRole("button", { name: "Delete 173.6 lb on Nov 17" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(async () => expect((await api.listWeights()).entries).toHaveLength(13));
  });

  it("[AC-HLT-01.1] shows a message when saving fails", async () => {
    const api = open();
    api.logWeight = async () => {
      throw new Error("down");
    };
    await screen.findByText("Weight trend");
    await enter("172.4");
    await userEvent.click(screen.getByRole("button", { name: "Save weight" }));
    expect((await screen.findByRole("alert")).textContent).toContain("did not work");
  });

  it("[AC-HLT-01.4] enters and shows kilograms when the setting says so, and stores pounds", async () => {
    localStorage.setItem("life-tracker.preferences", JSON.stringify({ theme: "system", timeZone: "UTC", weightUnit: "kg" }));
    const api = open();
    await screen.findByText("Weight trend");
    expect(screen.getByLabelText("Weight (kg)")).toBeTruthy();
    await enter("78.2");
    await userEvent.click(screen.getByRole("button", { name: "Save weight" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved 78.2 kg");
    expect((await api.listWeights()).entries[0]!.pounds).toBe(172.4); // 78.2 kg = 172.4 lb, stored in pounds
    expect(screen.getByRole("img", { name: /kg on Nov 18/ })).toBeTruthy();
  });
});

describe("weight formatting", () => {
  it("[AC-HLT-01.4] converts what is typed to pounds for storage and back for display", () => {
    expect(parseWeight("172.4", "lb")).toBe(172.4);
    expect(parseWeight("172,4", "lb")).toBe(172.4);
    expect(parseWeight("78.2", "kg")).toBe(172.4);
    expect(formatWeight(172.4, "kg")).toBe("78.2 kg");
    expect(weightToInput(172.4, "lb")).toBe("172.4");
  });

  it("[AC-HLT-01.1] refuses what is not a usable weight", () => {
    for (const bad of ["", "abc", "0", "-5", "1e3", "12.345", "1000", "5"]) expect(parseWeight(bad, "lb")).toBeUndefined();
    expect(parseWeight("700", "kg")).toBeUndefined(); // over the stored limit once converted
  });
});
