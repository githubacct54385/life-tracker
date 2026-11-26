import { describe, expect, it } from "vitest";
import { LOADING_SELECTOR, assetName, waitForContent, largerViews, parseScreen, replaceScreenshotTable, screenshotBlock, screenshotTable, slugify } from "./pr-screenshots-lib.mjs";

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
    expect(table).toContain('<img src="https://x/m.png" width="140"');
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

  it("is repeatable: running twice gives the same body, and a changed result replaces the whole block", () => {
    const once = replaceScreenshotTable(body, screenshotBlock(results));
    expect(replaceScreenshotTable(once, screenshotBlock(results))).toBe(once);
    const changed = [{ ...results[0], name: "Renamed" }];
    const twice = replaceScreenshotTable(once, screenshotBlock(changed));
    expect(twice).toContain("Renamed: before");
    expect(twice).not.toContain("Access denied");
    expect(twice.match(/<!-- screenshots:start -->/g)).toHaveLength(1);
    expect(twice).toContain("## Acceptance criteria\n- AC-X");
  });

  it("thumbnails are plain images, not links, so a click does not download the file", () => {
    const table = screenshotTable([{ ...results[0], before: { mobile: "https://x/bm.png" } }]);
    expect(table).not.toContain("<a ");
    expect(table).toContain('<img src="https://x/bm.png" width="140" alt="">');
  });

  it("shows each image larger, before and after, with a Download link for every image", () => {
    const html = largerViews([{ ...results[0], before: { mobile: "https://x/bm.png", tablet: "https://x/bt.png", desktop: "https://x/bd.png" } }]);
    expect(html).toContain("<details>");
    expect(html).toContain('<img src="https://x/bm.png" width="360"');
    expect(html).toContain('<img src="https://x/t.png" width="420"');
    expect(html).toContain('<img src="https://x/d.png" width="860"');
    expect(html.match(/>Download<\/a>/g)).toHaveLength(6);
    expect(largerViews(results)).toContain("New screen, no before");
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

  describe("waiting for the real content", () => {
    const fakePage = (failing = []) => {
      const calls = [];
      const run = (name) => async () => {
        calls.push(name);
        if (failing.includes(name)) throw new Error("timeout");
      };
      return {
        calls,
        waitForLoadState: run("network"),
        waitForSelector: async (selector, options) => {
          calls.push(`selector:${selector}:${options.state}`);
          if (failing.includes("placeholder")) throw new Error("timeout");
        },
        evaluate: run("fonts"),
        waitForTimeout: run("settle"),
      };
    };

    it("[AC-OPS-05.6] waits for the network, for every loading placeholder to go, and for fonts, before the photo", async () => {
      const page = fakePage();
      expect(await waitForContent(page, { settleMs: 0 })).toEqual([]);
      expect(page.calls[0]).toBe("network");
      expect(page.calls).toContain(`selector:${LOADING_SELECTOR}:detached`);
      expect(page.calls).toContain("fonts");
    });

    it("[AC-OPS-05.6] looks for a placeholder twice, because a lazily loaded part can start loading just after the first look", async () => {
      const page = fakePage();
      await waitForContent(page, { settleMs: 0 });
      expect(page.calls.filter((c) => c.startsWith("selector:"))).toHaveLength(2);
    });

    it("[AC-OPS-05.6] a page that never settles is reported, not thrown, so the screenshot is still taken", async () => {
      const problems = await waitForContent(fakePage(["placeholder", "network"]), { settleMs: 0 });
      expect(problems).toContain("a loading placeholder was still on screen");
      expect(problems).toContain("the network did not go quiet");
    });

    it("[AC-OPS-05.6] the placeholder selector matches the app's real loading placeholder", async () => {
      const { readFileSync } = await import("node:fs");
      expect(readFileSync("web/src/ui/Skeleton.tsx", "utf8")).toContain(LOADING_SELECTOR.replace(".", ""));
    });
  });
});
