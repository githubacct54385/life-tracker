import { existsSync, readFileSync } from "node:fs";
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

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens. */
const anchorsOf = (file) =>
  new Set([...readFileSync(path.join(root, file), "utf8").matchAll(/^#+ (.+)$/gm)].map((m) => m[1].toLowerCase().replace(/[^\w\- ]/g, "").replaceAll(" ", "-")));
const section = (heading) => readme.split(new RegExp(`^## ${heading}\\n`, "m"))[1]?.split(/^## /m)[0] ?? "";

describe("README pitch and links (OPS-06)", () => {
  it("[AC-OPS-06.3] has a features list and a 'what I would point to' list that names the engineering choices", () => {
    expect(section("What it does")).toMatch(/Car[\s\S]*Health[\s\S]*Giving/);
    const points = section("What I would point to");
    for (const choice of [/fail-closed/i, /dependency-cruiser/, /acceptance-criterion IDs/i, /manual release/i, /private document storage/i]) expect(points).toMatch(choice);
  });

  it("[AC-OPS-06.5] the tech stack table has a reason and an ADR link on every row", () => {
    const rows = section("Tech stack").split("\n").filter((line) => line.startsWith("|")).slice(2);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) expect(row, row).toMatch(/\(DECISIONS\.md#adr-\d{4}-/);
  });

  it("[AC-OPS-06.7] every relative link in the README points at a file, and every ADR anchor exists", () => {
    const links = [...readme.matchAll(/\]\(([^)#\s]+)(#[^)\s]*)?\)/g)].filter((m) => !/^[a-z]+:/i.test(m[1]));
    expect(links.length).toBeGreaterThan(10);
    for (const [, file, hash] of links) {
      expect(existsSync(path.join(root, file)), file).toBe(true);
      if (file === "DECISIONS.md" && hash) expect(anchorsOf(file).has(hash.slice(1)), hash).toBe(true);
    }
  });
});
