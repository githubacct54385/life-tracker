import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { loadPreferences } from "./preferences";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(cleanup);

describe("settings", () => {
  it("[AC-SET-01.1] sign out goes to the Cloudflare Access logout endpoint on the same host", () => {
    render(<SettingsPage />);
    const link = screen.getByRole("link", { name: "Sign out" });
    expect(link.getAttribute("href")).toBe("/cdn-cgi/access/logout");
  });

  it("[AC-SET-01.1] settings never calls the API, so it works in demo mode", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("[AC-SET-01.3] the theme switch offers light, dark and system, and applies the choice", async () => {
    render(<SettingsPage />);
    const radios = screen.getAllByRole("radio").map((r) => r.textContent);
    expect(radios).toEqual(["Light", "Dark", "System"]);
    expect(screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    await userEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("[AC-SET-01.3] the chosen theme is remembered on the next visit", async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    cleanup();
    render(<SettingsPage />);
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
  });

  it("[AC-SET-01.4] the time zone and weight unit can be set and are remembered", async () => {
    render(<SettingsPage />);
    expect((screen.getByLabelText("Weight unit") as HTMLSelectElement).value).toBe("lb");
    await userEvent.selectOptions(screen.getByLabelText("Weight unit"), "kg");
    await userEvent.selectOptions(screen.getByLabelText("Time zone"), "Europe/London");
    expect(loadPreferences()).toMatchObject({ weightUnit: "kg", timeZone: "Europe/London" });
    cleanup();
    render(<SettingsPage />);
    expect((screen.getByLabelText("Weight unit") as HTMLSelectElement).value).toBe("kg");
    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("Europe/London");
  });
});
