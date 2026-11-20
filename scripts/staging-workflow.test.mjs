import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github/workflows");
const readRaw = (file) => readFileSync(path.join(workflowsDir, file), "utf8");
const stagingRaw = readRaw("staging.yml");
const staging = parse(stagingRaw);
const release = parse(readRaw("release.yml"));
const job = staging.jobs.staging;
const steps = job.steps;
const stepNamed = (fragment) => steps.find((step) => (step.name ?? "").includes(fragment));
const secretsIn = (value) => [...JSON.stringify(value).matchAll(/secrets\.([A-Z_]+)/g)].map((match) => match[1]);

// Lines of a workflow that run a command, without the comments, so words in an explanation do not count.
const commandLines = (workflow) =>
  Object.values(workflow.jobs)
    .flatMap((j) => j.steps ?? [])
    .flatMap((step) => String(step.run ?? "").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);

describe("staging workflow (OPS-08, ADR-0025)", () => {
  it("[AC-OPS-08.3][AC-OPS-08.6] runs after CI on main, or by hand, and nothing else starts it", () => {
    expect(Object.keys(staging.on).sort()).toEqual(["workflow_dispatch", "workflow_run"]);
    expect(staging.on.workflow_run.workflows).toEqual(["CI"]);
    expect(staging.on.workflow_run.types).toEqual(["completed"]);
    expect(staging.on.workflow_run.branches).toEqual(["main"]);
    expect(staging.on.workflow_dispatch.inputs.ref.required).toBe(true);
  });

  it("[AC-OPS-08.3] an automatic run needs a passing CI run for a push, so pull request and weekly runs never deploy", () => {
    expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(job.if).toContain("github.event.workflow_run.event == 'push'");
  });

  it("[AC-OPS-08.4][AC-OPS-08.7] the job uses the staging environment and never names production", () => {
    expect(job.environment).toBe("staging");
    // The parsed workflow, so that words in the comments (which explain the boundary) do not count.
    expect(JSON.stringify(staging).toLowerCase()).not.toMatch(/production|environment":"prod/);
  });

  it("[AC-OPS-08.4] every wrangler command deploys with --env staging and --keep-vars, and nothing else deploys", () => {
    const wrangler = commandLines(staging).filter((line) => /wrangler/.test(line));
    expect(wrangler).toHaveLength(1);
    expect(wrangler[0]).toMatch(/wrangler deploy --env staging --keep-vars$/);
    expect(JSON.stringify(staging)).not.toMatch(/wrangler-action/);
  });

  it("[AC-OPS-08.3] runs the migrations before the deploy, and the smoke test last of the three", () => {
    const names = steps.map((step) => step.name ?? "");
    const migrate = names.findIndex((name) => name.includes("migrations"));
    const deploy = names.findIndex((name) => name.includes("Deploy the staging Worker"));
    const smoke = names.findIndex((name) => name === "Smoke test");
    expect(migrate).toBeGreaterThan(-1);
    expect(migrate).toBeLessThan(deploy);
    expect(deploy).toBeLessThan(smoke);
  });

  it("[AC-OPS-08.5] the result is recorded as the staging-smoke status, even when a step failed", () => {
    const record = stepNamed("Record the result");
    expect(record.if).toBe("always()");
    expect(record.run).toContain("context=staging-smoke");
    expect(stepNamed("Mark the commit").run).toContain("state=pending");
    expect(staging.permissions).toEqual({ contents: "read", statuses: "write" });
  });

  it("[AC-OPS-08.6] a manual run must start from main, where the staging environment releases its secrets", () => {
    expect(steps[0].run).toContain("refs/heads/main");
  });

  it("[AC-OPS-08.7] secrets are read only inside the steps that need them, and only the five staging ones are used", () => {
    const outsideJobs = { ...staging };
    delete outsideJobs.jobs;
    expect(JSON.stringify(outsideJobs)).not.toContain("secrets.");
    expect(JSON.stringify({ ...job, steps: undefined })).not.toContain("secrets.");
    expect(new Set(secretsIn(steps))).toEqual(new Set(["DATABASE_ADMIN_URL", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "SMOKE_CLIENT_ID", "SMOKE_CLIENT_SECRET"]));
    expect(secretsIn(stepNamed("Smoke test"))).toEqual(["SMOKE_CLIENT_ID", "SMOKE_CLIENT_SECRET"]);
    expect(secretsIn(stepNamed("Deploy the staging Worker")).sort()).toEqual(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
    expect(secretsIn(stepNamed("migrations"))).toEqual(["DATABASE_ADMIN_URL"]);
  });

  it("[AC-OPS-08.7] the staging address is a variable, not a value in the file", () => {
    expect(stepNamed("Smoke test").env.STAGING_URL).toBe("${{ vars.STAGING_URL }}");
    expect(JSON.stringify(staging)).not.toMatch(/workers\.dev/);
  });

  it("[AC-OPS-08.4] the Release deploys production only: no staging environment, no --env, no staging secrets", () => {
    expect(release.jobs.release.environment).toBe("production");
    const wrangler = commandLines(release).filter((line) => /wrangler/.test(line));
    expect(wrangler).toHaveLength(1);
    expect(wrangler[0]).toMatch(/wrangler deploy --keep-vars$/);
    expect(wrangler[0]).not.toContain("--env");
    expect(readRaw("release.yml")).not.toMatch(/SMOKE_CLIENT|STAGING_URL|environment:\s*staging/);
  });

  it("[AC-OPS-08.4] no workflow other than the Release and the staging workflow can deploy a Worker or read the deploy secrets", () => {
    for (const file of readdirSync(workflowsDir).filter((name) => !["release.yml", "staging.yml"].includes(name))) {
      const body = readRaw(file);
      expect(body, file).not.toMatch(/CLOUDFLARE_API_TOKEN|DATABASE_ADMIN_URL/);
      expect(body.replace(/wrangler deploy --dry-run/g, ""), file).not.toMatch(/wrangler(-action)?\b.*\bdeploy|wrangler deploy/);
    }
  });
});
