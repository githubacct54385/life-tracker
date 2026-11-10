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
});
