import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { LogWorkoutPage } from "./LogWorkoutPage";
import { formatMinutes, formatReps, parseMinutes, parseReps } from "./workoutFormat";

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

describe("Pushups (counted, not timed)", () => {
  it("[AC-HLT-02.4] choosing Pushups asks how many instead of a duration, and choosing another type brings the duration back", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "Pushups");
    expect(screen.getByLabelText("How many pushups?")).toBeTruthy();
    expect(screen.queryByLabelText("Duration (minutes)")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Type"), "Run");
    expect(minutesField()).toBeTruthy();
    expect(screen.queryByLabelText("How many pushups?")).toBeNull();
  });

  it("[AC-HLT-02.4] saves a count, says so, and shows it in the list", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "Pushups");
    const save = screen.getByRole("button", { name: "Save workout" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("How many pushups?"), "40");
    await userEvent.click(save);
    expect((await screen.findByRole("status")).textContent).toContain("Saved Pushups, 40 pushups.");
    const recent = screen.getByRole("region", { name: "Recent workouts" });
    expect(await within(recent).findByText("Pushups, 40 pushups")).toBeTruthy();
  });

  it("[AC-HLT-02.4] a count that is not a whole number from 1 to 10,000 cannot be saved", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "Pushups");
    for (const bad of ["0", "2.5", "10001", "abc"]) {
      const field = screen.getByLabelText("How many pushups?");
      await userEvent.clear(field);
      await userEvent.type(field, bad);
      expect((screen.getByRole("button", { name: "Save workout" }) as HTMLButtonElement).disabled, bad).toBe(true);
      expect(screen.getByText("Enter a whole number, from 1 to 10,000.")).toBeTruthy();
    }
  });

  it("[AC-HLT-02.4] edits the count of a saved pushups workout", async () => {
    const api = open();
    await api.logWorkout({ type: "Pushups", reps: 30 });
    cleanup();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <LogWorkoutPage />
        </ApiProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /^Edit Pushups on/ }));
    const field = screen.getByLabelText("How many pushups?") as HTMLInputElement;
    expect(field.value).toBe("30");
    await userEvent.clear(field);
    await userEvent.type(field, "55");
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    expect(await screen.findByText("Pushups, 55 pushups")).toBeTruthy();
  });

  it("[AC-HLT-02.4] counts read as words: one pushup, many pushups, and reps for a type with no name of its own", () => {
    expect(formatReps(1, "Pushups")).toBe("1 pushup");
    expect(formatReps(1200, "Pushups")).toBe("1,200 pushups");
    expect(formatReps(5, "Situps")).toBe("5 reps");
    expect(parseReps("1,200")).toBe(1200);
    expect([parseReps("0"), parseReps("10001"), parseReps("1.5"), parseReps("")]).toEqual([undefined, undefined, undefined, undefined]);
  });
});
