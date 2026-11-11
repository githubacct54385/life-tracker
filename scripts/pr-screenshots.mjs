#!/usr/bin/env node
// Takes before/after screenshots of changed screens at 360, 768, and 1280 px, uploads them as release
// assets, and fills the Screenshots table in the pull request. No manual steps (ADR-0019, AGENTS.md).
//
//   pnpm pr-screenshots --pr 10 --screen "Home=/" [--screen "Name=/path" ...]
//   Options: --no-before  (skip building main; every screen is shown as new)
//            --dry-run    (write images to a local folder only; no upload, no pull request edit)
//
// Only synthetic data may ever be on screen: the app is served by `wrangler dev` with a synthetic owner
// token signed by a throwaway key (the same approach as the end-to-end tests), and the repo is public so
// the uploaded images are public too.

import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_TAG, VIEWPORTS, assetName, assetUrl, parseScreen, replaceScreenshotTable, screenshotTable } from "./pr-screenshots-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts });

function parseArgs(argv) {
  const out = { screens: [], before: true, dryRun: false, pr: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pr") out.pr = Number(argv[++i]);
    else if (a === "--screen") out.screens.push(parseScreen(argv[++i] ?? ""));
    else if (a === "--no-before") out.before = false;
    else if (a === "--dry-run") out.dryRun = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isInteger(out.pr) || out.pr < 1) throw new Error("--pr <number> is required");
  if (out.screens.length === 0) throw new Error('At least one --screen "Name=/path" is required');
  return out;
}

const KEY_PORT = 9098;
const AUDIENCE = "screenshots-synthetic-aud";
const OWNER_EMAIL = "owner@example.test";
const ACCESS_HEADER = "cf-access-jwt-assertion";

/** A throwaway key pair and a tiny server that publishes the public half where the Worker looks for Access's keys. */
async function startKeyServer(jose) {
  const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
  const kid = "screenshots-key";
  const publicJwk = { ...(await jose.exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
  const server = createServer((req, res) => {
    if (req.url === "/cdn-cgi/access/certs") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [publicJwk] }));
    } else res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(KEY_PORT, "127.0.0.1", resolve));
  const sign = () =>
    new jose.SignJWT({ email: OWNER_EMAIL })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(`http://localhost:${KEY_PORT}`)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 900)
      .sign(privateKey);
  return { sign, close: () => server.close() };
}

