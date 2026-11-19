// Support for the full-stack browser specs in e2e/stack/ (OPS-04): the real Worker, the real API and a real Postgres.
// Nothing in these specs fakes an API answer. Each test starts from empty tables, and fails if the API answers with a 5xx
// or the page logs a console error, so a broken Worker or database cannot pass quietly.
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { OWNER, signInAs } from "../signIn";
import { resetDatabase } from "./resetDatabase.mjs";

const adminUrl = process.env.E2E_ADMIN_DATABASE_URL;

export const test = base.extend<{ stack: { page: Page; context: BrowserContext } }>({
  stack: [
    async ({ page, context }, use, testInfo) => {
      // Locally the real database is optional; in CI the setup step fails first if it is missing (prepareDatabase.mjs).
      test.skip(!adminUrl, "Set E2E_ADMIN_DATABASE_URL to run the full-stack browser tests (see TESTING.md).");
      await resetDatabase(adminUrl!);
      const problems: string[] = [];
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 500) problems.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
      });
      page.on("console", (message) => {
        // The browser logs "Failed to load resource" for any non-2xx answer, including the 409s the app asks for on purpose
        // ("please confirm"). Server failures are caught above by their status, so only other console errors count here.
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) problems.push(`console error: ${message.text().slice(0, 160)}`);
      });
      page.on("pageerror", (error) => problems.push(`page error: ${error.message.slice(0, 160)}`));
      await signInAs(context, OWNER);
      await use({ page, context });
      if (testInfo.status === "passed") expect(problems, "the API or the page reported a problem").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
