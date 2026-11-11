// Checks that the Azure Functions entry points are gone and the Worker configuration says what the docs say (MIG-03).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
  });
}

describe("platform", () => {
  it("[AC-MIG-03.1] no API source imports the Azure Functions SDK, and host.json is gone", () => {
    const offenders = sourceFiles(path.join(apiRoot, "src")).filter((file) => /@azure\/functions/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
    const pkg = JSON.parse(readFileSync(path.join(apiRoot, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).not.toContain("@azure/functions");
    expect(readdirSync(apiRoot)).not.toContain("host.json");
  });

  it("[AC-MIG-03.1] handlers sit in api/src/handlers and the worker entry wires them to services", () => {
    const worker = readFileSync(path.join(apiRoot, "src/worker.ts"), "utf8");
    expect(worker).toContain('from "./services/healthService.js"');
    expect(worker).not.toContain("repositories/");
    expect(readdirSync(path.join(apiRoot, "src/handlers"))).toContain("healthHandler.ts");
  });

  it("[AC-MIG-03.2][AC-MIG-03.4] wrangler.jsonc serves web/dist as assets, runs the Worker first, and enables Node compatibility", () => {
    const text = readFileSync(path.join(apiRoot, "wrangler.jsonc"), "utf8");
    const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as {
      main: string;
      compatibility_flags: string[];
      assets: { directory: string; binding: string; run_worker_first: boolean; not_found_handling: string };
      vars?: unknown;
    };
    expect(config.main).toBe("src/worker.ts");
    expect(config.compatibility_flags).toContain("nodejs_compat");
    expect(config.assets).toMatchObject({ directory: "../web/dist", binding: "ASSETS", run_worker_first: true, not_found_handling: "single-page-application" });
    expect(config.vars).toBeUndefined(); // no values in the file; secrets live in .dev.vars and Cloudflare
    expect(/postgres(ql)?:\/\//i.test(text)).toBe(false);
  });

  it("[AC-MIG-04.6] no production source imports the test token signer or reads the environment in the auth code", () => {
    const files = sourceFiles(path.join(apiRoot, "src")).filter((file) => !file.includes(`${path.sep}testing${path.sep}`));
    const importers = files.filter((file) => /testing\/accessTokens/.test(readFileSync(file, "utf8")));
    expect(importers).toEqual([]);
    const authFiles = files.filter((file) => file.includes(`${path.sep}auth${path.sep}`));
    const readers = authFiles.filter((file) => /process\.env|import\.meta\.env|NODE_ENV/.test(readFileSync(file, "utf8")));
    expect(readers).toEqual([]);
  });

  it("[AC-MIG-06.1] Workers Logs is on, and no Application Insights package is a dependency anywhere", () => {
    const text = readFileSync(path.join(apiRoot, "wrangler.jsonc"), "utf8");
    const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as { observability?: { enabled?: boolean; head_sampling_rate?: number } };
    expect(config.observability?.enabled).toBe(true);
    const root = path.resolve(apiRoot, "..");
    for (const dir of [root, apiRoot, path.join(root, "web"), path.join(root, "shared")]) {
      const pkg = readFileSync(path.join(dir, "package.json"), "utf8");
      expect(pkg, dir).not.toMatch(/applicationinsights|opencensus|@microsoft\/applicationinsights/i);
    }
  });

  it("[AC-MIG-06.2] nothing in the Worker writes to the console except the logger's own sink", () => {
    // The migration command and the test database setup run on a developer machine or in GitHub Actions, never in the Worker.
    const outsideWorker = ["migrate-cli.ts", "globalSetup.int.ts"];
    const offenders = sourceFiles(path.join(apiRoot, "src"))
      .filter((file) => !file.endsWith(`${path.sep}telemetry${path.sep}logger.ts`) && !file.includes(`${path.sep}testing${path.sep}`))
      .filter((file) => !outsideWorker.some((name) => file.endsWith(name)))
      .filter((file) => /\bconsole\./.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
