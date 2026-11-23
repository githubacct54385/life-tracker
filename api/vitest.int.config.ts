import { defineConfig } from "vitest/config";
import { coverageFor } from "../coverage.config.mjs";

export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["src/db/globalSetup.int.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    coverage: coverageFor("api-int"),
  },
});
