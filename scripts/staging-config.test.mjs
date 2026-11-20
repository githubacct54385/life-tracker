import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// wrangler.jsonc allows comments. Whole-line comments are all the file uses, so dropping those lines is enough to parse it.
const text = readFileSync(path.join(root, "api/wrangler.jsonc"), "utf8");
const config = JSON.parse(
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n"),
);
const staging = config.env?.staging;

describe("Wrangler staging environment (OPS-08, ADR-0025)", () => {
  it("[AC-OPS-08.1] staging is its own Worker, and production keeps the name it has today", () => {
    expect(config.name).toBe("life-tracker");
    expect(staging).toBeDefined();
    expect(staging.name).toBe("life-tracker-staging");
    expect(staging.name).not.toBe(config.name);
  });

  it("[AC-OPS-08.2] staging is bound to the staging bucket only, and production to the production bucket only", () => {
    expect(config.r2_buckets).toEqual([{ binding: "DOCUMENTS", bucket_name: "life-tracker-documents" }]);
    expect(staging.r2_buckets).toEqual([{ binding: "DOCUMENTS", bucket_name: "life-tracker-documents-staging" }]);
    expect(JSON.stringify(staging)).not.toMatch(/"life-tracker-documents"/);
  });

  it("[AC-OPS-08.1] staging serves the same built site and logs the same way as production", () => {
    expect(staging.assets).toEqual(config.assets);
    expect(staging.observability).toEqual(config.observability);
  });

  it("[AC-OPS-08.7] neither environment holds a secret or a setting that names a database or login in the file", () => {
    for (const section of [config, staging]) {
      expect(section.vars ?? {}).toEqual({});
    }
    expect(text).not.toMatch(/postgres(ql)?:\/\//i);
    expect(text).not.toMatch(/cloudflareaccess\.com/i);
  });
});
