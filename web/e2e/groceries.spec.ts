import { expect, test } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// GRO-01: the grocery list in a real browser at every width. The API edge is faked with a synthetic list, because this server has no
// database. Behaviour is proven in unit and integration tests, and against the real stack in e2e/stack/groceries.spec.ts.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const item = (n: number, name: string, section: string, found = false) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name, quantity: "", note: "", section, found });

test(
  "[AC-GRO-01.7] the grocery list has no sideways scroll at 360, 768 and 1280 px, and every tap target is at least 44 px",
  { tag: "@AC-GRO-01.7" },
  async ({ page, context }) => {
    const long = { ...item(5, "An unusually long grocery item name that wraps on a narrow phone", "Other"), note: "and a note that is long enough to wrap as well on a very narrow screen" };
    const items = [item(1, "Bananas", "Produce"), item(2, "Milk", "Dairy and eggs"), item(3, "Rice", "Pantry", true), long];
    await page.route("**/api/groceries", (route) => route.fulfill({ json: { items } }));
    await signInAs(context, OWNER);
    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto("/groceries");
      await expect(page.getByRole("region", { name: "Produce" })).toContainText("Bananas");
      await expect(page.getByRole("region", { name: "Found" })).toContainText("Rice");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const small: string[] = [];
      for (const control of await page.locator("main button, main input, main select, main summary").all()) {
        if (!(await control.isVisible())) continue;
        const box = (await control.boundingBox())!;
        if (box.height < 43.5) small.push(`${await control.evaluate((el) => el.outerHTML.slice(0, 80))} is ${box.height}px tall`);
      }
      expect(small).toEqual([]);
    }
  },
);
