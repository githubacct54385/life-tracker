// Pure helpers for scripts/pr-screenshots.mjs. No network, no file system, so they are unit tested.

export const VIEWPORTS = [
  { key: "mobile", label: "Mobile (360 px)", width: 360, height: 740, shown: 140, large: 360 },
  { key: "tablet", label: "Tablet (768 px)", width: 768, height: 1024, shown: 200, large: 420 },
  { key: "desktop", label: "Desktop (1280 px)", width: 1280, height: 800, shown: 280, large: 860, stacked: true },
];

export const RELEASE_TAG = "pr-screenshots";

/** The loading placeholder every page uses (web/src/ui/Skeleton.tsx). While one is on screen the page is not ready to photograph. */
export const LOADING_SELECTOR = ".lt-skeleton";

/**
 * Waits until a page shows its real content: the network is quiet, no loading placeholder is on screen, and fonts are ready.
 * The placeholder check runs twice, a moment apart, because a lazily loaded part can start loading just after the first look.
 * Returns a list of problems (empty when the page settled). It never throws, so a stuck page is reported and still photographed.
 */
export async function waitForContent(page, { timeout = 15_000, settleMs = 250 } = {}) {
  const problems = [];
  const attempt = async (what, run) => {
    try {
      await run();
    } catch {
      problems.push(what);
    }
  };
  await attempt("the network did not go quiet", () => page.waitForLoadState("networkidle", { timeout }));
  for (let look = 0; look < 2; look++) {
    await attempt("a loading placeholder was still on screen", () => page.waitForSelector(LOADING_SELECTOR, { state: "detached", timeout }));
    await attempt("fonts were not ready", () => page.evaluate(() => document.fonts?.ready));
    await page.waitForTimeout(settleMs);
  }
  return problems;
}

export function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "screen";
}

/** Release asset name. The `pr-<number>-` prefix is what the cleanup workflow deletes by. */
export function assetName(pr, screenName, viewportKey, phase) {
  return `pr-${pr}-${slugify(screenName)}-${viewportKey}-${phase}.png`;
}

export function assetUrl(repo, name) {
  return `https://github.com/${repo}/releases/download/${RELEASE_TAG}/${name}`;
}

/** Parses "Name=/path" into { name, path }. */
export function parseScreen(text) {
  const i = text.indexOf("=");
  const name = i > 0 ? text.slice(0, i).trim() : "";
  const path = i > 0 ? text.slice(i + 1).trim() : "";
  if (!name || !path.startsWith("/")) throw new Error(`--screen must look like "Name=/path", got: ${text}`);
  return { name, path };
}

/**
 * Reads the screens a pull request names, from a line such as `Screens: Home=/, Car=/car` anywhere in its body.
 * Returns { screens, problems }: every entry that parses, and a message for each one that does not. No line, or an
 * empty one, gives no screens and no problems (the pull request just has no screenshots to take).
 */
export function parseScreensLine(body) {
  const line = (body ?? "").replace(/\r\n/g, "\n").split("\n").find((l) => /^\s*Screens:/i.test(l));
  if (!line) return { screens: [], problems: [] };
  const entries = line.replace(/^\s*Screens:/i, "").split(/[,;]/).map((e) => e.trim()).filter(Boolean);
  const screens = [];
  const problems = [];
  for (const entry of entries) {
    try {
      screens.push(parseScreen(entry));
    } catch {
      problems.push(`Could not read "${entry}". Write each screen as Name=/path.`);
    }
  }
  return { screens, problems };
}

/**
 * Every image to upload, from the "before" and "after" results ({ screenName: { viewportKey: fileName } }).
 * Both are listed. (Merging them into one object would let "after" overwrite "before", because both are keyed by screen
 * name, and the before images would never be uploaded.)
 */
export function imageFiles(before, after) {
  return [before, after].flatMap((found) => Object.values(found ?? {})).flatMap((byViewport) => Object.values(byViewport));
}

