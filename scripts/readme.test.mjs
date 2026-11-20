import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const diagrams = [...readme.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((match) => match[1]);

describe("README (OPS-06)", () => {
  it("[AC-OPS-06.4] has architecture diagrams that GitHub renders (Mermaid) and that name the browser, Worker, Access, Neon and R2", () => {
    expect(diagrams.length).toBeGreaterThanOrEqual(3);
    const all = diagrams.join("\n");
    for (const part of ["Browser", "Worker", "Cloudflare Access", "Neon", "R2"]) expect(all, part).toContain(part);
    expect(diagrams.some((d) => d.startsWith("erDiagram"))).toBe(true);
  });

  it("[AC-OPS-06.4] a label never starts with a number and a dot, which Mermaid would turn into a list and show as an error", () => {
    for (const diagram of diagrams) expect(diagram).not.toMatch(/"\s*\d+\.\s/);
  });

  it("[AC-OPS-06.6] the status line says where the project really is, not 'planning and foundation'", () => {
    expect(readme).not.toMatch(/planning and foundation/i);
    expect(readme).toMatch(/\*\*Status:\*\*/);
  });
});
