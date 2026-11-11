import { expect, test, type Page } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// Layout tests are the only ones that run the full width matrix (AGENTS.md, Viewports).
const WIDTHS = [
  { name: "mobile", width: 360, height: 740, nav: "tabs" },
  { name: "tablet", width: 768, height: 1024, nav: "rail" },
  { name: "desktop", width: 1280, height: 800, nav: "sidebar" },
] as const;

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

for (const vp of WIDTHS) {
  for (const scheme of ["light", "dark"] as const) {
    test(
      `[AC-FND-04.1][AC-FND-04.2][AC-FND-04.3][AC-FND-04.4][AC-FND-04.5] ${vp.name} ${vp.width}px, ${scheme} theme: right navigation, no sideways scroll`,
      { tag: ["@AC-FND-04.4", "@AC-FND-04.5"] },
      async ({ page, context }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: scheme });
        await signInAs(context, OWNER);
        await page.goto("/");

        const nav = page.getByRole("navigation", { name: "Main" });
        await expect(nav).toHaveAttribute("data-nav", vp.nav);
        await expect(nav.getByRole("link")).toHaveText(
          vp.nav === "sidebar" ? ["Home", "Giving", "Health", "Car", "Settings"] : ["Home", "Giving", "Health", "Car", "More"],
        );
        expect(await noHorizontalScroll(page)).toBe(true);

        // Navigation sits where the wireframes put it.
        const box = (await nav.boundingBox())!;
        if (vp.nav === "tabs") {
          expect(box.y + box.height).toBeGreaterThan(vp.height - 2);
          expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
        } else {
          expect(box.x).toBe(0);
          expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);
        }

        // Text stays readable on the page background in both themes.
        const colours = await page.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          ink: getComputedStyle(document.querySelector("h1")!).color,
        }));
        expect(colours.bg).not.toBe(colours.ink);
        const luminance = (rgb: string) => (rgb.match(/\d+/g) ?? []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
        if (scheme === "dark") expect(luminance(colours.bg)).toBeLessThan(luminance(colours.ink));
        else expect(luminance(colours.bg)).toBeGreaterThan(luminance(colours.ink));

        // Every destination fits without sideways scroll.
        for (const label of ["Giving", "Health", "Car", vp.nav === "sidebar" ? "Settings" : "More"]) {
          await nav.getByRole("link", { name: label }).click();
          await expect(page.getByRole("heading", { name: label })).toBeVisible();
          expect(await noHorizontalScroll(page)).toBe(true);
        }
      },
    );
  }
}

test("[AC-FND-04.1] on a phone, Settings is reached through More", { tag: "@AC-FND-04.1" }, async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signInAs(context, OWNER);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "More" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
