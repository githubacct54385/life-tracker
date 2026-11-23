#!/usr/bin/env node
// Runs Lighthouse against the built web app (OPS-10): serves web/dist on a local port, opens the demo in the same
// Chromium that Playwright installed, and checks scores, the JavaScript budget and installability.
//
//   pnpm build && node scripts/lighthouse.mjs [--markdown <file>]
//
// Reports (HTML and JSON) go to lighthouse-reports/. Exit code 1 means a check failed.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { createGzip } from "node:zlib";
import { createRequire } from "node:module";
import path from "node:path";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { checkPage, installabilityProblems, renderSummary, summarize } from "./lighthouse-lib.mjs";

const root = process.cwd();
const dist = path.join(root, "web", "dist");
const config = JSON.parse(readFileSync(path.join(root, "lighthouse.config.json"), "utf8"));
const args = process.argv.slice(2);
const markdownFile = args.includes("--markdown") ? args[args.indexOf("--markdown") + 1] : undefined;
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("web/dist is missing. Run `pnpm build` first.");
  process.exit(1);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const server = createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  let file = path.join(dist, urlPath);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, "index.html"); // single-page app fallback
  const type = TYPES[path.extname(file)] ?? "application/octet-stream";
  // Compress text the way Cloudflare does in production, so the sizes measured are the sizes a visitor downloads.
  const compress = /^text\/|json|javascript|svg/.test(type) && /gzip/.test(request.headers["accept-encoding"] ?? "");
  response.writeHead(200, { "content-type": type, "cache-control": "no-cache", ...(compress ? { "content-encoding": "gzip" } : {}) });
  if (compress) createReadStream(file).pipe(createGzip()).pipe(response);
  else createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const chromePath = process.env.CHROME_PATH ?? createRequire(path.join(root, "web", "package.json"))("@playwright/test").chromium.executablePath();
const chrome = await launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });

async function runOnce(url) {
  const result = await lighthouse(url, { port: chrome.port, output: ["json", "html"], logLevel: "error" }, undefined);
  const lhr = result.lhr;
  const scripts = (lhr.audits["network-requests"]?.details?.items ?? []).filter((item) => item.resourceType === "Script");
  const bytes = scripts.reduce((sum, item) => sum + (item.transferSize ?? 0), 0);
  return {
    scores: Object.fromEntries(Object.entries(lhr.categories).map(([id, category]) => [id, Math.round((category.score ?? 0) * 100)])),
    javaScriptKB: Math.round((bytes / 1024) * 10) / 10,
    report: result.report,
  };
}

mkdirSync(path.join(root, "lighthouse-reports"), { recursive: true });
const results = [];
const problems = [];
try {
  for (const page of config.pages) {
    // Median of several runs, and one retry of the whole set before a failure counts (AC-OPS-10.5).
    let summary;
    let pageProblems = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const runs = [];
      for (let i = 0; i < config.runs; i += 1) runs.push(await runOnce(`${base}${page.path}`));
      summary = summarize(runs);
      pageProblems = checkPage(page.name, summary, config);
      writeFileSync(path.join(root, "lighthouse-reports", `${page.name.toLowerCase()}.html`), runs[runs.length - 1].report[1]);
      writeFileSync(path.join(root, "lighthouse-reports", `${page.name.toLowerCase()}.json`), runs[runs.length - 1].report[0]);
      if (pageProblems.length === 0) break;
      if (attempt === 1) console.log(`${page.name}: a check failed, running once more in case it was a fluke.`);
    }
    results.push({ name: page.name, summary });
    problems.push(...pageProblems);
  }
} finally {
  await chrome.kill();
}

// Installability (Lighthouse 13 has no audit for it).
const html = await (await fetch(`${base}/`)).text();
const manifestResponse = await fetch(`${base}/manifest.webmanifest`);
const manifest = manifestResponse.ok ? await manifestResponse.json().catch(() => undefined) : undefined;
const files = new Set();
for (const icon of manifest?.icons ?? []) if ((await fetch(`${base}${icon.src}`)).ok) files.add(icon.src);
const swResponse = await fetch(`${base}/sw.js`);
const installProblems = installabilityProblems({ html, manifest, files, serviceWorker: swResponse.ok ? await swResponse.text() : undefined });
problems.push(...installProblems.map((p) => `Installability: ${p}`));
server.close();

const text = renderSummary(results, config, installProblems, problems);
console.log(text);
if (markdownFile) appendFileSync(markdownFile, text);
process.exit(problems.length === 0 ? 0 : 1);
