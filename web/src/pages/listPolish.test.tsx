import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../api/ApiContext";
import { createDemoApi } from "../demo/demoApi";
import { LogOdometerPage } from "./car/LogOdometerPage";
import { GivingPage } from "./giving/GivingPage";
import { HealthPage } from "./health/HealthPage";
import { Button } from "../ui/Button";

afterEach(cleanup);

function open(ui: React.ReactElement, api = createDemoApi({ now: () => new Date(2026, 10, 18, 9, 0) })) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>{ui}</ApiProvider>
    </MemoryRouter>,
  );
  return api;
}

describe("Giving history", () => {
  it("[AC-SET-02.11] months before the first recorded gift show a quiet dash, not a bold $0.00, and months with gifts keep their amounts", async () => {
    open(<GivingPage today="2026-11-18" />);
    const monthsSection = await screen.findByRole("region", { name: "Regular giving by month" });
    const early = within(monthsSection).getByRole("listitem", { name: "January 2026" });
    expect(within(early).getByLabelText("No record")).toBeTruthy();
    expect(within(early).queryByText("$0.00")).toBeNull();
    const november = within(monthsSection).getByRole("listitem", { name: "November 2026" });
    expect(within(november).getAllByText(/\$/).length).toBeGreaterThan(0);
  });
});

describe("Health totals", () => {
  it("[AC-SET-02.11] a week with only pushups shows a dash for time, not 0 min", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 30, 9, 0) });
    await api.logWorkout({ type: "Pushups", reps: 40 });
    open(<HealthPage today="2026-11-30" />, api);
    const tables = await screen.findAllByRole("table");
    expect(within(tables[0]!).getAllByLabelText("No timed workouts").length).toBeGreaterThan(0);
    expect(within(tables[0]!).queryByText("0 min")).toBeNull();
  });
});

describe("Odometer list", () => {
  it("[AC-SET-02.11] shows the miles since the previous reading, and the last reading near the field", async () => {
    open(<LogOdometerPage today="2026-11-13" />);
    await screen.findByText("Nov 6");
    // The demo has weekly readings; the newest two, 48,190 (Oct 30) and 48,402 (Nov 6), are 212 miles apart.
    expect(screen.getAllByText("+212 mi").length).toBeGreaterThan(0);
    expect(screen.getByText("Last reading: 48,402 mi on Nov 6.")).toBeTruthy();
    expect(screen.getByText(/Saved with today/)).toBeTruthy();
  });
});

describe("Buttons that cannot be used yet", () => {
  it("[AC-SET-02.11] turn clearly grey, while a working button keeps its colour", () => {
    const { rerender } = render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button").className).toContain("disabled:bg-sunk");
    rerender(<Button busy>Save</Button>);
    expect(screen.getByRole("button").className).not.toContain("disabled:bg-sunk");
    expect(screen.getByRole("button").className).toContain("bg-g700");
  });
});
