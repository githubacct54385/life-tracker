import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github/workflows");
const read = (file) => readFileSync(path.join(workflowsDir, file), "utf8");
const release = parse(read("release.yml"));
const job = release.jobs.release;
const steps = job.steps;
const indexOf = (predicate) => steps.findIndex(predicate);
const text = (step) => JSON.stringify(step);

describe("release workflow", () => {
  it("[AC-MIG-05.1][AC-FND-06.1] runs only when started by hand, and only from main", () => {
    expect(Object.keys(release.on)).toEqual(["workflow_dispatch"]);
    expect(steps[0].run).toContain("refs/heads/main");
  });

  it("[AC-MIG-05.1][AC-FND-06.1] no other workflow can deploy the Worker or read the deploy secrets", () => {
    for (const file of readdirSync(workflowsDir).filter((name) => name !== "release.yml")) {
      const body = read(file);
      expect(body, file).not.toMatch(/CLOUDFLARE_API_TOKEN|DATABASE_ADMIN_URL/);
      // A dry run (the size check) uploads nothing, so it is allowed.
      expect(body.replace(/wrangler deploy --dry-run/g, ""), file).not.toMatch(/wrangler(-action)?\b.*\bdeploy|wrangler deploy/);
    }
  });

  it("[AC-MIG-05.1][AC-FND-06.2] the job uses the production environment, which holds the owner's approval gate", () => {
    expect(job.environment).toBe("production");
  });

  it("[AC-MIG-05.1][AC-FND-06.2] production secrets are read only inside the job that uses the environment", () => {
    const { jobs, ...outsideJobs } = release;
    expect(JSON.stringify(outsideJobs)).not.toContain("secrets.");
    expect(Object.keys(jobs)).toEqual(["release"]);
    expect(JSON.stringify({ ...job, steps: undefined })).not.toContain("secrets.");
  });

  it("[AC-MIG-05.1][AC-FND-06.3] checks that CI passed on this exact commit before any secret is used", () => {
    const ci = indexOf((s) => s.run?.includes("check-runs") && s.run.includes("GITHUB_SHA"));
    expect(ci).toBeGreaterThan(-1);
    expect(steps[ci].run).toContain("hygiene test");
    steps.slice(0, ci + 1).forEach((step) => expect(text(step), step.name ?? step.uses).not.toContain("secrets."));
    for (const later of [indexOf((s) => s.run?.includes("pnpm migrate")), indexOf((s) => s.run?.includes("wrangler deploy"))]) {
      expect(later).toBeGreaterThan(ci);
    }
  });

  it("[AC-MIG-05.1][AC-FND-06.3] waits while CI is still running, stops at once on a failure, and gives up after a limit", () => {
    const ci = steps.find((s) => s.run?.includes("check-runs"));
    expect(ci["timeout-minutes"]).toBeGreaterThan(0);
    expect(ci.run).toContain("sleep");
    expect(ci.run).toMatch(/fail\) .*exit 1/);
    expect(ci.run).toContain("Not releasing");
    expect(ci["continue-on-error"]).toBeUndefined();
  });

  it("[AC-MIG-05.2][AC-FND-06.4] migrations run first with the admin login, and nothing before the deploy may fail silently", () => {
    const migrate = indexOf((s) => s.run?.includes("pnpm migrate"));
    const deploy = indexOf((s) => s.run?.includes("wrangler deploy"));
    expect(migrate).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(migrate);
    expect(steps[migrate].env.DATABASE_ADMIN_URL).toBe("${{ secrets.DATABASE_ADMIN_URL }}");
    for (const step of steps.slice(0, deploy + 1)) {
      expect(step["continue-on-error"], step.name ?? step.uses).toBeUndefined();
    }
  });

  it("[AC-MIG-05.3] the deploy runs wrangler with a scoped token from the production secrets, and keeps the settings stored in Cloudflare", () => {
    const deploy = steps.find((s) => s.run?.includes("wrangler deploy"));
    expect(deploy.run).toContain("--keep-vars");
    expect(deploy.run).not.toContain("--dry-run");
    expect(deploy.env.CLOUDFLARE_API_TOKEN).toBe("${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(deploy.env.CLOUDFLARE_ACCOUNT_ID).toBe("${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(deploy["continue-on-error"]).toBeUndefined();
  });

  it("[AC-MIG-05.4][AC-FND-06.6] the run summary names the commit, and the migration step reports what it applied", () => {
    const summaryStep = steps.find((s) => s.run?.includes("GITHUB_STEP_SUMMARY") && s.run.includes("GITHUB_SHA"));
    expect(summaryStep).toBeDefined();
    const migrateStep = steps.find((s) => s.run?.includes("pnpm migrate"));
    expect(text(migrateStep)).toContain("DATABASE_ADMIN_URL");
    const cli = readFileSync(path.join(root, "api/src/db/migrate-cli.ts"), "utf8");
    expect(cli).toContain("GITHUB_STEP_SUMMARY");
    expect(cli).toContain("Migrations applied");
  });

  it("[AC-MIG-05.5] the workflow has no Azure steps, secrets, firewall rule or login", () => {
    expect(readFileSync(path.join(workflowsDir, "release.yml"), "utf8")).not.toMatch(/azure|firewall|static-web-apps|id-token/i);
  });
});

describe("CI workflow", () => {
  it("[AC-FND-06.4] CI loads the deployable API under plain Node, so a broken package fails the pull request", () => {
    const ci = parse(read("ci.yml"));
    const names = ci.jobs.test.steps.map((s) => s.run ?? "").join("\n");
    expect(names).toContain("scripts/stage-api.mjs");
    expect(names).toContain("scripts/verify-api-bundle.mjs");
  });
});
