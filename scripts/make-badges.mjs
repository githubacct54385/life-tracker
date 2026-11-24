#!/usr/bin/env node
// Writes the badge images (coverage.svg, lighthouse.svg) and the "Project health" page (report.md) into an output folder.
//   node scripts/make-badges.mjs <coverage summary.json> <lighthouse summary.json> <output folder>
// CI sets GITHUB_SHA and, for the link to the full reports, GITHUB_SERVER_URL, GITHUB_REPOSITORY and GITHUB_RUN_ID.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { coverageBadge, lighthouseBadge, renderBadgeSvg, renderHealthReport } from "./badges-lib.mjs";

const [coverageFile, lighthouseFile, outDir] = process.argv.slice(2);
if (!coverageFile || !lighthouseFile || !outDir) {
  console.error("Usage: node scripts/make-badges.mjs <coverage summary.json> <lighthouse summary.json> <output folder>");
  process.exit(2);
}
const coverage = JSON.parse(readFileSync(coverageFile, "utf8"));
const lighthouse = JSON.parse(readFileSync(lighthouseFile, "utf8"));
const root = process.cwd();
const minimums = JSON.parse(readFileSync(path.join(root, "coverage.config.json"), "utf8")).thresholds;
const budgetKB = JSON.parse(readFileSync(path.join(root, "lighthouse.config.json"), "utf8")).budgets.firstScreenJavaScriptKB;
const env = process.env;

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "coverage.svg"), renderBadgeSvg(coverageBadge(coverage)));
writeFileSync(path.join(outDir, "lighthouse.svg"), renderBadgeSvg(lighthouseBadge(lighthouse)));
writeFileSync(
  path.join(outDir, "report.md"),
  renderHealthReport({
    coverage,
    lighthouse,
    minimums,
    budgetKB,
    details: {
      commit: env.GITHUB_SHA ?? "local",
      repoUrl: env.GITHUB_REPOSITORY ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}` : "https://github.com",
      date: new Date().toISOString().slice(0, 10),
      runUrl: env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : "https://github.com",
    },
  }),
);
console.log(`Wrote coverage.svg, lighthouse.svg and report.md in ${outDir}`);
