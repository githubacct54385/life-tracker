#!/usr/bin/env node
// Writes coverage.svg and lighthouse.svg (the badge images) into an output folder.
//   node scripts/make-badges.mjs <coverage summary.json> <lighthouse summary.json> <output folder>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { coverageBadge, lighthouseBadge, renderBadgeSvg } from "./badges-lib.mjs";

const [coverageFile, lighthouseFile, outDir] = process.argv.slice(2);
if (!coverageFile || !lighthouseFile || !outDir) {
  console.error("Usage: node scripts/make-badges.mjs <coverage summary.json> <lighthouse summary.json> <output folder>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const write = (name, badge) => writeFileSync(path.join(outDir, name), renderBadgeSvg(badge));
write("coverage.svg", coverageBadge(JSON.parse(readFileSync(coverageFile, "utf8"))));
write("lighthouse.svg", lighthouseBadge(JSON.parse(readFileSync(lighthouseFile, "utf8"))));
console.log(`Wrote ${path.join(outDir, "coverage.svg")} and ${path.join(outDir, "lighthouse.svg")}`);
