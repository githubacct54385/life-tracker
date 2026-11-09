import { describe, expect, it } from "vitest";
import { healthStatus } from "./health";

describe("api workspace", () => {
  it("[AC-FND-01.2] unit tests run in CI for the api package", () => {
    expect(healthStatus()).toEqual({ status: "ok" });
  });
});
