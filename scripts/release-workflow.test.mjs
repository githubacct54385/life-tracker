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

  // The staging workflow (OPS-08) deploys the staging Worker with its own environment's secrets. What it may and may not do is
  // checked in staging-workflow.test.mjs, which also checks that this workflow never touches staging.
  it("[AC-MIG-05.1][AC-FND-06.1] no other workflow, apart from the staging one, can deploy the Worker or read the deploy secrets", () => {
    for (const file of readdirSync(workflowsDir).filter((name) => !["release.yml", "staging.yml"].includes(name))) {
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

  it("[AC-OPS-08.4] a commit is released only after its staging smoke test passed, checked the same way as CI", () => {
    const ci = steps.find((s) => s.run?.includes("check-runs"));
    expect(release.permissions.statuses).toBe("read");
    expect(ci.run).toContain("/statuses");
    expect(ci.run).toContain("staging-smoke");
    // A pass needs a success; a failure or error stops at once; pending or nothing yet keeps waiting.
    expect(ci.run).toMatch(/"success" then "pass"/);
    expect(ci.run).toMatch(/"failure" or \. == "error" then "fail"/);
    expect(ci.run).toMatch(/fail\) echo "The staging smoke test failed.*exit 1/);
    expect(ci.run).toContain("waiting=\"$waiting staging-smoke\"");
    // The gate only reads: it cannot write a status to fake a pass, and it does not deploy to staging.
    expect(release.permissions.statuses).not.toBe("write");
    expect(ci.run).not.toMatch(/-f state=|--env staging|wrangler/);
    expect(JSON.stringify(release)).not.toMatch(/--env staging|staging\.yml/);
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

  // OPS-11: tags, notes and the dry run.
  const publish = () => steps.findIndex((s) => s.run?.includes("gh release create"));
  const runs = () => steps.map((s) => s.run ?? "").join("\n");

  it("[AC-OPS-11.1] the last step tags the deployed commit and creates a GitHub Release from the notes", () => {
    const last = steps.at(-1);
    expect(publish()).toBe(steps.length - 1);
    expect(last.run).toContain('gh release create "$TAG" --target "$GITHUB_SHA"');
    expect(last.run).toContain("--notes-file release-notes.md");
    expect(last.run).toContain("--latest");
    expect(steps.find((s) => s.id === "notes").run).toContain("scripts/release-notes.mjs");
    expect(publish()).toBeGreaterThan(indexOf((s) => s.run?.includes("wrangler deploy")));
  });

  it("[AC-OPS-11.4] a failed release creates no tag and no release: the step runs only after every earlier step succeeded", () => {
    expect(steps[publish()].if).toContain("success()");
    for (const step of steps) expect(step["continue-on-error"], step.name ?? step.uses).toBeUndefined();
  });

  it("[AC-OPS-11.3] the workflow never commits or pushes to main, and write access is limited to this job", () => {
    expect(runs()).not.toMatch(/git (commit|push|tag)/);
    expect(release.permissions.contents).toBe("read");
    expect(job.permissions).toEqual({ contents: "write", checks: "read", statuses: "read" });
    expect(Object.keys(release.jobs)).toEqual(["release"]);
  });

  it("[AC-OPS-11.8] a dry run still checks CI and works out the notes, but never builds, migrates, deploys, tags or publishes", () => {
    expect(release.on.workflow_dispatch.inputs.dry_run).toMatchObject({ type: "boolean", default: false });
    const before = indexOf((s) => s.id === "notes");
    steps.slice(0, before + 1).forEach((step) => expect(step.if, step.name ?? step.uses).toBeUndefined());
    for (const step of steps.slice(before + 1)) expect(step.if, step.name ?? step.run ?? step.uses).toContain("!inputs.dry_run");
  });

  it("[AC-OPS-11.5] the production build gets the release tag and the production environment, so Settings shows the version and no label", () => {
    const build = steps.find((s) => s.run === "pnpm build");
    expect(build.env).toEqual({ VITE_APP_ENV: "production", VITE_RELEASE_TAG: "${{ steps.notes.outputs.tag }}", VITE_COMMIT: "${{ github.sha }}" });
  });

  it("[AC-OPS-11.7] the release badge is redrawn from the new tag", () => {
    expect(steps.at(-1).run).toContain('node scripts/release-badge.mjs "$TAG" release.svg');
    expect(steps.at(-1).run).toContain("gh release upload badges release.svg --clobber");
  });
});
