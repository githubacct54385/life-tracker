import { defineConfig } from "@playwright/test";

// The built site is served by the Static Web Apps CLI, so the edge rules in staticwebapp.config.json
// and its sign-in emulator are in the loop (ADR-0006).
export default defineConfig({
  testDir: "e2e",
  webServer: {
    command: "pnpm build && pnpm exec swa start dist --port 4280",
    url: "http://localhost:4280/access-denied.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:4280" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
