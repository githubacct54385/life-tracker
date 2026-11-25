import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildInfo } from "../version";
import { EnvironmentStrip } from "./EnvironmentStrip";

afterEach(cleanup);

describe("environment strip (OPS-11)", () => {
  it("[AC-OPS-11.9] staging shows a Staging label with the tag and commit", () => {
    render(<EnvironmentStrip info={buildInfo({ VITE_APP_ENV: "staging", VITE_RELEASE_TAG: "v2026.11.25.1", VITE_COMMIT: "1543dbb9" })} />);
    expect(screen.getByRole("complementary", { name: "Environment" }).textContent).toBe("Staging · v2026.11.25.1 · 1543dbb");
  });

  it("[AC-OPS-11.9] a local build shows a Local label", () => {
    render(<EnvironmentStrip info={buildInfo({})} />);
    expect(screen.getByRole("complementary", { name: "Environment" }).textContent).toContain("Local");
  });

  it("[AC-OPS-11.9] production shows no label at all", () => {
    const { container } = render(<EnvironmentStrip info={buildInfo({ VITE_APP_ENV: "production", VITE_RELEASE_TAG: "v2026.11.25.1", VITE_COMMIT: "1543dbb" })} />);
    expect(container.innerHTML).toBe("");
  });
});
