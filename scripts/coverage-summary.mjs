#!/usr/bin/env node
// Prints the coverage table (OPS-09), writes coverage/summary.json for the next run to compare against, and with
// --markdown prints the table as Markdown for the CI job summary.
//
//   node scripts/coverage-summary.mjs [--baseline <folder holding summary.json from main>] [--markdown]
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCoverage, renderTable } from "./coverage-summary-lib.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const baselineDir = args.includes("--baseline") ? args[args.indexOf("--baseline") + 1] : undefined;
const current = readCoverage(root);
if (Object.keys(current).length === 0) {
  console.error("No coverage reports found. Run the coverage tests first (pnpm coverage:unit).");
  process.exit(1);
}
const baselineFile = baselineDir ? path.join(baselineDir, "summary.json") : undefined;
const baseline = baselineFile && existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : {};
const minimums = JSON.parse(readFileSync(path.join(root, "coverage.config.json"), "utf8")).thresholds;

mkdirSync(path.join(root, "coverage"), { recursive: true });
writeFileSync(path.join(root, "coverage", "summary.json"), `${JSON.stringify(current, null, 2)}\n`);

const table = renderTable(current, baseline, minimums);
if (args.includes("--markdown")) {
  console.log(`## Test coverage\n\n${table}\n\n${Object.keys(baseline).length ? "Compared with the latest run on main." : "No earlier run on main to compare with."} End-to-end tests are not part of these numbers.`);
} else {
  console.log(table);
}
