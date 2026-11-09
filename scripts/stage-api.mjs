// Builds the folder that is deployed as the Static Web Apps API (FND-06).
//
//   pnpm build && node scripts/stage-api.mjs [outDir]      (default outDir: .stage/api)
//
// The folder holds host.json, package.json, the compiled code, and production dependencies only,
// with `@life-tracker/shared` resolved to its compiled output. Deploy it with skip_api_build.
import { execFileSync } from "node:child_process";
import { cp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPublishConfig } from "./stage-api-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] ?? path.join(root, ".stage/api"));

await rm(out, { recursive: true, force: true });
execFileSync("pnpm", ["--filter", "@life-tracker/api", "deploy", "--prod", "--config.node-linker=hoisted", out], { cwd: root, stdio: "inherit" });

// The hoisted layout gives a flat node_modules with real folders, which survives being zipped for upload.
// Keep only what the Functions host needs. Source, tests, and tsconfig files stay out.
for (const name of ["src", "tsconfig.json", "tsconfig.build.json", "vitest.config.ts", "vitest.int.config.ts", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  await rm(path.join(out, name), { recursive: true, force: true });
}

// Point the staged copy of `shared` at its compiled output.
const sharedDir = await realpath(path.join(out, "node_modules/@life-tracker/shared"));
await cp(path.join(root, "shared/dist"), path.join(sharedDir, "dist"), { recursive: true });
await rm(path.join(sharedDir, "src"), { recursive: true, force: true });
const sharedPkgPath = path.join(sharedDir, "package.json");
const sharedPkg = applyPublishConfig(JSON.parse(await readFile(sharedPkgPath, "utf8")));
await writeFile(sharedPkgPath, `${JSON.stringify(sharedPkg, null, 2)}\n`);

console.log(`Staged API at ${out}`);
