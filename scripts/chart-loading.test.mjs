import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// OPS-13: the chart library is large, so a page that draws a chart must be loaded only when it is opened.
const src = path.join(process.cwd(), "web", "src");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("chart code loading", () => {
  const files = sourceFiles(src).map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const chartFiles = files.filter(({ text }) => /from\s+["']recharts["']/.test(text));
  const base = (file) => path.basename(file).replace(/\.tsx?$/, "");

  it("[AC-OPS-13.1] finds the files that import the chart library, so the check below is not empty", () => {
    expect(chartFiles.length).toBeGreaterThanOrEqual(4);
  });

  it("[AC-OPS-13.1] every file that imports the chart library is reached only through a lazy import", () => {
    for (const { file } of chartFiles) {
      const name = base(file);
      for (const other of files) {
        if (other.file === file) continue;
        const importsIt = new RegExp(`from\\s+["'][^"']*/${name}["']`).test(other.text);
        expect(importsIt, `${path.relative(src, other.file)} imports ${name} directly. Use lazy(() => import("./${name}")).`).toBe(false);
      }
    }
  });

  it("[AC-OPS-13.1] the lazy imports exist, so the check above is not passing because nothing imports the chart files", () => {
    for (const { file } of chartFiles) {
      const name = base(file);
      expect(files.some((other) => new RegExp(`import\\(["'][^"']*/${name}["']\\)`).test(other.text)), `${name} is never loaded`).toBe(true);
    }
  });
});
