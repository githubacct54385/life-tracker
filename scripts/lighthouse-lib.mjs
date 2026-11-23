// Pure helpers for the Lighthouse check (OPS-10): the median of several runs, the budget and score checks, the
// installability check, and the Markdown for the job summary.

export function median(numbers) {
  if (numbers.length === 0) throw new Error("No numbers to take a median of");
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** One page's result from several runs: the median of each score and of the first-screen JavaScript size (in KB). */
export function summarize(runs) {
  return {
    scores: Object.fromEntries(Object.keys(runs[0].scores).map((category) => [category, median(runs.map((run) => run.scores[category]))])),
    javaScriptKB: median(runs.map((run) => run.javaScriptKB)),
    runs: runs.length,
  };
}

/** The reasons a page fails, as sentences with the numbers in them. An empty list is a pass. */
export function checkPage(name, summary, config) {
  const problems = [];
  for (const [category, minimum] of Object.entries(config.minimumScores)) {
    const score = summary.scores[category];
    if (score === undefined) problems.push(`${name}: no ${category} score was produced.`);
    else if (score < minimum) problems.push(`${name}: ${category} score is ${score}, under the minimum of ${minimum}.`);
  }
  const budget = config.budgets.firstScreenJavaScriptKB;
  if (summary.javaScriptKB > budget) problems.push(`${name}: the first screen loads ${summary.javaScriptKB} KB of JavaScript, over the budget of ${budget} KB (by ${Math.round((summary.javaScriptKB - budget) * 10) / 10} KB).`);
  return problems;
}

/**
 * Lighthouse 13 no longer has an installability audit, so this checks what a browser needs to offer "Add to Home Screen":
 * a linked manifest with a name, start URL, standalone display and 192 and 512 pixel icons (one maskable), icons that
 * exist, and a service worker file with a fetch handler.
 */
export function installabilityProblems({ html, manifest, files, serviceWorker }) {
  const problems = [];
  if (!/<link[^>]+rel=["']manifest["']/.test(html)) problems.push("The page does not link a web app manifest.");
  if (!manifest) return [...problems, "The manifest could not be read."];
  for (const key of ["name", "start_url", "display"]) if (!manifest[key]) problems.push(`The manifest has no ${key}.`);
  if (manifest.display && !["standalone", "fullscreen", "minimal-ui"].includes(manifest.display)) problems.push(`The manifest display is "${manifest.display}", not an installable mode.`);
  const icons = manifest.icons ?? [];
  for (const size of ["192x192", "512x512"]) if (!icons.some((icon) => icon.sizes?.split(" ").includes(size))) problems.push(`The manifest has no ${size} icon.`);
  if (!icons.some((icon) => icon.purpose?.split(" ").includes("maskable"))) problems.push("The manifest has no maskable icon.");
  for (const icon of icons) if (!files.has(icon.src)) problems.push(`The icon ${icon.src} cannot be loaded.`);
  if (!serviceWorker) problems.push("There is no service worker file.");
  else if (!/addEventListener\(\s*["']fetch["']/.test(serviceWorker)) problems.push("The service worker has no fetch handler.");
  return problems;
}

const score = (value) => String(Math.round(value));

/** Markdown for the job summary. */
export function renderSummary(results, config, installProblems, problems) {
  const lines = ["## Lighthouse (phone profile)", "", "| Page | Performance | Accessibility | Best practices | SEO | First-screen JavaScript | Budget |", "|---|---|---|---|---|---|---|"];
  for (const { name, summary } of results) {
    const s = summary.scores;
    lines.push(`| ${name} | ${score(s.performance)} | ${score(s.accessibility)} | ${score(s["best-practices"])} | ${score(s.seo)} | ${summary.javaScriptKB} KB | ${config.budgets.firstScreenJavaScriptKB} KB |`);
  }
  lines.push("", `Each number is the median of ${results[0]?.summary.runs ?? 0} runs. The minimum accessibility score is ${config.minimumScores.accessibility}.`);
  lines.push("", installProblems.length === 0 ? "**Installable:** yes (manifest, icons and service worker are in place)." : `**Installable:** no.\n${installProblems.map((p) => `- ${p}`).join("\n")}`);
  lines.push("", problems.length === 0 ? "**Result:** pass." : `**Result:** fail.\n${problems.map((p) => `- ${p}`).join("\n")}`);
  return `${lines.join("\n")}\n`;
}
