import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { checkPage, installabilityProblems, median, renderSummary, summarize } from "./lighthouse-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const config = JSON.parse(read("lighthouse.config.json"));
const steps = parse(read(".github/workflows/ci.yml")).jobs.test.steps;
const step = (pattern) => steps.find((s) => pattern.test(s.name ?? ""));

const good = { html: '<link rel="manifest" href="/m.json">', files: new Set(["/a.png", "/b.png", "/c.png"]), serviceWorker: 'self.addEventListener("fetch", () => {});', manifest: { name: "X", start_url: "/", display: "standalone", icons: [{ src: "/a.png", sizes: "192x192" }, { src: "/b.png", sizes: "512x512" }, { src: "/c.png", sizes: "512x512", purpose: "maskable" }] } };
const scores = (accessibility) => ({ performance: 90, accessibility, "best-practices": 100, seo: 80 });

describe("Lighthouse check (OPS-10)", () => {
  it("[AC-OPS-10.1] runs on the demo page on the phone profile, and CI saves the reports as an artifact", () => {
    expect(config.pages.map((p) => p.path)).toContain("/demo");
    expect(read("scripts/lighthouse.mjs")).not.toMatch(/preset:\s*["']desktop|formFactor:\s*["']desktop/); // Lighthouse's default is the phone profile
    expect(step(/Save the Lighthouse reports/).uses).toMatch(/^actions\/upload-artifact@/);
    expect(step(/Save the Lighthouse reports/).with.path).toBe("lighthouse-reports");
  });

  it("[AC-OPS-10.2] fails when the accessibility score is under the minimum, and passes at or above it", () => {
    expect(config.minimumScores.accessibility).toBe(95);
    expect(checkPage("Demo", { scores: scores(94), javaScriptKB: 100 }, config)).toEqual(["Demo: accessibility score is 94, under the minimum of 95."]);
    expect(checkPage("Demo", { scores: scores(95), javaScriptKB: 100 }, config)).toEqual([]);
  });

  it("[AC-OPS-10.2] reports each reason the app could not be installed", () => {
    expect(installabilityProblems(good)).toEqual([]);
    expect(installabilityProblems({ ...good, html: "<html></html>" })).toContain("The page does not link a web app manifest.");
    expect(installabilityProblems({ ...good, manifest: { ...good.manifest, display: "browser" } })[0]).toMatch(/not an installable mode/);
    expect(installabilityProblems({ ...good, manifest: { ...good.manifest, icons: [good.manifest.icons[0]] } })).toEqual(["The manifest has no 512x512 icon.", "The manifest has no maskable icon."]);
    expect(installabilityProblems({ ...good, files: new Set() })).toHaveLength(3);
    expect(installabilityProblems({ ...good, serviceWorker: "// nothing" })).toEqual(["The service worker has no fetch handler."]);
    expect(installabilityProblems({ ...good, serviceWorker: undefined })).toEqual(["There is no service worker file."]);
    expect(installabilityProblems({ ...good, manifest: undefined })).toContain("The manifest could not be read.");
  });

  it("[AC-OPS-10.3] the JavaScript budget is in one config file, and going over it fails with the numbers", () => {
    expect(config.budgets.firstScreenJavaScriptKB).toBeGreaterThan(0);
    expect(checkPage("Demo", { scores: scores(100), javaScriptKB: 300 }, { ...config, budgets: { firstScreenJavaScriptKB: 290 } })).toEqual([
      "Demo: the first screen loads 300 KB of JavaScript, over the budget of 290 KB (by 10 KB).",
    ]);
    expect(checkPage("Demo", { scores: scores(100), javaScriptKB: 290 }, { ...config, budgets: { firstScreenJavaScriptKB: 290 } })).toEqual([]);
  });

  it("[AC-OPS-10.4] writes the scores, the budget and the result as Markdown for the job summary", () => {
    const summary = summarize([{ scores: scores(100), javaScriptKB: 285.4 }]);
    const text = renderSummary([{ name: "Demo", summary }], config, [], []);
    expect(text).toContain("| Demo | 90 | 100 | 100 | 80 | 285.4 KB |");
    expect(text).toContain("**Result:** pass.");
    expect(renderSummary([{ name: "Demo", summary }], config, ["No icon."], ["Demo: failed."])).toContain("**Installable:** no.");
    expect(step(/^Lighthouse/).run).toContain('--markdown "$GITHUB_STEP_SUMMARY"');
  });

  it("[AC-OPS-10.5] takes the median of the runs, and the script runs the whole set once more before a failure counts", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(() => median([])).toThrow();
    const summary = summarize([{ scores: scores(90), javaScriptKB: 10 }, { scores: scores(100), javaScriptKB: 30 }, { scores: scores(96), javaScriptKB: 20 }]);
    expect(summary.scores.accessibility).toBe(96);
    expect(summary.javaScriptKB).toBe(20);
    expect(config.runs).toBe(3);
    expect(read("scripts/lighthouse.mjs")).toMatch(/for \(let attempt = 1; attempt <= 2; attempt \+= 1\)/);
  });

  it("[AC-OPS-10.6] the step runs only when a pull request changes web/ or the check itself, and is stopped after six minutes", () => {
    expect(step(/Did this pull request change web/).run).toContain("grep -Eq '^(web/|");
    expect(step(/Did this pull request change web/).run).toContain("lighthouse\\.config\\.json"); // changing the check itself runs it
    expect(step(/^Lighthouse/).if).toContain("steps.web.outputs.changed == 'true'");
    expect(step(/^Lighthouse/)["timeout-minutes"]).toBe(6);
  });
});
