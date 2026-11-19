// MIL-07 (AC-MIL-07.1): the one exception to "do not store uploaded files" is written down in ADR-0024, and the places that
// state the rule point to it, so nobody reads the rule without finding the exception.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

describe("the stored-documents exception", () => {
  it("[AC-MIL-07.1] ADR-0024 records the exception, limited to maintenance documents and private R2 storage", () => {
    const adr = read("DECISIONS.md").split("## ADR-0024")[1] ?? "";
    expect(adr).toContain("narrow exception to AGENTS.md hard rule 5");
    expect(adr).toContain("private Cloudflare R2 bucket");
    expect(adr).toMatch(/Only maintenance documents/);
    expect(adr).toMatch(/at most 10 per service/);
    expect(adr).toMatch(/at most 5 MB/);
  });

  it("[AC-MIL-07.1] AGENTS.md hard rule 5 and SPEC.md point to ADR-0024", () => {
    const rule5 = read("AGENTS.md").split("\n").find((line) => line.startsWith("5. **Do not store uploaded files.**")) ?? "";
    expect(rule5).toContain("ADR-0024");
    expect(read("SPEC.md")).toMatch(/ADR-0024[^\n]*no-stored-files rule/);
  });
});
