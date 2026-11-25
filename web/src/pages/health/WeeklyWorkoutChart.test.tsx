import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import type { Api } from "../../api/types";
import { createDemoApi } from "../../demo/demoApi";
import { HealthPage } from "./HealthPage";

afterEach(cleanup);

// Synthetic data only. The demo has three workouts: Tue Nov 3 Strength (45 min), Thu Nov 5 Run (32 min) and Fri Nov 6 Yoga (40 min).
// Today is Monday Nov 9. Weeks run Friday to Thursday, so this week (Nov 6 to Nov 12) has 1 workout and the week before (Oct 30 to Nov 5) has 2.
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

const chartSection = () => screen.findByRole("region", { name: "Weekly workouts" });

describe("weekly workout chart on the Health screen (HLT-05)", () => {
  it("[AC-HLT-05.1] shows the chart for the last 12 weeks, opening on the number of workouts, with a switch to minutes", async () => {
    open();
    const section = await chartSection();
    expect(within(section).getByRole("img", { name: /workouts in each of the last 12 weeks/ })).toBeTruthy();
    expect((within(section).getByRole("radio", { name: "Workouts" }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(section).getByRole("radio", { name: "Minutes" }));
    expect(within(section).getByRole("img", { name: /minutes in each of the last 12 weeks/ })).toBeTruthy();
    expect((within(section).getByRole("radio", { name: "Minutes" }) as HTMLInputElement).checked).toBe(true);
  });

  it("[AC-HLT-05.1][AC-HLT-05.2][AC-HLT-05.6] has a table of the weeks, newest first, with the workouts, minutes and types of each, weeks running Friday to Thursday", async () => {
    open();
    const section = await chartSection();
    const table = within(section).getByRole("table", { name: /last 12 weeks.*Friday to Thursday/ });
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toBe("Nov 6 (this week)140Yoga 1");
    expect(rows[1]).toBe("Oct 30277Run 1, Strength 1");
  });

  it("[AC-HLT-05.5] with no goal set, offers to set one and shows no goal line", async () => {
    open();
    const section = await chartSection();
    expect(within(section).getByText("No weekly goal yet. Set one below to see a line on the chart.")).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Set goal" })).toBeTruthy();
    expect(within(section).queryByText("Goal")).toBeNull();
  });

  it("[AC-HLT-05.3][AC-HLT-05.4][AC-HLT-05.6] saves a goal, then says how many workouts are left this week and shows the streak", async () => {
    const api = open();
    const section = await chartSection();
    await userEvent.type(within(section).getByLabelText("Workouts per week"), "2");
    await userEvent.click(within(section).getByRole("button", { name: "Set goal" }));
    expect(await within(section).findByText("Goal: 2 a week. This week: 1 of 2, 1 to go.")).toBeTruthy();
    // The week before had 2 workouts, so it met the goal. This week is still in progress and does not break the streak.
    expect(within(section).getByText("Streak: 1 week in a row at your goal.")).toBeTruthy();
    expect(within(section).getByText("Goal")).toBeTruthy();
    expect(await api.getWorkoutGoal()).toEqual({ perWeek: 2 });
    expect(within(section).getByRole("button", { name: "Save goal" })).toBeTruthy();
  });

  it("[AC-HLT-05.3] says the goal is met once this week has enough workouts", async () => {
    const api = createDemoApi();
    await api.saveWorkoutGoal(1);
    open(api);
    const section = await chartSection();
    expect(await within(section).findByText("Goal: 1 a week. You have met it this week.")).toBeTruthy();
  });

  it("[AC-HLT-05.6] refuses a goal that is not a whole number from 1 to 14, and sends nothing", async () => {
    const api = open();
    const save = vi.spyOn(api, "saveWorkoutGoal");
    const section = await chartSection();
    const box = within(section).getByLabelText("Workouts per week");
    for (const bad of ["0", "15", "2.5", "abc", ""]) {
      await userEvent.clear(box);
      if (bad) await userEvent.type(box, bad);
      await userEvent.click(within(section).getByRole("button", { name: "Set goal" }));
      expect((await within(section).findByRole("alert")).textContent).toBe("Enter a whole number from 1 to 14.");
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("[AC-HLT-05.6] shows a clear message when the goal cannot be saved, and keeps the old one", async () => {
    const api = createDemoApi();
    await api.saveWorkoutGoal(3);
    vi.spyOn(api, "saveWorkoutGoal").mockRejectedValue(new Error("down"));
    open(api);
    const section = await chartSection();
    const box = within(section).getByLabelText("Workouts per week");
    await userEvent.clear(box);
    await userEvent.type(box, "5");
    await userEvent.click(within(section).getByRole("button", { name: "Save goal" }));
    expect((await within(section).findByRole("alert")).textContent).toBe("That did not work. Try again.");
    expect(within(section).getByText(/Goal: 3 a week/)).toBeTruthy();
  });

  it("[AC-HLT-05.5] with no workouts in the last 12 weeks, says so and still lets the person set a goal", async () => {
    const api = { ...createDemoApi(), listWorkouts: async () => ({ workouts: [] }) } as Api;
    open(api);
    const section = await chartSection();
    expect(within(section).getByText("No workouts in the last 12 weeks. Log a workout to fill the chart.")).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Set goal" })).toBeTruthy();
    expect(within(section).queryByRole("img")).toBeNull();
  });

  it("[AC-HLT-05.2] a pushup session counts as a workout and adds no minutes", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 9, 9, 0) });
    await api.logWorkout({ type: "Pushups", reps: 40 });
    open(api);
    const section = await chartSection();
    const table = within(section).getByRole("table", { name: /last 12 weeks/ });
    const thisWeek = within(table).getAllByRole("row")[1]!.textContent;
    expect(thisWeek).toBe("Nov 6 (this week)240Pushups 1, Yoga 1");
  });

  it("[AC-HLT-05.5] a goal that cannot be read shows the page's usual error and no chart", async () => {
    const api = { ...createDemoApi(), getWorkoutGoal: async () => Promise.reject(new Error("down")) } as Api;
    open(api);
    expect((await screen.findByRole("alert")).textContent).toBe("That did not work. Try again.");
    expect(screen.queryByRole("region", { name: "Weekly workouts" })).toBeNull();
  });
});
