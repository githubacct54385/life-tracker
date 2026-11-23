// Builds a plain-English list of what the automated tests check (OPS-12), from the test names in the code.
// Nothing here is kept by hand: a test is listed because its name is in a test file, so the list cannot drift.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ID = "AC-[A-Z]+-\\d{2}\\.\\d+";
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "test-results", "playwright-report", ".swa"]);
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
// it("name", ...), test("name", ...), test.skip("name", ...), it.each(table)("name", ...). Names may be ', " or ` strings.
const TEST_CALL = /^[ \t]*(?:it|test)(?:\.(?:skip|only|fails|concurrent))*(?:\.each\((?:[^()]|\([^()]*\))*\))?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/gm;

/** All test files under `root`, as paths relative to it. */
export function findTestFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (TEST_FILE.test(entry.name)) found.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(root);
  return found.sort();
}

/** Which kind of test a file holds: end-to-end (browser), integration (real database) or unit. */
export function levelOf(file) {
  if (/(^|\/)e2e\//.test(file) || /\.spec\.[a-z]+$/.test(file)) return "end-to-end";
  if (/\.int\.test\./.test(file)) return "integration";
  return "unit";
}

/** The IDs at the start of a test name, and the sentence that follows them. */
export function splitName(name) {
  const ids = [];
  let rest = name.trim();
  for (let m = new RegExp(`^\\[(${ID})\\]\\s*`).exec(rest); m; m = new RegExp(`^\\[(${ID})\\]\\s*`).exec(rest)) {
    ids.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { ids, text: rest };
}

/** Every test in one file's text. */
export function testsInText(text, file) {
  const tests = [];
  for (const m of text.matchAll(TEST_CALL)) {
    const name = m[2].replace(/\\(["'`\\])/g, "$1");
    const { ids, text: sentence } = splitName(name);
    tests.push({ file, level: levelOf(file), name, ids, text: sentence });
  }
  return tests;
}

export function collectTests(root) {
  return findTestFiles(root).flatMap((file) => testsInText(readFileSync(path.join(root, file), "utf8"), file));
}

const storyOf = (id) => id.replace(/^AC-/, "").replace(/\.\d+$/, "");
const areaOf = (id) => storyOf(id).split("-")[0];

/** Does a test match the filter? A filter is an area (GRO), a story (GRO-02) or a criterion (AC-GRO-02.4), or "none" for tests with no ID. */
export function matchesFilter(test, filter) {
  if (!filter) return true;
  const f = filter.toUpperCase();
  if (f === "NONE") return test.ids.length === 0;
  return test.ids.some((id) => id === f || id.startsWith(`${f}.`) || id.startsWith(`AC-${f}.`) || areaOf(id) === f || storyOf(id) === f.replace(/^AC-/, ""));
}

const shellQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const regexEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The command that runs only this test, through scripts/run-tests.sh (or vitest directly for the scripts folder). */
export function runCommand(test) {
  // A table-driven name ("%s", "$name") is only known up to the placeholder, so match that start.
  const stable = test.name.split(/%[a-z]|\$\{?\w+\}?/)[0] ?? test.name;
  const pattern = shellQuote(regexEscape(stable.trimEnd()));
  const [pkg, ...rest] = test.file.split("/");
  const inside = rest.join("/");
  if (test.level === "end-to-end") return `scripts/run-tests.sh e2e ${inside} -g ${pattern}`;
  if (pkg === "scripts") return `pnpm exec vitest run --root scripts ${inside} -t ${pattern}`;
  if (test.level === "integration") return `scripts/run-tests.sh int ${pkg} ${inside} -t ${pattern}`;
  return `scripts/run-tests.sh unit ${pkg} ${inside} -t ${pattern}`;
}

/** Groups tests by area, then story, then criterion. A test that names several criteria appears under each. Tests with no ID go last. */
export function group(tests) {
  const tree = new Map();
  const none = [];
  for (const test of tests) {
    if (test.ids.length === 0) {
      none.push(test);
      continue;
    }
    for (const id of test.ids) {
      const area = areaOf(id);
      const story = storyOf(id);
      if (!tree.has(area)) tree.set(area, new Map());
      const stories = tree.get(area);
      if (!stories.has(story)) stories.set(story, new Map());
      const criteria = stories.get(story);
      if (!criteria.has(id)) criteria.set(id, []);
      criteria.get(id).push(test);
    }
  }
  return { tree, none };
}

const sortKeys = (map) => [...map.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

/** The list as text (plain) or Markdown (for the CI job summary). `commands` adds the run command under each test. */
export function render(tests, { filter, markdown = false, commands = false } = {}) {
  const shown = tests.filter((t) => matchesFilter(t, filter));
  const { tree, none } = group(shown);
  const lines = [];
  const h = (level, text) => lines.push(markdown ? `${"#".repeat(level)} ${text}` : level === 1 ? `${text}\n${"=".repeat(text.length)}` : level === 2 ? `\n${text.toUpperCase()}` : `\n${text}`);
  const entry = (test) => {
    lines.push(markdown ? `- ${test.text} _(${test.level}, \`${test.file}\`)_` : `  - ${test.text}  [${test.level}, ${test.file}]`);
    if (commands) lines.push(markdown ? `  \`${runCommand(test)}\`` : `      ${runCommand(test)}`);
  };
  h(1, `What the automated tests check${filter ? ` (${filter})` : ""}`);
  lines.push(`${shown.length} tests${filter ? ` match` : ""}. Built from the test names, so it is always current.`);
  for (const area of sortKeys(tree)) {
    h(2, `Area ${area}`);
    const stories = tree.get(area);
    for (const story of sortKeys(stories)) {
      h(3, story);
      const criteria = stories.get(story);
      for (const id of sortKeys(criteria)) {
        lines.push(markdown ? `**${id}**` : `${id}`);
        for (const test of criteria.get(id)) entry(test);
      }
    }
  }
  if (none.length > 0) {
    h(2, `Tests with no acceptance criterion (${none.length})`);
    const byFile = new Map();
    for (const test of none) byFile.set(test.file, [...(byFile.get(test.file) ?? []), test]);
    for (const file of sortKeys(byFile)) {
      lines.push(markdown ? `**${file}**` : file);
      for (const test of byFile.get(file)) entry(test);
    }
  }
  return `${lines.join("\n")}\n`;
}
