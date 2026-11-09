import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

test("[AC-FND-01.2] built site loads in a browser", { tag: "@AC-FND-01.2" }, async ({ page, context }) => {
  await signInAs(context, OWNER);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Life Tracker" })).toBeVisible();
});
