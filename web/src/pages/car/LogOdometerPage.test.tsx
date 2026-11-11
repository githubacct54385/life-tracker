import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "../../api/ApiContext";
import { createDemoApi } from "../../demo/demoApi";
import { LogOdometerPage } from "./LogOdometerPage";
import { parseMiles, shortDate } from "./readingFormat";

afterEach(cleanup);

function open() {
  const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) }); // seeded: newest reading is 48,402 on Nov 6
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <LogOdometerPage />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}
const field = () => screen.getByLabelText("Odometer reading");

describe("Log odometer screen", () => {
  it("[AC-MIL-01.1] focuses the reading field and has no date or time field", async () => {
    open();
    await screen.findByText("Nov 6");
    expect(document.activeElement).toBe(field());
    expect(screen.queryByLabelText(/date|time/i)).toBeNull();
    expect(document.querySelector('input[type="date"], input[type="datetime-local"], input[type="time"]')).toBeNull();
  });

  it("[AC-MIL-01.1] saves a normal reading in one step, dated now, clears the field and keeps focus there", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.type(field(), "48,500");
    await userEvent.click(screen.getByRole("button", { name: "Save reading" }));
    expect((await screen.findByRole("status")).textContent).toContain("Saved 48,500 mi.");
    expect(await screen.findByText("Nov 13")).toBeTruthy();
    expect((field() as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(field());
  });

  it("[AC-MIL-01.2] a lower reading shows a warning and is saved only after confirming", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.type(field(), "48000");
    await userEvent.click(screen.getByRole("button", { name: "Save reading" }));
    const warning = await screen.findByRole("alert");
    expect(warning.textContent).toContain("Lower than your last reading");
    expect(warning.textContent).toContain("48,402 on Nov 6");
    expect(screen.queryByText("Nov 13")).toBeNull();
    await userEvent.click(within(warning).getByRole("button", { name: "Yes, save" }));
    expect(await screen.findByText("Nov 13")).toBeTruthy();
  });

  it("[AC-MIL-01.2] 'Change it' saves nothing and returns to the field", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.type(field(), "48000");
    await userEvent.click(screen.getByRole("button", { name: "Save reading" }));
    await userEvent.click(await screen.findByRole("button", { name: "Change it" }));
    expect(screen.queryByText("Nov 13")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("[AC-MIL-01.3] an implausibly high jump asks for confirmation", async () => {
    open();
    await screen.findByText("Nov 6");
    await userEvent.type(field(), "60000");
    await userEvent.click(screen.getByRole("button", { name: "Save reading" }));
    expect((await screen.findByRole("alert")).textContent).toContain("That is a big jump");
  });

  it("[AC-MIL-01.4] editing changes the value and keeps the date", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit reading from Oct 30" }));
    expect(screen.getByText("The date stays Oct 30.")).toBeTruthy();
    const input = screen.getByLabelText("New odometer reading");
    await userEvent.clear(input);
    await userEvent.type(input, "48200");
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(screen.getByText("48,200 mi")).toBeTruthy());
    expect(screen.getByText("Oct 30")).toBeTruthy();
  });

  it("[AC-MIL-01.2][AC-MIL-01.4] editing to a value that breaks the order needs confirmation", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit reading from Oct 30" }));
    const input = screen.getByLabelText("New odometer reading");
    await userEvent.clear(input);
    await userEvent.type(input, "47000");
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Lower than your last reading");
  });

  it("[AC-MIL-01.4] deleting asks first, then removes the reading for good", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Delete reading from Oct 30" }));
    expect(screen.getByRole("alert").textContent).toContain("removed for good");
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByText("Oct 30")).toBeNull());
  });

  it("[AC-MIL-01.4] does not allow an empty or non-numeric reading to be saved", async () => {
    open();
    await screen.findByText("Nov 6");
    const save = screen.getByRole("button", { name: "Save reading" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(field(), "12abc");
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("reading formatting", () => {
  it("[AC-MIL-01.4] parses typed miles and formats dates as text", () => {
    expect(parseMiles("48,402")).toBe(48_402);
    expect(parseMiles(" 7 ")).toBe(7);
    expect(parseMiles("")).toBeUndefined();
    expect(parseMiles("1.5")).toBeUndefined();
    expect(parseMiles("10000000")).toBeUndefined();
    expect(shortDate("2026-01-05")).toBe("Jan 5");
  });
});
