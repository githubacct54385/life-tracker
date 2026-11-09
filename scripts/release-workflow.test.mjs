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
  it("[AC-FND-06.1] runs only when started by hand, and only from main", () => {
    expect(Object.keys(release.on)).toEqual(["workflow_dispatch"]);
    expect(steps[0].run).toContain("refs/heads/main");
  });

  it("[AC-FND-06.1] no other workflow can deploy the site or API", () => {
    for (const file of readdirSync(workflowsDir).filter((name) => name !== "release.yml")) {
      const body = read(file);
      expect(body, file).not.toMatch(/static-web-apps-deploy|AZURE_STATIC_WEB_APPS_API_TOKEN|azure\/login/);
    }
  });

  it("[AC-FND-06.2] the job uses the production environment, which holds the owner's approval gate", () => {
    expect(job.environment).toBe("production");
  });

  it("[AC-FND-06.2] production secrets are read only inside the job that uses the environment", () => {
    const { jobs, ...outsideJobs } = release;
    expect(JSON.stringify(outsideJobs)).not.toContain("secrets.");
    expect(Object.keys(jobs)).toEqual(["release"]);
    expect(JSON.stringify({ ...job, steps: undefined })).not.toContain("secrets.");
  });

  it("[AC-FND-06.3] checks that CI passed on this exact commit before login, migration, or deploy", () => {
    const ci = indexOf((s) => s.run?.includes("check-runs") && s.run.includes("GITHUB_SHA"));
    expect(ci).toBeGreaterThan(-1);
    expect(steps[ci].run).toContain("hygiene test");
    expect(steps[ci].run).toContain("check-runs");
    for (const later of [
      indexOf((s) => s.uses?.startsWith("azure/login")),
      indexOf((s) => s.run?.includes("pnpm migrate")),
      indexOf((s) => s.uses?.startsWith("Azure/static-web-apps-deploy")),
    ]) {
      expect(later).toBeGreaterThan(ci);
    }
  });

  it("[AC-FND-06.3] waits while CI is still running, stops at once on a failure, and gives up after a limit", () => {
    const ci = steps.find((s) => s.run?.includes("check-runs"));
    expect(ci["timeout-minutes"]).toBeGreaterThan(0);
    expect(ci.run).toContain("sleep");
    expect(ci.run).toMatch(/fail\) .*exit 1/);
    expect(ci.run).toContain("Not releasing");
    expect(ci["continue-on-error"]).toBeUndefined();
  });

  it("[AC-FND-06.4] migrations run before the deploy, and neither step may fail silently", () => {
    const migrate = indexOf((s) => s.run?.includes("pnpm migrate"));
    const deploy = indexOf((s) => s.uses?.startsWith("Azure/static-web-apps-deploy"));
    expect(migrate).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(migrate);
    for (const step of steps.slice(0, deploy + 1)) {
      expect(step["continue-on-error"], step.name ?? step.uses).toBeUndefined();
    }
  });

  it("[AC-FND-06.4] the database firewall rule is removed even when the release fails", () => {
    const close = steps.find((s) => s.run?.includes("firewall-rule delete"));
    expect(close.if).toContain("always()");
  });

  it("[AC-FND-06.4] the deploy uploads prebuilt folders and does not rebuild", () => {
    const deploy = steps.find((s) => s.uses?.startsWith("Azure/static-web-apps-deploy"));
    expect(deploy.with.skip_app_build).toBe(true);
    expect(deploy.with.skip_api_build).toBeUndefined(); // not an input of the v1 action
    expect(deploy.with.api_build_command).toBeUndefined();
    expect(deploy.env.FUNCTION_LANGUAGE).toBe("node");
    expect(deploy.env.FUNCTION_LANGUAGE_VERSION).toBe("22");
    expect(deploy.with.app_location).toBe("web/dist");
    expect(deploy.with.api_location).toBe(".stage/api");
  });

  it("[AC-FND-06.4] the API is staged and loaded under plain Node before anything is deployed", () => {
    const verify = indexOf((s) => s.run?.includes("verify-api-bundle"));
    const login = indexOf((s) => s.uses?.startsWith("azure/login"));
    expect(verify).toBeGreaterThan(-1);
    expect(verify).toBeLessThan(login);
  });

  it("[AC-FND-06.6] the run summary names the commit, and the migration step reports what it applied", () => {
    const summaryStep = steps.find((s) => s.run?.includes("GITHUB_STEP_SUMMARY") && s.run.includes("GITHUB_SHA"));
    expect(summaryStep).toBeDefined();
    const migrateStep = steps.find((s) => s.run?.includes("pnpm migrate"));
    expect(text(migrateStep)).toContain("SQL_ADMIN_CONNECTION");
    const cli = readFileSync(path.join(root, "api/src/db/migrate-cli.ts"), "utf8");
    expect(cli).toContain("GITHUB_STEP_SUMMARY");
    expect(cli).toContain("Migrations applied");
  });

  it("[AC-FND-06.7] Azure login uses OIDC with no stored password", () => {
    expect(release.permissions["id-token"]).toBe("write");
    const login = steps.find((s) => s.uses?.startsWith("azure/login"));
    expect(Object.keys(login.with).sort()).toEqual(["client-id", "subscription-id", "tenant-id"]);
    expect(JSON.stringify(login.with)).not.toMatch(/client-secret|creds|password/i);
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
