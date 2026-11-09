import { describe, expect, it } from "vitest";
import { assetName, parseScreen, replaceScreenshotTable, screenshotTable, slugify } from "./pr-screenshots-lib.mjs";

describe("pr-screenshots helpers", () => {
  it("builds asset names that start with the pull request number", () => {
    expect(assetName(10, "Access denied", "mobile", "after")).toBe("pr-10-access-denied-mobile-after.png");
    expect(slugify("  !!  ")).toBe("screen");
  });

  it("does not let one pull request's prefix match another's", () => {
    expect(assetName(1, "x", "mobile", "after").startsWith("pr-1-")).toBe(true);
    expect(assetName(10, "x", "mobile", "after").startsWith("pr-1-")).toBe(false);
  });

  it("parses --screen values and rejects bad ones", () => {
    expect(parseScreen("Money list=/money")).toEqual({ name: "Money list", path: "/money" });
    expect(() => parseScreen("no-path")).toThrow();
    expect(() => parseScreen("Name=money")).toThrow();
  });

  const results = [
    {
      name: "Access denied",
      before: null,
      after: { mobile: "https://x/m.png", tablet: "https://x/t.png", desktop: "https://x/d.png" },
    },
  ];

  it("marks a screen that did not exist on main", () => {
    const table = screenshotTable(results);
    expect(table).toContain("| Access denied: before | new screen, no before | new screen, no before | new screen, no before |");
    expect(table).toContain('<img src="https://x/m.png" width="110"');
  });

  const body = [
    "## Story",
    "FND-99",
    "",
    "## Screenshots",
    "",
    "<!-- keep this comment -->",
    "",
    "| Screen | Mobile (360 px) |",
    "|---|---|",
    "| | before / after |",
    "",
    "## Acceptance criteria",
    "- AC-X",
  ].join("\n");

  it("replaces only the table under Screenshots", () => {
    const out = replaceScreenshotTable(body, "| NEW |\n|---|");
    expect(out).toContain("| NEW |");
    expect(out).not.toContain("before / after");
    expect(out).toContain("<!-- keep this comment -->");
    expect(out).toContain("## Acceptance criteria\n- AC-X");
  });

  it("is repeatable: running twice gives the same body", () => {
    const once = replaceScreenshotTable(body, screenshotTable(results));
    expect(replaceScreenshotTable(once, screenshotTable(results))).toBe(once);
  });

  it("adds a table when the section has none, and fails clearly when the section is missing", () => {
    const bare = "## Screenshots\n\nNo UI change\n\n## Next\n";
    expect(replaceScreenshotTable(bare, "| T |")).toContain("| T |");
    expect(() => replaceScreenshotTable("## Other\n", "| T |")).toThrow(/Screenshots/);
  });
});
