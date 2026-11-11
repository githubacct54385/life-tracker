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
const libraries = find(/playwright install-deps chromium/);
const e2e = find(/test:e2e/);
const index = (step) => steps.indexOf(step);

describe("CI browser install", () => {
  it("[AC-OPS-03.1][AC-OPS-03.5] each browser install step stops after 5 minutes at most, and the test job after 30", () => {
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
    for (const step of [download, libraries]) {
      expect(step, "install step exists").toBeDefined();
      expect(step["timeout-minutes"]).toBeLessThanOrEqual(5);
    }
  });

  it("[AC-OPS-03.2][AC-OPS-03.5] the browser download is its own step and does not run apt (no --with-deps)", () => {
    expect(download.run).not.toContain("--with-deps");
    expect(steps.some((step) => /--with-deps/.test(step.run ?? ""))).toBe(false);
    expect(index(download)).toBeLessThan(index(libraries));
  });

  it("[AC-OPS-03.3][AC-OPS-03.5] the system libraries install is a separate step that retries 3 times, each attempt time-limited, and cannot fail the job", () => {
    expect(libraries).not.toBe(download);
    expect(libraries["continue-on-error"]).toBe(true);
    expect(libraries.run).toMatch(/for attempt in 1 2 3/);
    expect(libraries.run).toMatch(/timeout \d+ pnpm/);
  });

  it("[AC-OPS-03.4][AC-OPS-03.5] the end-to-end tests still run after the installs, so missing libraries fail there", () => {
    expect(e2e).toBeDefined();
    expect(index(e2e)).toBeGreaterThan(index(libraries));
    expect(e2e["continue-on-error"]).toBeUndefined();
  });
});
