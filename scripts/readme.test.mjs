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

  it("[AC-OPS-06.6] the local run section does not promise an open health check, because the API refuses unsigned requests", () => {
    const local = section("Run it locally");
    expect(local).not.toMatch(/returns `\{"status":"ok"\}`/);
    expect(local).toMatch(/401/);
    expect(local).toMatch(/localhost:8787\/demo/);
  });

  it("[AC-OPS-06.6] the Docker guide never pipes app-role.sql through stdin, because its include of app-role-grants.sql then cannot be found", () => {
    const guide = readFileSync(path.join(root, "docs/local-docker.md"), "utf8");
    expect(guide).not.toMatch(/<\s*db\/setup\/app-role\.sql/);
    expect(guide).toMatch(/-f \/tmp\/setup\/app-role\.sql/);
  });
});

describe("README accuracy and privacy (OPS-06)", () => {
  const rootScripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;

  it("[AC-OPS-06.6] every `pnpm <script>` the README tells you to run exists in package.json", () => {
    // Only commands: inside backticks, or at the start of a line in a code block (not the word "pnpm" in a sentence).
    const named = [...readme.matchAll(/(?:`|^)pnpm (?!--filter|-r|install|exec)([a-z][\w:-]*)/gm)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(5);
    for (const script of new Set(named)) expect(rootScripts, `pnpm ${script}`).toHaveProperty([script]);
  });

  it("[AC-OPS-06.6] the Node version it asks for is the one the repository requires", () => {
    const engines = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).engines.node;
    expect(engines).toBe(">=22");
    expect(readme).toMatch(/Node 22 or newer/);
  });

  it("[AC-OPS-06.7] contains no email address, no phone number and no long token, and only local web addresses", () => {
    expect(readme).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(readme).not.toMatch(/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/);
    expect(readme.replace(/\]\([^)]*\)/g, "]")).not.toMatch(/\b[A-Za-z0-9_-]{32,}\b/); // link targets (heading slugs) are long but are not secrets
    const addresses = [...readme.matchAll(/https?:\/\/[^\s)>`"',]+/g)].map((m) => new URL(m[0]).hostname);
    // Badges (OPS-07) come from GitHub and shields.io; every other address must be local.
    expect([...new Set(addresses)].filter((host) => !["github.com", "img.shields.io"].includes(host))).toEqual(["localhost"]);
  });
});

describe("README badges (OPS-07)", () => {
  const badgeRow = readme.split("\n").find((line) => /^\[!\[/.test(line)) ?? "";
  const lines = readme.split("\n");
  const badgeImages = [...badgeRow.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((m) => ({ alt: m[1], url: m[2] }));

  it("[AC-OPS-07.1] the CI badge shows the latest CI run on main and links to the CI runs on main", () => {
    const ci = badgeImages.find((badge) => badge.alt === "CI");
    expect(ci?.url).toMatch(/\/actions\/workflows\/ci\.yml\/badge\.svg\?branch=main$/);
    expect(badgeRow).toMatch(/\]\(https:\/\/github\.com\/[^)]+\/actions\/workflows\/ci\.yml\?query=branch%3Amain\)/);
    expect(existsSync(path.join(root, ".github/workflows/ci.yml"))).toBe(true);
  });

  it("[AC-OPS-07.2] shows a CodeQL badge and a licence badge, and the licence file exists", () => {
    expect(badgeImages.map((badge) => badge.alt)).toEqual(expect.arrayContaining(["CodeQL", "Licence: MIT"]));
    expect(readFileSync(path.join(root, "LICENSE"), "utf8")).toMatch(/MIT License/);
  });

  it("[AC-OPS-07.3] shows a coverage badge and a Lighthouse badge, now that OPS-09 and OPS-10 exist, as images CI keeps on the badges release", () => {
    expect(badgeImages.map((badge) => badge.alt)).toEqual(expect.arrayContaining(["Coverage", "Lighthouse"]));
    for (const alt of ["Coverage", "Lighthouse"]) {
      const url = new URL(badgeImages.find((badge) => badge.alt === alt).url);
      expect(url.hostname).toBe("github.com");
      expect(url.pathname).toMatch(new RegExp(`^/[^/]+/[^/]+/releases/download/badges/${alt.toLowerCase()}\\.svg$`));
    }
  });

  it("[AC-OPS-07.3] the coverage and Lighthouse badges share one link, to the plain-English Project health page and not the CI logs", () => {
    const shared = /\[!\[Coverage\]\([^)]+\) !\[Lighthouse\]\([^)]+\)\]\((https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/tag\/badges)\)/.exec(badgeRow);
    expect(shared, "one link around both badges, to the badges release page").not.toBeNull();
  });

  it("[AC-OPS-07.4] shows no release badge until OPS-11 exists", () => {
    for (const badge of badgeImages) expect(badge.alt).not.toMatch(/release/i);
  });

  it("[AC-OPS-07.5] badges come only from GitHub or shields.io, and no URL carries a token or secret", () => {
    expect(badgeImages.length).toBeGreaterThanOrEqual(3);
    for (const badge of badgeImages) {
      const url = new URL(badge.url);
      expect(["github.com", "img.shields.io"]).toContain(url.hostname);
      expect(url.search.replace("?branch=main", "")).toBe(""); // no query except the branch pin
    }
  });

  it("[AC-OPS-07.6] the badges are one row directly under the title, so they wrap as inline images", () => {
    expect(lines[0]).toBe("# Life Tracker");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe(badgeRow);
    expect(badgeRow.startsWith("[![")).toBe(true);
  });
});
