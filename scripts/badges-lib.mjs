// The coverage and Lighthouse badges (OPS-09, OPS-10). CI turns the numbers into two small SVG images and puts them on the
// "badges" release on every push to main. The README links to them directly. shields.io is not used for these two,
// because its endpoint badge refuses to read files from github.com ("domain is blocked").

const colour = (value, good, fair) => (value >= good ? "brightgreen" : value >= fair ? "yellow" : "red");

/** Lines covered by the unit tests of every package, as one number. The integration run is left out: it measures the same API code again. */
export function coverageBadge(coverage) {
  const sets = ["shared", "api", "web"].map((name) => coverage[name]).filter(Boolean);
  const total = sets.reduce((sum, set) => sum + set.linesTotal, 0);
  if (total === 0) throw new Error("No coverage numbers to build a badge from");
  const percent = (sets.reduce((sum, set) => sum + set.linesCovered, 0) / total) * 100;
  return { schemaVersion: 1, label: "coverage", message: `${Math.round(percent)}%`, color: colour(percent, 80, 60) };
}

/** The lowest of the page scores that matter most, shown as "performance 100, accessibility 100". */
export function lighthouseBadge(summary) {
  const pages = summary.pages ?? [];
  if (pages.length === 0) throw new Error("No Lighthouse results to build a badge from");
  const lowest = (category) => Math.min(...pages.map((page) => page.scores[category]));
  const performance = lowest("performance");
  const accessibility = lowest("accessibility");
  return { schemaVersion: 1, label: "lighthouse", message: `performance ${performance}, accessibility ${accessibility}`, color: colour(Math.min(performance, accessibility), 90, 50) };
}

const COLOURS = { brightgreen: "#4c1", yellow: "#dfb317", red: "#e05d44" };
const escapeXml = (text) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const textWidth = (text) => Math.ceil(text.length * 6.6) + 10; // a close estimate for 11 px Verdana, good enough for a badge

/** A flat badge image: a grey label on the left and a coloured message on the right. */
export function renderBadgeSvg({ label, message, color }) {
  const left = textWidth(label);
  const right = textWidth(message);
  const width = left + right;
  const fill = COLOURS[color] ?? COLOURS.red;
  const words = `${label}: ${message}`;
  const id = `clip-${label.replace(/[^a-z0-9]/gi, "")}`; // unique per badge, so two badges on one page do not clash
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(words)}">
<title>${escapeXml(words)}</title>
<clipPath id="${id}"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#${id})"><rect width="${left}" height="20" fill="#555"/><rect x="${left}" width="${right}" height="20" fill="${fill}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${left / 2}" y="14">${escapeXml(label)}</text>
<text x="${left + right / 2}" y="14">${escapeXml(message)}</text>
</g>
</svg>
`;
}

const PARTS = { shared: "Shared rules (used by the app and the server)", api: "The server, unit tests", "api-int": "The server with a real database", web: "The app screens" };
const pct = (n) => `${n.toFixed(1)}%`;

/**
 * A short plain-English page for the "Project health" release, which is where the README badges lead. It explains what
 * each number means, shows today's figures, and says what the minimums are. `details` is { commit, runUrl, repoUrl, date }.
 */
export function renderHealthReport({ coverage, lighthouse, minimums, budgetKB, details }) {
  const overall = coverageBadge(coverage).message;
  const low = (category) => Math.min(...lighthouse.pages.map((page) => page.scores[category]));
  const lines = [
    "# Project health",
    "",
    `Updated automatically after every change that passes all the checks and lands on \`main\`. Last update: ${details.date}, change \`${details.commit.slice(0, 7)}\`.`,
    "",
    `## Test coverage: ${overall} of the code is run by the tests`,
    "",
    "Coverage is the share of the program's lines that the automated tests run. The higher it is, the safer it is to change the app without breaking something. Reaching 100% is not the goal. The goal is that the number never drops without a reason: each part below has a lowest allowed value, and a change that goes under it is stopped.",
    "",
    "| Part | Lines tested | Branches tested | Lowest allowed (lines / branches) |",
    "|---|---|---|---|"
  ];
  for (const [name, set] of Object.entries(coverage)) lines.push(`| ${PARTS[name] ?? name} | ${pct(set.lines)} | ${pct(set.branches)} | ${minimums[name] ? `${minimums[name].lines}% / ${minimums[name].branches}%` : "none"} |`);
  lines.push("", `The tests that drive the app in a real browser are not counted here. They check behaviour: see [what the browser tests check](${details.repoUrl}/blob/main/docs/what-the-browser-tests-check.md).`, "");
  lines.push(`## Lighthouse: performance ${low("performance")}, accessibility ${low("accessibility")}`, "", "Lighthouse is Google's automatic check of a page on a phone: how fast it loads (performance), whether people with disabilities can use it (accessibility), good web practice, and search readiness. Each score is out of 100. A change that drops accessibility under 95, or loads more JavaScript than the budget, is stopped.", "");
  lines.push("| Page | Performance | Accessibility | Best practices | Search | JavaScript on first load | Budget |", "|---|---|---|---|---|---|---|");
  for (const page of lighthouse.pages) lines.push(`| ${page.name} | ${page.scores.performance} | ${page.scores.accessibility} | ${page.scores["best-practices"]} | ${page.scores.seo} | ${page.javaScriptKB} KB | ${budgetKB} KB |`);
  lines.push("", `For the full reports of this run, open [the CI run](${details.runUrl}) and scroll to **Artifacts** at the bottom.`, "");
  return lines.join("\n");
}
