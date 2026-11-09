import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  webServer: {
    command: "pnpm build && pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:4173" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
