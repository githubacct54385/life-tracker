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

describe("parseScreensLine", () => {
  it("[AC-OPS-05.1] reads the screens from a Screens line anywhere in the body, separated by commas or semicolons", async () => {
    const { parseScreensLine } = await import("./pr-screenshots-lib.mjs");
    const body = "## Story\n\nSomething.\n\n## Screenshots\n\nScreens: Home=/, Log odometer=/car/log; Settings=/settings\n\n| Screen |\n|---|\n";
    expect(parseScreensLine(body)).toEqual({
      screens: [
        { name: "Home", path: "/" },
        { name: "Log odometer", path: "/car/log" },
        { name: "Settings", path: "/settings" },
      ],
      problems: [],
    });
    expect(parseScreensLine("screens: Car=/car\r\nnext").screens).toEqual([{ name: "Car", path: "/car" }]);
  });

  it("[AC-OPS-05.1] no line, an empty line, or no body means no screens and no problems", async () => {
    const { parseScreensLine } = await import("./pr-screenshots-lib.mjs");
    for (const body of ["", null, undefined, "## Screenshots\n\nNo UI change\n", "Screens:", "Screens:   \n"]) {
      expect(parseScreensLine(body), String(body)).toEqual({ screens: [], problems: [] });
    }
  });

  it("[AC-OPS-05.1] a malformed entry is reported and the good ones are kept", async () => {
    const { parseScreensLine } = await import("./pr-screenshots-lib.mjs");
    const result = parseScreensLine("Screens: Home=/, Broken, =/x, NoSlash=car, Car=/car");
    expect(result.screens).toEqual([{ name: "Home", path: "/" }, { name: "Car", path: "/car" }]);
    expect(result.problems).toHaveLength(3);
    expect(result.problems[0]).toContain("Name=/path");
  });
});

describe("imageFiles", () => {
  it("[AC-OPS-05.2] lists the before and the after images of every screen, so both are uploaded", async () => {
    const { imageFiles, assetName } = await import("./pr-screenshots-lib.mjs");
    const viewports = ["mobile", "tablet", "desktop"];
    const found = (phase) => Object.fromEntries(["Home", "Car"].map((name) => [name, Object.fromEntries(viewports.map((v) => [v, assetName(74, name, v, phase)]))]));
    const files = imageFiles(found("before"), found("after"));
    expect(files).toHaveLength(12);
    expect(files.filter((f) => f.endsWith("-before.png"))).toHaveLength(6);
    expect(files.filter((f) => f.endsWith("-after.png"))).toHaveLength(6);
    expect(new Set(files).size).toBe(12);
  });

  it("[AC-OPS-05.2] a screen that has no before (it is new) just has its after images, and a missing before is fine", async () => {
    const { imageFiles } = await import("./pr-screenshots-lib.mjs");
    expect(imageFiles({}, { New: { mobile: "a.png" } })).toEqual(["a.png"]);
    expect(imageFiles(undefined, { New: { mobile: "a.png" } })).toEqual(["a.png"]);
  });
});
