// Pure helpers for scripts/pr-screenshots.mjs. No network, no file system, so they are unit tested.

export const VIEWPORTS = [
  { key: "mobile", label: "Mobile (360 px)", width: 360, height: 740, shown: 110 },
  { key: "tablet", label: "Tablet (768 px)", width: 768, height: 1024, shown: 150 },
  { key: "desktop", label: "Desktop (1280 px)", width: 1280, height: 800, shown: 220 },
];

export const RELEASE_TAG = "pr-screenshots";

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

function cell(viewport, url) {
  if (!url) return "new screen, no before";
  return `<a href="${url}"><img src="${url}" width="${viewport.shown}" alt=""></a>`;
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

/** Replaces the first table under "## Screenshots" (or adds one under the heading). Everything else is kept. */
export function replaceScreenshotTable(body, table) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const heading = lines.findIndex((l) => /^##\s+Screenshots\s*$/.test(l));
  if (heading === -1) throw new Error('The pull request body has no "## Screenshots" section.');
  const next = lines.findIndex((l, i) => i > heading && /^##\s/.test(l));
  const end = next === -1 ? lines.length : next;
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
