import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoApp, isDemoPath } from "./DemoApp";

describe("demo mode", () => {
  it("[AC-DEM-01.1] shows the Demo, fake data ribbon", () => {
    expect(renderToString(<DemoApp />)).toContain("Demo, fake data");
  });

  it("[AC-DEM-01.1] only /demo and paths under it are demo paths", () => {
    expect(isDemoPath("/demo")).toBe(true);
    expect(isDemoPath("/demo/health")).toBe(true);
    expect(isDemoPath("/")).toBe(false);
    expect(isDemoPath("/demonstration")).toBe(false);
    expect(isDemoPath("/api/demo")).toBe(false);
  });
});
