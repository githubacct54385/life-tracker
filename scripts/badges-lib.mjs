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
