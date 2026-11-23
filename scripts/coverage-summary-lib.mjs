// Reads the per-package coverage summaries that vitest writes (OPS-09) and builds a short table, with the change
// against the last run on main when a baseline is given. Pure functions, so they are easy to test.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Where each set of numbers is written: <package>/coverage/<name>/coverage-summary.json. */
export const SETS = [
  { name: "shared", dir: "shared" },
  { name: "api", dir: "api" },
  { name: "api-int", dir: "api" },
  { name: "web", dir: "web" },
];

/** { name: { lines, branches } } for every set that has a report. A missing report is left out, not shown as 0. */
export function readCoverage(root) {
  const result = {};
  for (const { name, dir } of SETS) {
    const file = path.join(root, dir, "coverage", name, "coverage-summary.json");
    if (!existsSync(file)) continue;
    const total = JSON.parse(readFileSync(file, "utf8")).total;
    result[name] = { lines: total.lines.pct, branches: total.branches.pct };
  }
  return result;
}

const pct = (n) => `${n.toFixed(2)}%`;
const change = (now, before) => {
  if (before === undefined) return "n/a";
  const diff = Math.round((now - before) * 100) / 100;
  return diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`;
};

/** A Markdown table of lines and branches per set, with the change against `baseline` (the same shape as readCoverage's result). */
export function renderTable(current, baseline = {}, minimums = {}) {
  const rows = ["| Tests | Lines | vs main | Branches | vs main | Minimum (lines / branches) |", "|---|---|---|---|---|---|"];
  for (const [name, now] of Object.entries(current)) {
    const floor = minimums[name];
    rows.push(`| ${name} | ${pct(now.lines)} | ${change(now.lines, baseline[name]?.lines)} | ${pct(now.branches)} | ${change(now.branches, baseline[name]?.branches)} | ${floor ? `${floor.lines}% / ${floor.branches}%` : "none"} |`);
  }
  return rows.join("\n");
}
