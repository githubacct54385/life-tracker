import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nextTag, parseSubject, previousTag, releaseTags, renderNotes } from "./release-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoUrl = "https://github.com/example/app";
const sha = "1543dbb65f2336d6446938f73abbaeeac5786748";

describe("release tags", () => {
  it("[AC-OPS-11.1] the first release of a day is .1 and each later one that day counts up", () => {
    expect(nextTag("2026-11-25", [])).toBe("v2026.11.25.1");
    expect(nextTag("2026-11-25", ["v2026.11.25.1"])).toBe("v2026.11.25.2");
    expect(nextTag("2026-11-25", ["v2026.11.25.1", "v2026.11.25.9", "v2026.11.25.10"])).toBe("v2026.11.25.11");
  });

  it("[AC-OPS-11.1] a new day starts again at .1", () => {
    expect(nextTag("2026-11-26", ["v2026.11.25.3"])).toBe("v2026.11.26.1");
  });

  it("[AC-OPS-11.1] only release tags count, so the badges and screenshots releases are ignored", () => {
    const tags = ["badges", "pr-screenshots", "v2026.11.25.1", "v1.0", "latest"];
    expect(releaseTags(tags)).toEqual(["v2026.11.25.1"]);
    expect(nextTag("2026-11-25", tags)).toBe("v2026.11.25.2");
    expect(previousTag(["badges", "pr-screenshots"])).toBeNull();
  });

  it("[AC-OPS-11.1] the previous tag is the newest by date and counter, not by alphabet", () => {
    expect(previousTag(["v2026.11.25.2", "v2026.11.25.10", "v2026.10.30.4", "v2026.11.09.1"])).toBe("v2026.11.25.10");
  });
});

describe("release notes", () => {
  it("[AC-OPS-11.2] reads the story key, title and pull request number from a squash commit", () => {
    expect(parseSubject("GRO-02: Offline grocery list (#104)")).toEqual({ key: "GRO-02", title: "Offline grocery list", pr: 104 });
    expect(parseSubject("Bump vite from 7.1 to 7.2 (#99)")).toEqual({ key: "Other", title: "Bump vite from 7.1 to 7.2", pr: 99 });
    expect(parseSubject("OPS-07: no number")).toEqual({ key: "OPS-07", title: "no number", pr: null });
  });

  it("[AC-OPS-11.2] groups changes by story key, puts Other last, and links each pull request", () => {
    const notes = renderNotes({
      tag: "v2026.11.25.2",
      previous: "v2026.11.25.1",
      subjects: ["GRO-02: Offline grocery list (#104)", "Bump vite (#99)", "DSH-02: Weekly summary (#124)", "GRO-02: Fix sync message (#105)"],
      migrations: [],
      repoUrl,
      sha,
    });
    expect(notes).toContain("## v2026.11.25.2");
    expect(notes).toContain("### What changed since v2026.11.25.1");
    expect(notes.indexOf("**DSH-02**")).toBeLessThan(notes.indexOf("**GRO-02**"));
    expect(notes.indexOf("**GRO-02**")).toBeLessThan(notes.indexOf("**Other**"));
    expect(notes).toContain(`- Weekly summary ([#124](${repoUrl}/pull/124))`);
    expect(notes.match(/\*\*GRO-02\*\*/g)).toHaveLength(1);
  });

  it("[AC-OPS-11.2] names each migration that ran, or says none did", () => {
    const base = { tag: "v2026.11.25.2", previous: "v2026.11.25.1", subjects: [], repoUrl, sha };
    expect(renderNotes({ ...base, migrations: ["db/migrations/0014_add_thing.sql"] })).toContain("- `db/migrations/0014_add_thing.sql`");
    expect(renderNotes({ ...base, migrations: [] })).toContain("None ran in this release.");
    expect(renderNotes({ ...base, migrations: [] })).toContain("No merged changes since the previous release.");
  });

  it("[AC-OPS-11.2] the first release says so instead of listing the whole history", () => {
    const notes = renderNotes({ tag: "v2026.11.25.1", previous: null, subjects: [], migrations: [], repoUrl, sha });
    expect(notes).toContain("first tagged release");
    expect(notes).not.toContain("What changed since");
  });

  it("[AC-OPS-11.6] the notes say how to go back, and link the deployed commit", () => {
    const notes = renderNotes({ tag: "v2026.11.25.1", previous: null, subjects: [], migrations: [], repoUrl, sha });
    expect(notes).toContain("release a revert of the change");
    expect(notes).toContain(`${repoUrl}/commit/${sha}`);
  });
});

describe("release-notes script on a real git history", () => {
  function git(cwd, ...args) {
    return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@users.noreply.github.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
  }

  it("[AC-OPS-11.2] lists the squash commits and the new migration since the previous tag", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "release-notes-"));
    git(dir, "init", "-q", "-b", "main");
    mkdirSync(path.join(dir, "db/migrations"), { recursive: true });
    writeFileSync(path.join(dir, "db/migrations/0001_first.sql"), "select 1;\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "FND-01: start (#1)");
    git(dir, "tag", "v2026.11.20.1");
    writeFileSync(path.join(dir, "db/migrations/0002_second.sql"), "select 2;\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "GRO-01: Grocery list (#3)");
    const out = path.join(dir, "notes.md");
    const printed = execFileSync("node", [path.join(here, "release-notes.mjs"), "--out", out, "--date", "2026-11-25"], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: "", GITHUB_SHA: "", GITHUB_REPOSITORY: "example/app" } }).trim();
    expect(printed).toBe("v2026.11.25.1");
    const notes = readFileSync(out, "utf8");
    expect(notes).toContain("What changed since v2026.11.20.1");
    expect(notes).toContain("- Grocery list ([#3]");
    expect(notes).toContain("db/migrations/0002_second.sql");
    expect(notes).not.toContain("0001_first.sql");
    expect(notes).not.toContain("start");
  });
});

describe("release badge", () => {
  it("[AC-OPS-11.7] draws a release badge with the tag, and refuses anything that is not a release tag", async () => {
    const { releaseBadge, renderBadgeSvg } = await import("./badges-lib.mjs");
    const svg = renderBadgeSvg(releaseBadge("v2026.11.25.1"));
    expect(svg).toContain("release: v2026.11.25.1");
    expect(svg).toContain("#007ec6");
    expect(() => releaseBadge("badges")).toThrow(/Not a release tag/);
    expect(renderBadgeSvg(releaseBadge(null))).toContain("release: none yet");
  });
});