async function waitFor(url, ms = 60_000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    try {
      if ((await fetch(url, { redirect: "manual" })).status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start: ${url}`);
}

/** Serves a checked-out copy of the app with `wrangler dev`, runs `fn(baseUrl)`, then stops the server. */
async function withSite(treeRoot, port, fn) {
  const args = [
    "--filter", "@life-tracker/api", "exec", "wrangler", "dev", "--port", String(port),
    "--var", `ACCESS_TEAM_DOMAIN:localhost:${KEY_PORT}`, "--var", `ACCESS_AUD:${AUDIENCE}`, "--var", `OWNER_EMAIL:${OWNER_EMAIL}`,
  ];
  const child = spawn("pnpm", args, { cwd: treeRoot, detached: true, stdio: "ignore" });
  try {
    await waitFor(`http://127.0.0.1:${port}/`);
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    try {
      process.kill(-child.pid);
    } catch {
      /* already gone */
    }
  }
}

async function shoot(chromium, baseUrl, token, screens, outDir, pr, phase) {
  const browser = await chromium.launch();
  const found = {};
  try {
    for (const screen of screens) {
      found[screen.name] = {};
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await context.setExtraHTTPHeaders({ [ACCESS_HEADER]: token });
        const page = await context.newPage();
        const response = await page.goto(baseUrl + screen.path, { waitUntil: "commit" }).catch(() => null);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        // A missing page or a refusal means the screen is not there in this build.
        const missing = !response || response.status() >= 400;
        if (!missing) {
          const file = assetName(pr, screen.name, vp.key, phase);
          await page.screenshot({ path: path.join(outDir, file) });
          found[screen.name][vp.key] = file;
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return found;
}

function buildBefore() {
  console.log("Building main for the before screenshots...");
  run("git", ["fetch", "origin", "main"]);
  const work = mkdtempSync(path.join(tmpdir(), "pr-shots-main-"));
  const tree = path.join(work, "tree");
  run("git", ["worktree", "add", "--detach", tree, "origin/main"]);
  try {
    execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: tree, stdio: "ignore" });
    execFileSync("pnpm", ["--filter", "web", "build"], { cwd: tree, stdio: "ignore" });
  } catch (error) {
    run("git", ["worktree", "remove", "--force", tree]);
    throw error;
  }
  return { tree, work };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = createRequire(path.join(root, "web/package.json"))("@playwright/test");
  const outDir = mkdtempSync(path.join(tmpdir(), "pr-shots-out-"));
  const cleanup = [outDir];

  console.log("Building this branch for the after screenshots...");
  run("pnpm", ["--filter", "web", "build"]);

  const jose = createRequire(path.join(root, "web/package.json"))("jose");
  const keys = await startKeyServer(jose);
  const token = await keys.sign();

  let before = {};
  let after;
  let built;
  try {
    if (args.before) {
      built = buildBefore();
      cleanup.push(built.work);
      before = await withSite(built.tree, 4281, (url) => shoot(chromium, url, token, args.screens, outDir, args.pr, "before"));
    }
    after = await withSite(root, 4282, (url) => shoot(chromium, url, token, args.screens, outDir, args.pr, "after"));
  } finally {
    keys.close();
    if (built) run("git", ["worktree", "remove", "--force", built.tree]);
  }

  const missingAfter = args.screens.filter((s) => VIEWPORTS.some((v) => !after[s.name]?.[v.key]));
  if (missingAfter.length) throw new Error(`These screens did not load in this branch: ${missingAfter.map((s) => `${s.name} (${s.path})`).join(", ")}`);

  if (args.dryRun) {
    const keep = path.join(root, "web/test-results/pr-screenshots");
    mkdirSync(keep, { recursive: true });
    cpSync(outDir, keep, { recursive: true });
    console.log(`Dry run: images are in ${keep}. Nothing uploaded and the pull request was not changed.`);
    return;
  }

  const repo = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  try {
    run("gh", ["release", "view", RELEASE_TAG]);
  } catch {
    run("gh", ["release", "create", RELEASE_TAG, "--prerelease", "--latest=false", "--target", "main", "--title", "PR screenshots (temporary)", "--notes", "Images for open pull requests. Deleted automatically when the pull request closes. Synthetic demo data only."]);
  }

  const files = Object.values({ ...before, ...after }).flatMap((byViewport) => Object.values(byViewport)).map((f) => path.join(outDir, f));
  run("gh", ["release", "upload", RELEASE_TAG, "--clobber", ...files]);

  const toUrls = (found) => (found ? Object.fromEntries(Object.entries(found).map(([vp, file]) => [vp, assetUrl(repo, file)])) : null);
  const results = args.screens.map((s) => {
    const hasBefore = VIEWPORTS.every((v) => before[s.name]?.[v.key]);
    return { name: s.name, before: hasBefore ? toUrls(before[s.name]) : null, after: toUrls(after[s.name]) };
  });

  const body = run("gh", ["pr", "view", String(args.pr), "--json", "body", "-q", ".body"]);
  const bodyFile = path.join(outDir, "body.md");
  writeFileSync(bodyFile, replaceScreenshotTable(body, screenshotTable(results)));
  run("gh", ["pr", "edit", String(args.pr), "--body-file", bodyFile]);
  console.log(`Uploaded ${files.length} images and updated the Screenshots table in pull request #${args.pr}.`);
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(`pr-screenshots failed: ${error.message}`);
  process.exit(1);
});
