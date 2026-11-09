import { describe, expect, it } from "vitest";
import { APP_NAME } from "./index";

describe("shared workspace", () => {
  it("[AC-FND-01.2] unit tests run in CI for the shared package", () => {
    expect(APP_NAME).toBe("Life Tracker");
  });
});
