import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OWNER, signInAs } from "./signIn";

// SET-02: automated accessibility checks on every main screen. The API edge is faked with synthetic data, so the lists, rows and
// charts are on screen. Behaviour is proven in unit tests; these check what only a real browser can (contrast as rendered, focus, size).
const SCREENS = ["/", "/giving", "/giving/log", "/giving/special", "/health", "/health/weight", "/health/workouts", "/car", "/car/log", "/car/stats", "/car/import", "/settings"];

async function mockApi(page: Page) {
  const now = new Date();
  const day = (back: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const month = (back: number) => day(back * 30).slice(0, 7);
  await page.route("**/api/gifts/special", (r) => r.fulfill({ json: { contributions: [{ id: 1, dateGiven: day(40), occasion: "Building fund appeal", cents: 25_000, method: "check" }] } }));
  await page.route("**/api/gifts", (r) =>
    r.fulfill({
      json: {
        gifts: [
          { id: 3, dateGiven: day(2), forMonth: month(0), cents: 15_000, method: "card", description: "Monthly tithe" },
          { id: 2, dateGiven: day(32), forMonth: month(1), cents: 15_000, method: "check", description: null },
          { id: 1, dateGiven: day(62), forMonth: month(2), cents: 5_000, method: "card", description: "Mission trip" },
        ],
      },
    }),
  );
  await page.route("**/api/weight", (r) => r.fulfill({ json: { entries: [172.4, 172.9, 173.1, 172.2, 171.8].map((pounds, i) => ({ id: 5 - i, date: day(i), pounds })) } }));
  await page.route(/\/api\/odometer(\?.*)?$/, (r) => r.fulfill({ json: { readings: [0, 1, 2, 3, 4].map((i) => ({ id: 5 - i, date: day(i * 7), miles: 48_400 - i * 210 })) } }));
  await page.route("**/api/workouts", (r) =>
    r.fulfill({ json: { workouts: [{ id: 2, date: day(0), type: "Run", minutes: 32, note: "Easy pace", source: "manual" }, { id: 1, date: day(2), type: "Yoga", minutes: 40, note: null, source: "apple_watch" }] } }),
  );
}

test.beforeEach(async ({ page, context }) => {
  await mockApi(page);
  await signInAs(context, OWNER);
});

for (const scheme of ["light", "dark"] as const) {
  test(`[AC-SET-02.1][AC-SET-02.4] axe finds no WCAG A or AA problems on any main screen in the ${scheme} theme`, { tag: ["@AC-SET-02.1", "@AC-SET-02.4"] }, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 800 });
    const problems: string[] = [];
    for (const path of SCREENS) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of result.violations) problems.push(`${path}: ${v.id} (${v.nodes.length}): ${v.nodes[0]?.html.slice(0, 100)}`);
    }
    expect(problems).toEqual([]);
  });
}

test("[AC-SET-02.2] every control on every screen can be reached with the keyboard alone, and shows where focus is", { tag: "@AC-SET-02.2" }, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const problems: string[] = [];
  for (const path of SCREENS) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Number the visible controls, then press Tab and note which one holds focus each time.
    const total = await page.evaluate(() => {
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && !(el as HTMLInputElement).disabled;
      };
      // A group of radio buttons is one tab stop (arrow keys move inside it), so only its checked button, or the first, counts.
      const stops = (el: Element) => {
        if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name) return true;
        const group = [...document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${el.name}"]`)];
        return el === (group.find((r) => r.checked) ?? group[0]);
      };
      const found = [...document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(visible).filter(stops);
      found.forEach((el, i) => el.setAttribute("data-kb", String(i)));
      return found.length;
    });
    const reached = new Set<string>();
    // Tab inside a date field moves between its day, month and year parts, so a control counts as ringed if it showed a ring when it first got focus.
    const ring = new Map<string, { ringed: boolean; text: string }>();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let i = 0; i < total + 6; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return { id: el.getAttribute("data-kb"), ringed: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0, label: `${el.tagName.toLowerCase()}${(el as HTMLInputElement).type ? `[${(el as HTMLInputElement).type}]` : ""} ${(el.textContent || el.getAttribute("aria-label") || el.id).trim().slice(0, 30)}`, fv: el.matches(":focus-visible"), outline: `${s.outlineStyle} ${s.outlineWidth}` };
      });
      if (!info?.id) continue;
      if (!reached.has(info.id)) ring.set(info.id, { ringed: info.ringed, text: `${path}: "${info.label}" has no focus ring (${info.outline}, focus-visible ${info.fv})` });
      reached.add(info.id);
    }
    if (reached.size < total) problems.push(`${path}: reached ${reached.size} of ${total} controls`);
    problems.push(...[...ring.values()].filter((r) => !r.ringed).map((r) => r.text));
  }
  expect(problems).toEqual([]);
});

test("[AC-SET-02.3] every control on every screen is at least 44 px tall and wide on a phone", { tag: "@AC-SET-02.3" }, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const problems: string[] = [];
  for (const path of [...SCREENS, "/more"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const controls = document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="radio"]');
      for (const el of controls) {
        // A radio button or checkbox is operated through its label, so the label is the target.
        const isToggle = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox");
        const target = isToggle ? (el.closest("label") ?? el) : el;
        const r = target.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
        // A link inside a sentence is part of the text, not a separate target.
        if (el instanceof HTMLAnchorElement && el.closest("p, li")?.textContent !== el.textContent && getComputedStyle(el).display === "inline") continue;
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.push(`"${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    problems.push(...small.map((s) => `${path}: ${s}`));
  }
  expect(problems).toEqual([]);
});
