#!/usr/bin/env node
// Writes coverage.json and lighthouse.json (the badge files) into an output folder.
//   node scripts/make-badges.mjs <coverage summary.json> <lighthouse summary.json> <output folder>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { coverageBadge, lighthouseBadge } from "./badges-lib.mjs";

const [coverageFile, lighthouseFile, outDir] = process.argv.slice(2);
if (!coverageFile || !lighthouseFile || !outDir) {
  console.error("Usage: node scripts/make-badges.mjs <coverage summary.json> <lighthouse summary.json> <output folder>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const write = (name, badge) => writeFileSync(path.join(outDir, name), `${JSON.stringify(badge)}\n`);
write("coverage.json", coverageBadge(JSON.parse(readFileSync(coverageFile, "utf8"))));
write("lighthouse.json", lighthouseBadge(JSON.parse(readFileSync(lighthouseFile, "utf8"))));
console.log(`Wrote ${path.join(outDir, "coverage.json")} and ${path.join(outDir, "lighthouse.json")}`);
