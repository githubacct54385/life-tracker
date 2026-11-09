import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["src/db/globalSetup.int.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
