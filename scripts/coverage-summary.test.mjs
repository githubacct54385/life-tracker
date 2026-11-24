import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { readCoverage, renderTable } from "./coverage-summary-lib.mjs";
import { coverageFor } from "../coverage.config.mjs";
import { coverageBadge, renderBadgeSvg, renderHealthReport } from "./badges-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const settings = JSON.parse(read("coverage.config.json"));
const ci = parse(read(".github/workflows/ci.yml"));
const steps = ci.jobs.test.steps;
const step = (pattern) => steps.find((s) => pattern.test(s.name ?? ""));

function sampleReports() {
  const dir = mkdtempSync(path.join(tmpdir(), "coverage-"));
  const put = (pkg, name, lines, branches) => {
    mkdirSync(path.join(dir, pkg, "coverage", name), { recursive: true });
    writeFileSync(path.join(dir, pkg, "coverage", name, "coverage-summary.json"), JSON.stringify({ total: { lines: { pct: lines, covered: lines, total: 100 }, branches: { pct: branches } } }));
  };
  put("shared", "shared", 99.5, 95);
  put("web", "web", 90, 80.25);
  return dir;
}

describe("coverage (OPS-09)", () => {
  it("[AC-OPS-09.1] every package collects line and branch coverage with the V8 provider, and CI prints the summary in the job log", () => {
    for (const name of ["shared", "api", "api-int", "web"]) {
      const config = coverageFor(name);
      expect(config.provider).toBe("v8");
      expect(config.thresholds).toEqual({ lines: settings.thresholds[name].lines, branches: settings.thresholds[name].branches });
      expect(config.reporter).toContain("text-summary");
      expect(config.reporter).toContain("json-summary");
    }
    expect(step(/Unit tests/).run).toContain("pnpm coverage:unit");
    expect(step(/Integration tests/).run).toContain("pnpm coverage:int");
    expect(step(/Coverage summary/).run).toMatch(/node scripts\/coverage-summary\.mjs \$baseline\n/);
  });

  it("[AC-OPS-09.2] CI saves the full report as an artifact and puts a table with the change against main in the job summary", () => {
    expect(step(/Save the coverage report/).uses).toMatch(/^actions\/upload-artifact@/);
    expect(step(/Save the coverage report/).with.path).toContain("web/coverage");
    expect(step(/Save the coverage numbers/).with.name).toBe("coverage-summary");
    const summary = step(/Coverage summary/);
    expect(summary.run).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(summary.run).toContain("gh run download");
    expect(ci.permissions.actions).toBe("read");
    const table = renderTable({ shared: { lines: 99.5, branches: 95 }, web: { lines: 91, branches: 79 } }, { shared: { lines: 99.5, branches: 94 }, web: { lines: 90, branches: 80.25 } }, settings.thresholds);
    expect(table).toContain("| shared | 99.50% | no change | 95.00% | +1.00 |");
    expect(table).toContain("| web | 91.00% | +1.00 | 79.00% | -1.25 |");
  });

  it("[AC-OPS-09.2] with nothing from main to compare with the table says n/a, and a missing report is left out, not shown as 0", () => {
    const current = readCoverage(sampleReports());
    expect(Object.keys(current)).toEqual(["shared", "web"]);
    expect(current.web).toEqual({ lines: 90, branches: 80.25, linesCovered: 90, linesTotal: 100 });
    expect(renderTable(current)).toContain("| shared | 99.50% | n/a | 95.00% | n/a |");
  });

  it("[AC-OPS-09.3] the minimums are in one config file, for every package, and CI fails below them because vitest enforces them", () => {
    expect(Object.keys(settings.thresholds).sort()).toEqual(["api", "api-int", "shared", "web"]);
    for (const { lines, branches } of Object.values(settings.thresholds)) {
      expect(Number.isInteger(lines) && Number.isInteger(branches)).toBe(true); // rounded down to a whole number
      expect(lines).toBeLessThanOrEqual(100);
    }
    expect(() => coverageFor("nope")).toThrow(/No coverage thresholds/);
    expect(read("web/vite.config.ts")).toContain('coverageFor("web")');
    expect(read("api/vitest.int.config.ts")).toContain('coverageFor("api-int")');
  });

  it("[AC-OPS-09.4] every excluded file pattern has a reason, and the exclusions reach the coverage settings", () => {
    expect(settings.exclude.length).toBeGreaterThan(0);
    for (const entry of settings.exclude) {
      expect(entry.pattern).toBeTruthy();
      expect(entry.reason.length).toBeGreaterThan(10);
    }
    expect(coverageFor("web").exclude).toContain("**/*.test.{ts,tsx}");
    expect(coverageFor("web").exclude).toContain("src/main.tsx");
  });

  it("[AC-OPS-09.6] end-to-end tests are left out of the numbers, and TESTING.md says so", () => {
    expect(read("TESTING.md")).toMatch(/End-to-end tests are not part of the coverage numbers/);
    expect(JSON.stringify(steps.filter((s) => /End-to-end/.test(s.name ?? "")).map((s) => s.run))).not.toContain("coverage");
  });

  it("[AC-OPS-09.5] the coverage badge is one number built from the unit-test lines, and CI publishes it to the badges release from main only", () => {
    const sets = { shared: { linesCovered: 90, linesTotal: 100 }, api: { linesCovered: 50, linesTotal: 100 }, web: { linesCovered: 160, linesTotal: 200 }, "api-int": { linesCovered: 1, linesTotal: 1 } };
    expect(coverageBadge(sets)).toEqual({ schemaVersion: 1, label: "coverage", message: "75%", color: "yellow" });
    expect(coverageBadge({ shared: { linesCovered: 99, linesTotal: 100 } }).color).toBe("brightgreen");
    expect(() => coverageBadge({})).toThrow(/No coverage numbers/);
    const svg = renderBadgeSvg(coverageBadge(sets));
    expect(svg).toContain('aria-label="coverage: 75%"');
    expect(svg).toContain("#dfb317"); // yellow
    expect(renderBadgeSvg({ label: "a<b", message: '"x"&', color: "red" })).toContain("a&lt;b");
    const job = ci.jobs.badges;
    expect(job.if).toContain("refs/heads/main");
    expect(job.permissions.contents).toBe("write");
    expect(ci.permissions.contents).toBe("read"); // every other job stays read-only
    expect(job.steps.map((s) => s.run ?? "").join("\n")).toContain("gh release upload badges badges/coverage.svg badges/lighthouse.svg --clobber");
  });

  it("[AC-OPS-09.5] the Project health page says in plain words what coverage is, shows each part with its lowest allowed value, and CI publishes it as the release notes", () => {
    const coverage = { shared: { lines: 99.5, branches: 95, linesCovered: 99, linesTotal: 100 }, web: { lines: 90, branches: 80, linesCovered: 90, linesTotal: 100 } };
    const lighthouse = { pages: [{ name: "Demo", scores: { performance: 97, accessibility: 100, "best-practices": 100, seo: 82 }, javaScriptKB: 285.4 }] };
    const page = renderHealthReport({ coverage, lighthouse, minimums: settings.thresholds, budgetKB: 290, details: { commit: "abcdef1234", date: "2026-11-24", runUrl: "https://example.test/run/1", repoUrl: "https://example.test/repo" } });
    expect(page).toContain("## Test coverage: 95% of the code is run by the tests");
    expect(page).toContain("Coverage is the share of the program's lines that the automated tests run");
    expect(page).toContain("| Shared rules (used by the app and the server) | 99.5% | 95.0% | 99% / 95% |");
    expect(page).toContain("## Lighthouse: performance 97, accessibility 100");
    expect(page).toContain("| Demo | 97 | 100 | 100 | 82 | 285.4 KB | 290 KB |");
    expect(page).toContain("`abcdef1`");
    expect(page).toContain("(https://example.test/repo/blob/main/docs/what-the-browser-tests-check.md)");
    expect(page).toContain("[the CI run](https://example.test/run/1)");
    expect(steps.length).toBeGreaterThan(0);
    expect(JSON.stringify(ci.jobs.badges.steps)).toContain("gh release edit badges");
    expect(JSON.stringify(ci.jobs.badges.steps)).toContain("--notes-file badges/report.md");
  });
});
