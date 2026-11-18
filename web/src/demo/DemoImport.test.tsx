import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoApp } from "./DemoApp";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const step = () => within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step")?.textContent;

describe("demo mileage import walkthrough", () => {
  it("[AC-DEM-02.1] offers a built-in sample file on the demo import screen", async () => {
    render(<DemoApp />);
    expect(await screen.findByRole("button", { name: "Use the sample file" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Import history", level: 2 })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("[AC-DEM-02.2] walks through upload, preview and done using the sample", async () => {
    render(<DemoApp />);
    expect(step()).toBe("1. Upload");

    await userEvent.click(await screen.findByRole("button", { name: "Use the sample file" }));
    expect(await screen.findByText(/10 readings found/)).toBeTruthy();
    expect(step()).toBe("2. Preview");
    expect(document.querySelectorAll("tr[data-flagged]")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Import 10 readings" }));
    expect(await screen.findByText("Imported 10 readings. 0 were already saved and skipped.")).toBeTruthy();
    expect(step()).toBe("3. Done");
  });

  it("[AC-DEM-02.2] can be started over, and importing the sample twice adds nothing the second time", async () => {
    render(<DemoApp />);
    await userEvent.click(await screen.findByRole("button", { name: "Use the sample file" }));
    await userEvent.click(await screen.findByRole("button", { name: "Import 10 readings" }));
    await screen.findByText(/Imported 10 readings/);
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(step()).toBe("1. Upload");
    await userEvent.click(screen.getByRole("button", { name: "Use the sample file" }));
    await userEvent.click(await screen.findByRole("button", { name: "Import 10 readings" }));
    expect(await screen.findByText("Imported 0 readings. 10 were already saved and skipped.")).toBeTruthy();
  });

  it("[AC-DEM-02.3] sends nothing to a server during the whole walkthrough", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("the demo must not use the network")));
    vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    render(<DemoApp />);
    await userEvent.click(await screen.findByRole("button", { name: "Use the sample file" }));
    await userEvent.click(await screen.findByRole("button", { name: "Import 10 readings" }));
    await screen.findByText(/Imported 10 readings/);
    await waitFor(() => expect(screen.getByText(/Demo data status: ok/)).toBeTruthy());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
