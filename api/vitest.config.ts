import { defineConfig } from "vitest/config";
import { coverageFor } from "../coverage.config.mjs";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], exclude: ["src/**/*.int.test.ts"], coverage: coverageFor("api") },
});
