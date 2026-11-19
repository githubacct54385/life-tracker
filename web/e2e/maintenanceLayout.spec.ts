import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// MIL-06: the maintenance page's layout in a real browser. The API edge is faked with synthetic data (the end-to-end server here has no
// database). Behaviour is proven in unit tests; this checks what only a real browser can: the panel's place on screen, scrolling and axe.
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const joes = { id: 1, name: "Joe's Garage" };
const acme = { id: 2, name: "Acme Tire" };
const RECORDS = [
  { id: 3, date: "2026-11-12", services: ["Rotate tires", "Multi-point inspection"], doneBy: "shop", place: acme, costCents: 3900, odometerMiles: 48_402, note: null },
  { id: 2, date: "2026-11-03", services: ["Oil change", "Air filter"], doneBy: "shop", place: joes, costCents: 8999, odometerMiles: 48_150, note: "A long synthetic note that should wrap rather than push the page wider than the screen" },
  { id: 1, date: "2026-10-12", services: ["Wipers"], doneBy: "home", place: null, costCents: 1800, odometerMiles: null, note: null },
];

async function mock(page: Page) {
  await page.route("**/api/maintenance/places", (r) => r.fulfill({ json: { places: [joes, acme] } }));
  await page.route("**/api/maintenance/documents", (r) => r.fulfill({ json: { documents: [] } }));
  await page.route("**/api/maintenance", (r) => r.fulfill({ json: { records: RECORDS } }));
  await page.route(/\/api\/odometer(\?.*)?$/, (r) => r.fulfill({ json: { readings: [{ id: 2, date: "2026-11-06", miles: 48_402 }] } }));
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.beforeEach(async ({ page, context }) => {
  await mock(page);
  await signInAs(context, OWNER);
});

test("[AC-MIL-06.7][AC-MIL-06.8] every view fits at 360, 768 and 1280 px with nothing scrolling sideways", { tag: "@AC-MIL-06.7" }, async ({ page }) => {
  for (const { width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.goto("/car/maintenance");
    await expect(page.getByRole("heading", { name: /^November 2026/ })).toBeVisible();
    expect(await overflow(page), `${width}px by date`).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "By place" }).click();
    await page.getByRole("button", { name: /^Joe's Garage/ }).click();
    expect(await overflow(page), `${width}px by place`).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "By service" }).click();
    await page.getByRole("button", { name: /^Oil change/ }).click();
    expect(await overflow(page), `${width}px by service`).toBeLessThanOrEqual(0);
  }
});

test("[AC-MIL-06.9] the form is a sheet from the bottom on a phone and a panel on the right on a computer, and scrolls inside itself", { tag: "@AC-MIL-06.9" }, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/car/maintenance");
  await page.getByRole("button", { name: "Log a service" }).click();
  const phone = (await page.getByRole("dialog").boundingBox())!;
  expect(phone.width).toBeCloseTo(360, 0);
  expect(phone.y + phone.height).toBeCloseTo(740, 0); // sits on the bottom edge
  expect(phone.y).toBeGreaterThan(0); // leaves a strip of the page showing above it
  await page.getByRole("button", { name: "Save service" }).scrollIntoViewIfNeeded(); // the sheet scrolls, so the end of the form is reachable
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/car/maintenance");
  await page.getByRole("button", { name: "Log a service" }).click();
  const desk = (await page.getByRole("dialog").boundingBox())!;
  expect(desk.x + desk.width).toBeCloseTo(1280, 0); // against the right edge
  expect(desk.width).toBeLessThan(560);
  expect(desk.height).toBeCloseTo(800, 0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`[AC-MIL-06.7][AC-MIL-06.9] axe finds no WCAG problems on the history in each view or on the open panel, in the ${scheme} theme`, { tag: "@AC-MIL-06.7" }, async ({ page }) => {
    // No reduced-motion transitions, so a button is not scanned halfway through changing colour.
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/car/maintenance");
    await expect(page.getByRole("heading", { name: /^November 2026/ })).toBeVisible();
    const problems: string[] = [];
    const scan = async (where: string) => {
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of result.violations) problems.push(`${where}: ${v.id} (${v.nodes.length}): ${v.nodes[0]?.html.slice(0, 100)}`);
    };
    await scan("by date");
    await page.getByRole("button", { name: /^Last done/ }).click();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await scan("strip and filters open");
    await page.getByRole("button", { name: "By place" }).click();
    await page.getByRole("button", { name: /^Joe's Garage/ }).click();
    await scan("by place");
    await page.getByRole("button", { name: "By service" }).click();
    await scan("by service");
    await page.getByRole("button", { name: "Log a service" }).click();
    await scan("panel");
    expect(problems).toEqual([]);
  });
}

test("[AC-SET-02.3][AC-MIL-06.9] every control in the history and in the open panel is at least 44 px tall and wide on a phone", { tag: "@AC-SET-02.3" }, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/car/maintenance");
  await expect(page.getByRole("heading", { name: /^November 2026/ })).toBeVisible();
  const measure = () =>
    page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, summary')) {
        const isToggle = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox");
        const target = isToggle ? (el.closest("label") ?? el) : el;
        const r = target.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
        if (r.width < 43.5 || r.height < 43.5) out.push(`"${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
  await page.getByRole("button", { name: /^Filters/ }).click();
  const small = await measure();
  await page.getByRole("button", { name: "Log a service" }).click();
  small.push(...(await measure()));
  expect(small).toEqual([]);
});

test("[AC-MIL-07.18][AC-MIL-08.9] the list of several chosen files fits a phone, passes axe in both themes, and every control in it is at least 44 px", { tag: "@AC-MIL-07.18" }, async ({ page }) => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const PDF = Buffer.from("%PDF-1.4\n% synthetic test document\n");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/car/maintenance");
  await page.getByLabel(/Add photos or PDFs to Oil change, Air filter/).first().setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: PNG },
    { name: "b.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "c.pdf", mimeType: "application/pdf", buffer: PDF },
  ]);
  await expect(page.getByText(/Ready to add: 3 files/)).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() => {
    const out: string[] = [];
    const panel = [...document.querySelectorAll<HTMLElement>("div")].find((d) => d.textContent?.startsWith("Ready to add"))!;
    for (const el of panel.querySelectorAll<HTMLElement>("button, input")) {
      const target = el instanceof HTMLInputElement && el.type === "checkbox" ? (el.closest("label") ?? el) : el;
      const r = target.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`"${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small).toEqual([]);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${scheme}: ${v.id}: ${v.nodes[0]?.html.slice(0, 90)}`)).toEqual([]);
  }
});
