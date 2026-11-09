import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("web workspace", () => {
  it("[AC-FND-01.2] unit tests run in CI for the web package", () => {
    expect(renderToString(<App />)).toContain("Life Tracker");
  });
});