// A thumbnail is a plain image, not a link. The files are release assets, which GitHub serves as downloads, so a link
// around the image made a click download the file instead of showing it. The larger views below show the same images
// at a readable size, and each has its own Download link.
function cell(viewport, url) {
  if (!url) return "new screen, no before";
  return `<img src="${url}" width="${viewport.shown}" alt="">`;
}

/**
 * results: [{ name, before: { mobile: url|null, ... }, after: { mobile: url, ... } }]
 * A null `before` means the screen did not exist on main.
 */
export function screenshotTable(results) {
  const lines = [`| Screen | ${VIEWPORTS.map((v) => v.label).join(" | ")} |`, `|---|${VIEWPORTS.map(() => "---").join("|")}|`];
  for (const r of results) {
    for (const phase of ["before", "after"]) {
      lines.push(`| ${r.name}: ${phase} | ${VIEWPORTS.map((v) => cell(v, r[phase]?.[v.key])).join(" | ")} |`);
    }
  }
  return lines.join("\n");
}

export const BLOCK_START = "<!-- screenshots:start -->";
export const BLOCK_END = "<!-- screenshots:end -->";

function picture(label, url, width) {
  return `<img src="${url}" width="${width}" alt="${label}"><br><a href="${url}">Download</a>`;
}

/** One expandable section per screen: every image at a readable size, before and after, with a Download link under each. */
export function largerViews(results) {
  const blocks = [];
  for (const r of results) {
    const lines = ["<details>", `<summary>${r.name}: see the images larger, or download them</summary>`];
    for (const v of VIEWPORTS) {
      const before = r.before?.[v.key];
      const after = r.after?.[v.key];
      lines.push(`<h4>${v.label}</h4>`);
      const cells = [["Before", before], ["After", after]].map(([phase, url]) => [phase, url ? picture(`${r.name}, ${v.label}, ${phase.toLowerCase()}`, url, v.large) : "New screen, no before"]);
      if (v.stacked) {
        for (const [phase, html] of cells) lines.push(`<p><b>${phase}</b><br>${html}</p>`);
      } else {
        lines.push("<table><tr>" + cells.map(([phase]) => `<th>${phase}</th>`).join("") + "</tr><tr>" + cells.map(([, html]) => `<td valign="top">${html}</td>`).join("") + "</tr></table>");
      }
    }
    lines.push("</details>");
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

/** Everything that goes under "## Screenshots": the small table, then the larger views. It is wrapped in markers, so a re-run replaces it whole. */
export function screenshotBlock(results) {
  return [BLOCK_START, "", screenshotTable(results), "", largerViews(results), "", BLOCK_END].join("\n");
}

/** Replaces the generated block under "## Screenshots" (found by its markers), or else the first table there (or adds one under the heading). Everything else is kept. */
export function replaceScreenshotTable(body, table) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const heading = lines.findIndex((l) => /^##\s+Screenshots\s*$/.test(l));
  if (heading === -1) throw new Error('The pull request body has no "## Screenshots" section.');
  const next = lines.findIndex((l, i) => i > heading && /^##\s/.test(l));
  const end = next === -1 ? lines.length : next;
  const first = lines.findIndex((l, i) => i > heading && i < end && l.trim() === BLOCK_START);
  const last = lines.findIndex((l, i) => i > first && i < end && l.trim() === BLOCK_END);
  if (first !== -1 && last !== -1) return [...lines.slice(0, first), table, ...lines.slice(last + 1)].join("\n");
  let start = -1;
  let stop = -1;
  for (let i = heading + 1; i < end; i++) {
    if (lines[i].startsWith("|")) {
      if (start === -1) start = i;
      stop = i + 1;
    } else if (start !== -1) break;
  }
  if (start === -1) {
    // No table yet: place it right after the heading's comment block, or the heading itself.
    let at = heading + 1;
    if (lines[at]?.trim().startsWith("<!--")) {
      while (at < end && !lines[at].includes("-->")) at++;
      at++;
    }
    return [...lines.slice(0, at), "", table, ...lines.slice(at)].join("\n");
  }
  return [...lines.slice(0, start), table, ...lines.slice(stop)].join("\n");
}
