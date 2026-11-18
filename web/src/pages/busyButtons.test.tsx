import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../api/ApiContext";
import { createDemoApi } from "../demo/demoApi";
import { LogOdometerPage } from "./car/LogOdometerPage";
import { LogWeightPage } from "./health/LogWeightPage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const now = () => new Date(2026, 10, 18, 9, 0);

function gate() {
  let release!: () => void;
  const open = new Promise<void>((resolve) => (release = resolve));
  return { open, release };
}

function render_(ui: React.ReactElement, api: ReturnType<typeof createDemoApi>) {
  render(
    <MemoryRouter>
      <ApiProvider api={api}>{ui}</ApiProvider>
    </MemoryRouter>,
  );
}

describe("buttons that start a save", () => {
  it("[AC-SET-02.7] saving a reading disables the button and shows a spinner until the server answers, and a second press saves nothing more", async () => {
    const real = createDemoApi({ now });
    const g = gate();
    const logReading = vi.fn(async (...args: Parameters<typeof real.logReading>) => {
      await g.open;
      return real.logReading(...args);
    });
    render_(<LogOdometerPage />, { ...real, logReading });
    await screen.findByText("Nov 6");
    await userEvent.type(screen.getByLabelText("Odometer reading"), "48500");
    const save = screen.getByRole("button", { name: "Save reading" });
    await userEvent.click(save);
    await userEvent.click(save); // second press while the first is still running

    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(save.getAttribute("aria-busy")).toBe("true");
    expect(save.querySelector(".lt-spinner")).not.toBeNull();
    expect(logReading).toHaveBeenCalledTimes(1);

    g.release();
    await screen.findByText(/Saved 48,500 mi/);
    await waitFor(() => expect((screen.getByRole("button", { name: "Save reading" }) as HTMLButtonElement).disabled).toBe(true)); // empty field again: nothing to save
    expect(screen.getByRole("button", { name: "Save reading" }).getAttribute("aria-busy")).toBeNull();
    expect(logReading).toHaveBeenCalledTimes(1);
  });

  it("[AC-SET-02.7] a failed save brings the button back so the owner can try again", async () => {
    const real = createDemoApi({ now });
    const logReading = vi.fn().mockRejectedValueOnce(new Error("synthetic failure")).mockImplementation((...args: Parameters<typeof real.logReading>) => real.logReading(...args));
    render_(<LogOdometerPage />, { ...real, logReading });
    await screen.findByText("Nov 6");
    await userEvent.type(screen.getByLabelText("Odometer reading"), "48500");
    await userEvent.click(screen.getByRole("button", { name: "Save reading" }));
    await screen.findByText("That did not work. Try again.");
    const save = screen.getByRole("button", { name: "Save reading" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(save.getAttribute("aria-busy")).toBeNull();
    await userEvent.click(save);
    await screen.findByText(/Saved 48,500 mi/);
    expect(logReading).toHaveBeenCalledTimes(2);
  });

  it("[AC-SET-02.7] deleting a weight disables both the Yes and the Keep buttons while it works", async () => {
    const real = createDemoApi({ now });
    const g = gate();
    const deleteWeight = vi.fn(async (id: number) => {
      await g.open;
      return real.deleteWeight(id);
    });
    render_(<LogWeightPage />, { ...real, deleteWeight });
    await screen.findByText("Weight trend");
    await userEvent.click((await screen.findAllByRole("button", { name: /^Delete / }))[0]!);
    const yes = screen.getByRole("button", { name: "Yes, delete" });
    await userEvent.click(yes);
    expect((yes as HTMLButtonElement).disabled).toBe(true);
    expect(yes.getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: "Keep it" }) as HTMLButtonElement).disabled).toBe(true);
    g.release();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Yes, delete" })).toBeNull());
    expect(deleteWeight).toHaveBeenCalledTimes(1);
  });
});
