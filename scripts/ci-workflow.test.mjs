import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Checks the text of the CI workflow. It passes or fails on the settings in ci.yml, not on how GitHub's runners
// behave: the retry and fallback behavior itself is only proven by a real CI run (see the OPS-03 pull request).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ci = parse(readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"));
const job = ci.jobs.test;
const steps = job.steps;
const find = (pattern) => steps.find((step) => pattern.test(step.run ?? ""));
const download = find(/playwright install chromium/);
const launch = steps.find((step) => step.id === "launch");
const libraries = find(/playwright install-deps chromium/);
const e2e = find(/test:e2e/);
const index = (step) => steps.indexOf(step);

describe("CI browser install", () => {
  it("[AC-OPS-03.1][AC-OPS-03.5] each browser install step stops after 5 minutes at most, and the test job after 30", () => {
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
    for (const step of [download, launch, libraries]) {
      expect(step, "install step exists").toBeDefined();
      expect(step["timeout-minutes"]).toBeLessThanOrEqual(5);
    }
  });

  it("[AC-OPS-03.2][AC-OPS-03.5] the browser download is its own step and does not run apt (no --with-deps)", () => {
    expect(download.run).not.toContain("--with-deps");
    expect(steps.some((step) => /--with-deps/.test(step.run ?? ""))).toBe(false);
    expect(index(download)).toBeLessThan(index(libraries));
  });

  it("[AC-OPS-03.6][AC-OPS-03.5] a short step tries to start the browser, between the download and the libraries, and its failure does not fail the job", () => {
    expect(launch, "launch check exists").toBeDefined();
    expect(launch.run).toMatch(/chromium\.launch\(\)/);
    expect(launch["continue-on-error"]).toBe(true);
    expect(index(download)).toBeLessThan(index(launch));
    expect(index(launch)).toBeLessThan(index(libraries));
  });

  it("[AC-OPS-03.3][AC-OPS-03.6][AC-OPS-03.5] the libraries install runs only if the browser could not start, retries twice, is hard-killed after 60 s each, and cannot fail the job", () => {
    expect(libraries["if"]).toMatch(/steps\.launch\.outcome == 'failure'/);
    expect(libraries["continue-on-error"]).toBe(true);
    expect(libraries.run).toMatch(/for attempt in 1 2;/);
    expect(libraries.run).toMatch(/timeout -k \d+ \d+ pnpm/);
    const seconds = Number(/timeout -k \d+ (\d+) pnpm/.exec(libraries.run)[1]);
    expect(2 * (seconds + 10 + 5)).toBeLessThan(libraries["timeout-minutes"] * 60); // both attempts fit inside the step limit
  });

  it("[AC-OPS-03.4][AC-OPS-03.5] the end-to-end tests still run after the installs, so missing libraries fail there", () => {
    expect(e2e).toBeDefined();
    expect(index(e2e)).toBeGreaterThan(index(libraries));
    expect(e2e["continue-on-error"]).toBeUndefined();
  });
});
