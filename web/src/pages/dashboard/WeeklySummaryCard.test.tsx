import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { DashboardPage } from "./DashboardPage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// Synthetic data only: the demo has weights from Nov 4 to Nov 17, odometer readings every Friday up to Nov 6, workouts on
// Nov 3, 5 and 6, and regular gifts for Sep to Nov 2026 (given in Oct and Nov) with special contributions on Sep 14 and Mar 29.
// "Today" Sunday Nov 8 puts the week Friday Nov 6 to Thursday Nov 12 on the card.
function open(api: Api = createDemoApi(), today = "2026-11-08") {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <DashboardPage today={today} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const card = () => screen.findByRole("region", { name: "This week" });
const figure = async (name: string) => within(await card()).getByRole("heading", { name }).closest("li") as HTMLElement;

describe("This week card (DSH-02)", () => {
  it("[AC-DSH-02.1] shows a This week card with the dates of the week and the four figures", async () => {
    open();
    const c = await card();
    expect(within(c).getByText("Nov 6 to Nov 12 (Friday to Thursday)")).toBeTruthy();
    for (const name of ["Miles", "Workouts", "Weight", "Money given"]) expect(within(c).getByRole("heading", { name })).toBeTruthy();
    expect(await within(await figure("Miles")).findByText("212 miles")).toBeTruthy();
    expect(within(await figure("Workouts")).getByText("1 workout")).toBeTruthy();
  });

  it("[AC-DSH-02.2] each figure says how it compares with the week before, in words", async () => {
    open();
    const workouts = await figure("Workouts");
    expect(await within(workouts).findByText("1 fewer workout than the week before")).toBeTruthy(); // 1 now, 2 the week before
    const miles = await figure("Miles");
    expect(await within(miles).findByText(/than the week before|Same as the week before/)).toBeTruthy();
    expect(within(miles).queryByText("No data")).toBeNull();
  });

  it("[AC-DSH-02.2] the weight figure says it in words, and says when there is no week before to compare with", async () => {
    open();
    const weight = await figure("Weight");
    expect(await within(weight).findByText(/^(Down|Up|Steady)/)).toBeTruthy();
    expect(within(weight).getByText("No data for the week before")).toBeTruthy();
  });

  it("[AC-DSH-02.3] a figure with nothing in the week says No data and shows no zero", async () => {
    open(); // no gift was given in the week of Nov 6 to Nov 12
    const giving = await figure("Money given");
    expect(await within(giving).findByText("No data")).toBeTruthy();
    expect(within(giving).queryByText(/\$0\.00/)).toBeNull();
    cleanup();
    open(createDemoApi(), "2026-12-20"); // a week with no readings, workouts, weights or gifts at all
    const c = await card();
    expect(await within(await figure("Workouts")).findByText("No data")).toBeTruthy();
    expect(await within(await figure("Miles")).findByText("No data")).toBeTruthy();
    expect(within(c).getAllByText("No data")).toHaveLength(4);
    expect(within(c).queryByText(/(^|\s)0 workouts/)).toBeNull();
  });

  it("[AC-DSH-02.4] each figure links to the page that holds it", async () => {
    open();
    await card();
    for (const [name, to] of [["Miles", "/car/stats"], ["Workouts", "/health"], ["Weight", "/health/weight"], ["Money given", "/giving"]] as const) {
      expect(within(await figure(name)).getByRole("link", { name }).getAttribute("href")).toBe(to);
    }
  });

  it("[AC-DSH-02.5] makes no request of its own: each list is fetched once for the whole of Home", async () => {
    const api = createDemoApi();
    const calls: Record<string, number> = {};
    const counted = new Proxy(api, {
      get(target, key: string) {
        const value = (target as unknown as Record<string, unknown>)[key];
        return typeof value === "function" ? (...args: unknown[]) => ((calls[key] = (calls[key] ?? 0) + 1), (value as (...a: unknown[]) => unknown)(...args)) : value;
      },
    }) as Api;
    open(counted);
    await card();
    await within(await figure("Miles")).findByText("212 miles");
    for (const name of ["listWeights", "listAllReadings", "listWorkouts", "listGifts", "listSpecialContributions"]) expect(calls[name], name).toBe(1);
  });

  it("[AC-DSH-02.5] shows a loading state while the lists load, and a clear error for a figure whose list failed, leaving the others", async () => {
    const api = createDemoApi();
    const slow: Api = { ...api, listWorkouts: () => new Promise(() => {}), listGifts: () => Promise.reject(new Error("boom")) };
    open(slow);
    const workouts = await figure("Workouts");
    expect(within(workouts).getByText("Loading…")).toBeTruthy();
    expect(await within(await figure("Money given")).findByText("Could not load this.")).toBeTruthy();
    expect(await within(await figure("Miles")).findByText("212 miles")).toBeTruthy();
  });
});
