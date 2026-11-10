import { defineConfig } from "@playwright/test";
import { AUDIENCE, OWNER, TEAM_DOMAIN } from "./e2e/signIn";

// The built site is served by `wrangler dev`, the same Worker that runs in production. Cloudflare Access is
// played by a small key server (e2e/support/accessKeys.mjs) plus signed tokens the tests add as a header, so
// the owner check runs through its real code. There is no bypass setting (hard rule 9).
export default defineConfig({
  testDir: "e2e",
  webServer: [
    {
      command: "node e2e/support/accessKeys.mjs 9099 test-results/e2e-access-key.json",
      url: "http://127.0.0.1:9099/cdn-cgi/access/certs",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        `pnpm build && pnpm --filter @life-tracker/api exec wrangler dev --port 8788 ` +
        `--var ACCESS_TEAM_DOMAIN:${TEAM_DOMAIN} --var ACCESS_AUD:${AUDIENCE} --var OWNER_EMAIL:${OWNER.email}`,
      url: "http://127.0.0.1:8788/",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  use: { baseURL: "http://127.0.0.1:8788" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
