// Builds the folder that is deployed as the Static Web Apps API (FND-06).
//
//   pnpm build && node scripts/stage-api.mjs [outDir]      (default outDir: .stage/api)
//
// The folder holds host.json, package.json, the compiled code, and production dependencies only.
// The compiled `shared` package is copied to dist/_shared and imported by relative path (ADR-0020).
import { execFileSync } from "node:child_process";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteSharedImports, toDeployPackage } from "./stage-api-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] ?? path.join(root, ".stage/api"));

await rm(out, { recursive: true, force: true });
execFileSync("pnpm", ["--filter", "@life-tracker/api", "deploy", "--prod", "--config.node-linker=hoisted", out], { cwd: root, stdio: "inherit" });

// The hoisted layout gives a flat node_modules with real folders, which survives being zipped for upload.
// Keep only what the Functions host needs. Source, tests, and tsconfig files stay out.
for (const name of ["src", "tsconfig.json", "tsconfig.build.json", "vitest.config.ts", "vitest.int.config.ts", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  await rm(path.join(out, name), { recursive: true, force: true });
}

// `shared` ships as plain compiled files inside dist/, not as a package in node_modules.
await rm(path.join(out, "node_modules/@life-tracker"), { recursive: true, force: true });
const sharedEntry = path.join(out, "dist/_shared/index.js");
await cp(path.join(root, "shared/dist"), path.join(out, "dist/_shared"), { recursive: true });

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".js")) yield full;
  }
}
for await (const file of walk(path.join(out, "dist"))) {
  const before = await readFile(file, "utf8");
  const after = rewriteSharedImports(before, file, sharedEntry);
  if (after !== before) await writeFile(file, after);
}

// Oryx runs npm on this folder at deploy time. With no build script and nothing to resolve, there is nothing to break.
const apiPkgPath = path.join(out, "package.json");
const apiPkg = toDeployPackage(JSON.parse(await readFile(apiPkgPath, "utf8")));
await writeFile(apiPkgPath, `${JSON.stringify(apiPkg, null, 2)}\n`);

console.log(`Staged API at ${out}`);
