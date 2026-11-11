import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { LogWorkoutPage } from "./LogWorkoutPage";
import { formatMinutes, parseMinutes } from "./workoutFormat";

afterEach(cleanup);

function open() {
  const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <LogWorkoutPage />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const minutesField = () => screen.getByLabelText("Duration (minutes)");

describe("Workouts screen", () => {
  it("[AC-HLT-02.1] asks for type, duration and an optional note, and never for a date or time", async () => {
    open();
    await screen.findByText("Nov 6");
    expect(screen.getByLabelText("Type")).toBeTruthy();
    expect(minutesField()).toBeTruthy();
    expect(screen.getByLabelText("Note (optional)")).toBeTruthy();
    expect(screen.queryByLabelText(/date|time/i)).toBeNull();
    expect(document.querySelector('input[type="date"], input[type="datetime-local"], input[type="time"]')).toBeNull();
  });

  it("[AC-HLT-02.1][AC-HLT-02.3] saves a workout dated now, shown as Manual, and clears the form", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "Swim");
    await userEvent.type(minutesField(), "25");
    await userEvent.type(screen.getByLabelText("Note (optional)"), "pool");
    await userEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved Swim, 25 min.");
    const row = (await screen.findByText("Nov 13")).closest("li")!;
    expect(row.textContent).toContain("Swim, 25 min");
    expect(row.textContent).toContain("Manual");
    expect(row.textContent).toContain("pool");
    expect((minutesField() as HTMLInputElement).value).toBe("");
  });

  it("[AC-HLT-02.1] cannot save without a valid duration", async () => {
    open();
    await screen.findByText("Nov 6");
    const save = screen.getByRole("button", { name: "Save workout" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.type(minutesField(), "0");
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/whole minutes/)).toBeTruthy();
  });

  it("[AC-HLT-02.3] shows the source of each workout: Manual or Apple Watch", async () => {
    open();
    const watch = (await screen.findByText("Nov 5")).closest("li")!;
    expect(watch.textContent).toContain("Apple Watch");
    expect((await screen.findByText("Nov 6")).closest("li")!.textContent).toContain("Manual");
  });

  it("[AC-HLT-02.2] edits type, duration and note and keeps the date", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Run on Nov 5" }));
    expect(screen.getByText("The date stays Nov 5.")).toBeTruthy();
    const minutes = screen.getByLabelText("Duration (minutes)", { selector: "#edit-2-minutes" });
    await userEvent.clear(minutes);
    await userEvent.type(minutes, "50");
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    const row = (await screen.findByText("Run, 50 min")).closest("li")!;
    expect(row.textContent).toContain("Nov 5");
    expect(row.textContent).toContain("Apple Watch");
  });

  it("[AC-HLT-02.2] deleting asks first, and 'Keep it' deletes nothing", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Delete Yoga on Nov 6" }));
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Keep it" }));
    expect(screen.getByText("Yoga, 40 min")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Delete Yoga on Nov 6" }));
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Yes, delete" }));
    await screen.findByText("Strength, 45 min");
    expect(screen.queryByText("Yoga, 40 min")).toBeNull();
  });
});

describe("workout formatting", () => {
  it("[AC-HLT-02.1] parses whole minutes from 1 to 1,440 only", () => {
    expect(parseMinutes("30")).toBe(30);
    expect(parseMinutes(" 1440 ")).toBe(1440);
    for (const bad of ["", "0", "1441", "12.5", "-5", "abc"]) expect(parseMinutes(bad)).toBeUndefined();
  });

  it("[AC-HLT-02.1] shows long durations as hours and minutes", () => {
    expect([formatMinutes(30), formatMinutes(60), formatMinutes(95)]).toEqual(["30 min", "1 h", "1 h 35 min"]);
  });
});
