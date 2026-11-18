import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "./api/ApiContext";
import type { Api } from "./api/types";
import { createDemoApi } from "./demo/demoApi";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { ImportMileagePage } from "./pages/car/ImportMileagePage";
import { LogOdometerPage } from "./pages/car/LogOdometerPage";
import { MileageStatsPage } from "./pages/car/MileageStatsPage";
import { GivingPage } from "./pages/giving/GivingPage";
import { LogGiftPage } from "./pages/giving/LogGiftPage";
import { SpecialContributionsPage } from "./pages/giving/SpecialContributionsPage";
import { HealthPage } from "./pages/health/HealthPage";
import { LogWeightPage } from "./pages/health/LogWeightPage";
import { LogWorkoutPage } from "./pages/health/LogWorkoutPage";

afterEach(cleanup);

/** A demo API with everything deleted, so every list and chart is empty (AC-SET-02.5). */
async function emptyApi(): Promise<Api> {
  const api = createDemoApi();
  for (const r of (await api.listAllReadings()).readings) await api.deleteReading(r.id);
  for (const g of (await api.listGifts()).gifts) await api.deleteGift(g.id);
  for (const c of (await api.listSpecialContributions()).contributions) await api.deleteSpecialContribution(c.id);
  for (const w of (await api.listWeights()).entries) await api.deleteWeight(w.id);
  for (const w of (await api.listWorkouts()).workouts) await api.deleteWorkout(w.id);
  return api;
}

async function show(ui: ReactElement) {
  render(
    <MemoryRouter>
      <ApiProvider api={await emptyApi()}>{ui}</ApiProvider>
    </MemoryRouter>,
  );
}

// Each message must tell the owner what to do, so it names an action ("Log", "Enter", "Save", "Add", "Fill in", "Choose").
const NEXT_STEP = /\b(Log|Enter|Save|Add|Fill in|Choose)\b/;

describe("empty states say what to do next", () => {
  const cases: [string, ReactElement, RegExp][] = [
    ["Car > Log odometer list", <LogOdometerPage />, /No readings yet\./],
    ["Car > Mileage stats", <MileageStatsPage />, /Stats appear once you have two weekly readings/],
    ["Giving > Log a gift list", <LogGiftPage />, /No gifts yet\./],
    ["Giving > Special contributions list", <SpecialContributionsPage />, /No special contributions yet\./],
    ["Giving home", <GivingPage today="2026-11-18" />, /No giving recorded yet\./],
    ["Health > Weight chart", <LogWeightPage />, /No weights yet\. Enter today/],
    ["Health > Weight entries", <LogWeightPage />, /No weights yet\. Enter today.s weight above/],
    ["Health > Workouts list", <LogWorkoutPage />, /No workouts yet\. Choose/],
    ["Health home", <HealthPage today="2026-11-18" />, /No workouts yet\. Log a workout/],
    ["Dashboard weight", <DashboardPage today="2026-11-18" />, /No weights yet\. Add today/],
    ["Dashboard miles", <DashboardPage today="2026-11-18" />, /Needs two weekly readings\. Log your odometer/],
  ];

  it.each(cases)("[AC-SET-02.5] %s", async (_name, ui, message) => {
    await show(ui);
    const found = await screen.findAllByText(message);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.textContent).toMatch(NEXT_STEP);
  });

  it("[AC-SET-02.5] the import screen says what to do when a file has no readings", async () => {
    await show(<ImportMileagePage />);
    const file = new File(["Date,Start Miles\n"], "empty.csv", { type: "text/csv" });
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText("Spreadsheet file"), file);
    expect((await screen.findByRole("alert")).textContent).toMatch(/No readings were found in that file/);
  });

  it("[AC-SET-02.5] a screen with data shows no empty-state message", async () => {
    render(
      <MemoryRouter>
        <ApiProvider api={createDemoApi()}>
          <LogGiftPage />
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findByText("October 2026");
    expect(screen.queryByText(/No gifts yet/)).toBeNull();
  });
});
