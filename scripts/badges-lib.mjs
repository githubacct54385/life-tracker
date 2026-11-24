// The small JSON files behind the coverage and Lighthouse badges (OPS-09, OPS-10). shields.io reads them in its
// "endpoint" format: { schemaVersion, label, message, color }. CI writes them on every push to main.

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
