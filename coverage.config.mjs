// One place for coverage settings (OPS-09). Each package's vitest config calls coverageFor("<name>").
// The numbers and the excluded files, with reasons, are in coverage.config.json.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(readFileSync(path.join(here, "coverage.config.json"), "utf8"));

/** The `test.coverage` block for a package: "shared", "api", "api-int" or "web". */
export function coverageFor(name) {
  const thresholds = settings.thresholds[name];
  if (!thresholds) throw new Error(`No coverage thresholds for "${name}" in coverage.config.json`);
  return {
    provider: "v8",
    include: ["src/**/*.{ts,tsx}"],
    exclude: settings.exclude.map((entry) => entry.pattern.replace(/^(web|api|shared)\//, "")),
    reporter: ["text-summary", "json-summary", "html"],
    reportsDirectory: `coverage/${name}`,
    thresholds: { lines: thresholds.lines, branches: thresholds.branches },
  };
}
