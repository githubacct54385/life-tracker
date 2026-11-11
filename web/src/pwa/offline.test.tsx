import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe("offline state", () => {
  it("[AC-FND-05.3] shows an offline message instead of the page, and returns when online", () => {
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    render(<MemoryRouter initialEntries={["/car"]}><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Car" })).toBeTruthy();
    act(() => setOnline(false));
    expect(screen.getByRole("alert").textContent).toContain("You're offline");
    expect(screen.queryByRole("heading", { name: "Car" })).toBeNull();
    act(() => setOnline(true));
    expect(screen.getByRole("heading", { name: "Car" })).toBeTruthy();
  });
});
