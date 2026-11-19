import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// OPS-05: the screenshots are taken and attached by GitHub Actions, with the built-in token. These check the workflow's text.
// That it really works is proven by its own run on the pull request that added it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const workflow = parse(read(".github/workflows/pr-screenshots.yml"));
const job = workflow.jobs.screenshots;

describe("pr-screenshots workflow", () => {
  it("[AC-OPS-05.2] runs when a pull request is opened, updated or reopened, and not when it is only edited", () => {
    expect(workflow.on.pull_request.types.sort()).toEqual(["opened", "reopened", "synchronize"]);
  });

  it("[AC-OPS-05.2] uses only the built-in token, with the two permissions it needs and no secret", () => {
    expect(workflow.permissions).toEqual({ contents: "write", "pull-requests": "write" });
    const text = read(".github/workflows/pr-screenshots.yml");
    expect(text).not.toMatch(/secrets\./);
    expect(job.env.GH_TOKEN).toBe("${{ github.token }}");
  });

  it("[AC-OPS-05.2] builds, installs the browser, and runs the script for this pull request, reading its screens from the description", () => {
    const run = job.steps.map((s) => s.run ?? "").join("\n");
    expect(run).toContain("pnpm install --frozen-lockfile");
    expect(run).toContain("playwright install chromium");
    expect(run).toContain("pnpm pr-screenshots --pr ${{ github.event.pull_request.number }} --from-body");
  });

  it("[AC-OPS-05.3] skips pull requests from forks, and does nothing without a Screens line", () => {
    expect(job.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    const gated = job.steps.filter((s) => s.if?.includes("steps.screens.outputs.named == 'true'"));
    expect(gated.length).toBeGreaterThanOrEqual(5); // everything after the check is skipped when no screens are named
    expect(job.steps.find((s) => s.id === "screens").run).toContain("Screens:");
  });

  it("[AC-OPS-05.2] runs one at a time per pull request, so a newer push replaces an older run", () => {
    expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
    expect(workflow.concurrency.group).toContain("github.event.pull_request.number");
  });
});

describe("pr-screenshots script", () => {
  const script = read("scripts/pr-screenshots.mjs");

  it("[AC-OPS-05.4] never uses GraphQL: no gh repo view, pr view or pr edit, only the REST API", () => {
    expect(script).not.toMatch(/"repo", "view"/);
    expect(script).not.toMatch(/"pr", "(view|edit)"/);
    expect(script).toContain('"api"');
    expect(script).toContain('"--method", "PATCH"');
  });

  it("[AC-OPS-05.4] names the failing GitHub step, says pnpm's ELIFECYCLE line is only an echo, and keeps the images", () => {
    expect(script).toContain("async function step(name, fn)");
    expect(script).toContain("failed:");
    expect(script).toContain("ELIFECYCLE");
    expect(script).toContain("are kept in");
  });

  it("[AC-OPS-05.4] can take its screens from the pull request description", () => {
    expect(script).toContain("--from-body");
    expect(script).toContain("parseScreensLine");
  });
});

describe("docs and cleanup", () => {
  it("[AC-OPS-05.5] AGENTS.md and the pull request template describe the Screens line and the workflow", () => {
    expect(read("AGENTS.md")).toContain("Screens:");
    expect(read("AGENTS.md")).toContain("pr-screenshots.yml");
    expect(read(".github/pull_request_template.md")).toContain("Screens:");
  });

  it("[AC-OPS-05.5] ADR-0019 is amended, and images keep the pr-<number>- prefix the cleanup workflow deletes by", () => {
    expect(read("DECISIONS.md")).toMatch(/ADR-0019[\s\S]*Amended by OPS-05/);
    expect(read(".github/workflows/pr-screenshots-cleanup.yml")).toContain("^pr-${PR_NUMBER}-");
    expect(read("scripts/pr-screenshots-lib.mjs")).toContain("`pr-${pr}-");
  });
});
