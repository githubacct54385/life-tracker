import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { HealthPage } from "./HealthPage";

afterEach(cleanup);

// Synthetic data only. The demo has three workouts: Nov 3 Strength (45 min), Nov 5 Run (32 min, Apple Watch) and Nov 6 Yoga (40 min).
function open(api: Api = createDemoApi(), today = "2026-11-09") {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <HealthPage today={today} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}

describe("Health screen", () => {
  it("[AC-HLT-04.1] lists the workout history newest first, with each workout's source", async () => {
    open();
    const history = await screen.findByRole("region", { name: "History" });
    const rows = within(history).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["Nov 6Yoga, 40 minManual", "Nov 5Run, 32 minApple Watch", "Nov 3Strength, 45 minManual"]);
  });

  it("[AC-HLT-04.1] lists workouts on the same day with the one saved last first", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 6, 9, 0) });
    await api.logWorkout({ type: "Walk", minutes: 20 });
    open(api);
    const history = await screen.findByRole("region", { name: "History" });
    expect(within(history).getAllByRole("listitem").map((li) => li.textContent?.slice(0, 7))).toEqual(["Nov 6Wa", "Nov 6Yo", "Nov 5Ru", "Nov 3St"]);
  });

  it("[AC-HLT-04.2] shows weekly totals of count and minutes, with weeks starting on Monday", async () => {
    open();
    const weeks = await screen.findByRole("table", { name: /per week.*Weeks start on Monday/ });
    const row = within(weeks).getByRole("row", { name: /Nov 2/ }); // Monday Nov 2 begins the week of Nov 3, 5 and 6
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["3", "1 h 57 min"]);
  });

  it("[AC-HLT-04.2] shows monthly totals of count and minutes", async () => {
    open();
    const months = await screen.findByRole("table", { name: /per month/ });
    const row = within(months).getByRole("row", { name: /November 2026/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["3", "1 h 57 min"]);
  });

  it("[AC-HLT-04.2] splits workouts across a week and a month boundary", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 9, 31, 9, 0) });
    await api.logWorkout({ type: "Hike", minutes: 60 }); // Saturday Oct 31
    open(api);
    const months = await screen.findByRole("table", { name: /per month/ });
    expect(within(within(months).getByRole("row", { name: /October 2026/ })).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "1 h"]);
    const weeks = screen.getByRole("table", { name: /per week/ });
    expect(within(weeks).getByRole("row", { name: /Oct 26/ })).toBeTruthy(); // Monday Oct 26
  });

  it("[AC-HLT-04.3] shows the streak: days in a row with at least three workouts in the last seven days", async () => {
    open(createDemoApi(), "2026-11-09");
    const streak = await screen.findByRole("region", { name: "Streak" });
    expect(within(streak).getByText("4 days")).toBeTruthy(); // Nov 6, 7, 8 and 9 each have the three workouts in their last 7 days
    expect(within(streak).getByText(/at least 3 workouts in the last 7 days/)).toBeTruthy();
  });

  it("[AC-HLT-04.3] a streak of one day is singular, and no streak says how to start one", async () => {
    open(createDemoApi(), "2026-11-06");
    expect(within(await screen.findByRole("region", { name: "Streak" })).getByText("1 day")).toBeTruthy();
    cleanup();
    open(createDemoApi(), "2026-11-18");
    const streak = await screen.findByRole("region", { name: "Streak" });
    expect(within(streak).getByText("No streak yet")).toBeTruthy();
    expect(within(streak).getByText("3 workouts in any 7 days starts a streak.")).toBeTruthy();
  });

  it("[AC-HLT-04.1] says what to do next when there are no workouts", async () => {
    const api = createDemoApi();
    for (const w of (await api.listWorkouts()).workouts) await api.deleteWorkout(w.id);
    open(api);
    expect(await screen.findByText(/No workouts yet\. Log a workout/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Streak" })).toBeNull();
  });

  it("[AC-HLT-04.1] shows a message when the history cannot be loaded, and keeps the links", async () => {
    const api = createDemoApi();
    api.listWorkouts = async () => {
      throw new Error("down");
    };
    open(api);
    expect((await screen.findByRole("alert")).textContent).toContain("did not work");
    expect(screen.getByRole("link", { name: "Weight" }).getAttribute("href")).toBe("/health/weight");
    expect(screen.getByRole("link", { name: "Workouts" }).getAttribute("href")).toBe("/health/workouts");
  });
});

describe("Health screen with pushups", () => {
  it("[AC-HLT-02.4] shows pushups in the history and adds a Pushups column to the weekly and monthly totals", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 9, 9, 0) });
    await api.logWorkout({ type: "Pushups", reps: 40 });
    await api.logWorkout({ type: "Pushups", reps: 25 });
    open(api);
    const history = await screen.findByRole("region", { name: "History" });
    expect(within(history).getByText("Pushups, 25 pushups")).toBeTruthy();
    const weeks = screen.getByRole("table", { name: /per week/ });
    expect(within(weeks).getByRole("columnheader", { name: "Pushups" })).toBeTruthy();
    expect(within(weeks).getByText("65")).toBeTruthy();
  });

  it("[AC-HLT-02.4] without any pushups the totals tables have no Pushups column", async () => {
    open();
    await screen.findByRole("region", { name: "History" });
    expect(screen.queryByRole("columnheader", { name: "Pushups" })).toBeNull();
  });
});
