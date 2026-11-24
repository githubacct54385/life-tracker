import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectTests, levelOf, matchesFilter, render, runCommand, splitName, testsInText } from "./tests-list-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A few synthetic test files in a temporary folder, so these tests do not change when the real tests do.
function sampleRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "tests-list-"));
  const put = (file, text) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  put("web/src/a.test.ts", `it("[AC-GRO-01.1] adds an item", () => {});\nit("[AC-GRO-01.1][AC-GRO-01.2] adds and edits", () => {});\nit("a helper with no criterion", () => {});`);
  put("api/src/b.int.test.ts", `it('[AC-GRO-02.1] keeps the list', async () => {});`);
  put("web/e2e/c.spec.ts", "test(\n  \"[AC-MIL-03.2] draws the chart\",\n  { tag: ['@x'] },\n  async () => {},\n);");
  put("web/node_modules/skip.test.ts", `it("[AC-GRO-01.1] must not be listed", () => {});`);
  return dir;
}

describe("tests list (OPS-12)", () => {
  it("[AC-OPS-12.1] lists every test as a sentence, grouped by area, story and criterion, with its level and file", () => {
    const text = render(collectTests(sampleRepo()));
    expect(text).toContain("AREA GRO");
    expect(text).toContain("AREA MIL");
    expect(text).toMatch(/AC-GRO-01\.1\n {2}- adds an item {2}\[unit, web\/src\/a\.test\.ts\]/);
    expect(text).toContain("keeps the list  [integration, api/src/b.int.test.ts]");
    expect(text).toContain("draws the chart  [end-to-end, web/e2e/c.spec.ts]");
    expect(text).not.toContain("must not be listed");
  });

  it("[AC-OPS-12.1] a test that names two criteria is listed under each", () => {
    const text = render(collectTests(sampleRepo()));
    expect(text).toMatch(/AC-GRO-01\.2\n {2}- adds and edits/);
    expect(text.match(/adds and edits/g)).toHaveLength(2);
  });

  it("[AC-OPS-12.2] reads the test names from the code: a new test shows up with no other change, and the real repository is listed", () => {
    const dir = sampleRepo();
    writeFileSync(path.join(dir, "web/src/new.test.ts"), `it("[AC-GRO-01.3] a brand new test", () => {});`);
    expect(render(collectTests(dir))).toContain("a brand new test");
    const real = collectTests(root);
    expect(real.length).toBeGreaterThan(500);
    expect(real.some((t) => t.ids.includes("AC-OPS-12.2"))).toBe(true);
  });

  it("[AC-OPS-12.3] filters by area, story or criterion, and ignores case", () => {
    const tests = collectTests(sampleRepo());
    const names = (filter) => tests.filter((t) => matchesFilter(t, filter)).map((t) => t.text).sort();
    expect(names("GRO")).toEqual(["adds a" + "n item", "adds and edits", "keeps the list"].sort());
    expect(names("gro-01")).toEqual(["adds an item", "adds and edits"]);
    expect(names("AC-GRO-01.2")).toEqual(["adds and edits"]);
    expect(names("GRO-0")).toEqual([]); // a partial story is not a match
    expect(names("MIL")).toEqual(["draws the chart"]);
    expect(render(tests, { filter: "MIL" })).not.toContain("adds an item");
  });

  it("[AC-OPS-12.4] tests with no criterion get their own section, so gaps show instead of hiding", () => {
    const tests = collectTests(sampleRepo());
    const text = render(tests);
    expect(text).toContain("TESTS WITH NO ACCEPTANCE CRITERION (1)");
    expect(text).toMatch(/web\/src\/a\.test\.ts\n {2}- a helper with no criterion/);
    expect(tests.filter((t) => matchesFilter(t, "none")).map((t) => t.text)).toEqual(["a helper with no criterion"]);
  });

  it("[AC-OPS-12.5] can print Markdown for the CI job summary, and the CI workflow publishes it", () => {
    const text = render(collectTests(sampleRepo()), { markdown: true });
    expect(text).toContain("## Area GRO");
    expect(text).toContain("- adds an item _(unit, `web/src/a.test.ts`)_");
    expect(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8")).toContain('node scripts/tests-list.mjs --markdown >> "$GITHUB_STEP_SUMMARY"');
  });

  it("[AC-OPS-12.6] shows the command that runs just one test, for each level", () => {
    const all = collectTests(sampleRepo());
    const find = (text) => all.find((t) => t.text === text);
    expect(runCommand(find("adds an item"))).toBe("scripts/run-tests.sh unit web src/a.test.ts -t '\\[AC-GRO-01\\.1\\] adds an item'");
    expect(runCommand(find("keeps the list"))).toBe("scripts/run-tests.sh int api src/b.int.test.ts -t '\\[AC-GRO-02\\.1\\] keeps the list'");
    expect(runCommand(find("draws the chart"))).toBe("scripts/run-tests.sh e2e e2e/c.spec.ts -g '\\[AC-MIL-03\\.2\\] draws the chart'");
    expect(runCommand({ file: "scripts/x.test.mjs", level: "unit", name: "it's fine" })).toBe("pnpm exec vitest run --root scripts x.test.mjs -t 'it'\\''s fine'");
    expect(runCommand({ file: "web/src/t.test.ts", level: "unit", name: "[AC-GRO-01.4] case %s works" })).toContain("case'");
    expect(render(collectTests(sampleRepo()), { commands: true })).toContain("scripts/run-tests.sh unit web src/a.test.ts");
  });

  it("[AC-OPS-12.7] the list is generated, not committed: no list file is tracked, and AGENTS.md and TESTING.md say how to run it", () => {
    expect(JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts["tests:list"]).toBe("node scripts/tests-list.mjs");
    expect(readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("pnpm tests:list");
    expect(readFileSync(path.join(root, "TESTING.md"), "utf8")).toContain("pnpm tests:list");
  });

  it("reads names in all the usual forms, and the level from the file name", () => {
    const text = `it.each([1, 2])("[AC-GRO-01.5] case %s", () => {});\ntest.skip('x "quoted" y', () => {});\nit(\`template name\`, () => {});`;
    expect(testsInText(text, "web/src/z.test.ts").map((t) => t.text)).toEqual(["case %s", 'x "quoted" y', "template name"]);
    expect(splitName("[AC-MIL-03.2][AC-MIL-03.3] both")).toEqual({ ids: ["AC-MIL-03.2", "AC-MIL-03.3"], text: "both" });
    expect([levelOf("web/e2e/stack/x.spec.ts"), levelOf("api/src/x.int.test.ts"), levelOf("shared/src/x.test.ts")]).toEqual(["end-to-end", "integration", "unit"]);
  });

  it("[AC-OPS-12.8] the plain-English page lists exactly the criteria the browser tests cover, so it cannot drift", () => {
    const page = readFileSync(path.join(root, "docs/what-the-browser-tests-check.md"), "utf8");
    const onPage = new Set([...page.matchAll(/<!--([^>]*)-->/g)].flatMap((m) => m[1].match(/AC-[A-Z]+-\d{2}\.\d+/g) ?? []));
    const tested = new Set(collectTests(root).filter((t) => t.level === "end-to-end").flatMap((t) => t.ids));
    expect([...tested].filter((id) => !onPage.has(id)).sort(), "covered by a browser test but missing from the page: add a line").toEqual([]);
    expect([...onPage].filter((id) => !tested.has(id)).sort(), "on the page but no browser test covers it any more: remove or fix the line").toEqual([]);
    expect(page).not.toMatch(/\bAC-[A-Z]+-\d{2}\.\d+\b(?![^<]*-->)/); // IDs stay in hidden comments, so the page reads as plain English
    expect(page.split("\n").filter((line) => line.startsWith("- ")).length).toBeGreaterThan(30);
    // Each heading names the stories its lines come from, so they can be looked up in Linear.
    for (const section of page.split(/^## /m).slice(1)) {
      const [heading] = section.split("\n");
      const named = [...heading.matchAll(/\b([A-Z]{3})-(\d{2})\b/g)].map((m) => `${m[1]}-${m[2]}`).sort();
      const used = [...new Set([...section.matchAll(/AC-([A-Z]+-\d{2})\.\d+/g)].map((m) => m[1]).filter((story) => story !== "OPS-04"))].sort();
      expect(named, `the stories named in the heading "${heading}"`).toEqual(used);
    }
  });
});
