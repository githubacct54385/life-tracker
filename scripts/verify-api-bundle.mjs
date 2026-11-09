// Loads every compiled module in the staged API folder with plain Node (FND-06).
// CI runs this so a build that only works under Vitest or tsc cannot reach a release.
//
//   node scripts/verify-api-bundle.mjs [stageDir]      (default: .stage/api)
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.resolve(process.argv[2] ?? path.join(root, ".stage/api"));

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".js")) yield full;
  }
}

const files = [];
for await (const file of walk(path.join(stage, "dist"))) files.push(file);
if (files.length === 0) {
  console.error(`No compiled files in ${stage}/dist. Run pnpm build first.`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  try {
    await import(pathToFileURL(file).href);
  } catch (error) {
    failed = true;
    console.error(`FAILED to load ${path.relative(stage, file)}: ${error instanceof Error ? error.message : error}`);
  }
}
if (failed) process.exit(1);
console.log(`Loaded ${files.length} compiled module(s) from ${path.relative(root, stage) || stage}.`);
