#!/usr/bin/env node
// Takes before/after screenshots of changed screens at 360, 768, and 1280 px, uploads them as release
// assets, and fills the Screenshots table in the pull request. No manual steps (ADR-0019, AGENTS.md).
//
//   pnpm pr-screenshots --pr 10 --screen "Home=/" [--screen "Name=/path" ...]
//   pnpm pr-screenshots --pr 10 --from-body      (the screens come from a `Screens: Home=/, Car=/car` line in the PR body)
//   Options: --no-before  (skip building main; every screen is shown as new)
//            --dry-run    (write images to a local folder only; no upload, no pull request edit)
//   Browser: set PR_SCREENSHOTS_CHROMIUM to the path of a Chromium if Playwright's own is not installed.
//
// GitHub Actions runs this with --from-body for every pull request that has a Screens line (.github/workflows/pr-screenshots.yml),
// so nobody has to run it by hand. It uses GitHub's REST API only (`gh api`), because GraphQL is blocked in some environments.
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
import { RELEASE_TAG, VIEWPORTS, assetName, assetUrl, imageFiles, parseScreen, parseScreensLine, replaceScreenshotTable, screenshotBlock, waitForContent } from "./pr-screenshots-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts });

/** "owner/name" without GraphQL: from the Actions environment, GH_REPO, or the origin remote. */
function repoSlug() {
  const fromEnv = process.env.GITHUB_REPOSITORY || process.env.GH_REPO;
  if (fromEnv) return fromEnv;
  const url = run("git", ["remote", "get-url", "origin"]).trim();
  // Works for github.com URLs and for proxied ones: the last two path segments are owner and name.
  const match = /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error("Could not tell the repository from the origin remote. Set GH_REPO=owner/name.");
  return match[1];
}

/** Which step was running, so a failure names it. pnpm's own "ELIFECYCLE" line at the end only repeats the exit code. */
async function step(name, fn) {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    const failure = new Error(`${name} failed: ${message}`);
    failure.step = name;
    throw failure;
  }
}

function parseArgs(argv) {
  const out = { screens: [], before: true, dryRun: false, fromBody: false, pr: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pr") out.pr = Number(argv[++i]);
    else if (a === "--screen") out.screens.push(parseScreen(argv[++i] ?? ""));
    else if (a === "--no-before") out.before = false;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--from-body") out.fromBody = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isInteger(out.pr) || out.pr < 1) throw new Error("--pr <number> is required");
  if (out.screens.length === 0 && !out.fromBody) throw new Error('At least one --screen "Name=/path" (or --from-body) is required');
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
  const browser = await chromium.launch(process.env.PR_SCREENSHOTS_CHROMIUM ? { executablePath: process.env.PR_SCREENSHOTS_CHROMIUM } : {});
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
          // Photograph the real page, not its loading placeholders (AC-OPS-05.6).
          const problems = await waitForContent(page);
          if (problems.length) console.warn(`Warning: ${screen.name} (${vp.key}, ${phase}) may not be fully loaded: ${[...new Set(problems)].join("; ")}.`);
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
  let slug;
  const getRepo = () => (slug ??= repoSlug());
  const readBody = () => run("gh", ["api", `repos/${getRepo()}/pulls/${args.pr}`, "--jq", ".body // \"\""]);
  if (args.fromBody) {
    const { screens, problems } = parseScreensLine(readBody());
    for (const problem of problems) console.warn(problem);
    if (screens.length === 0) {
      console.log("The pull request has no Screens line, so there are no screenshots to take. Add one like: Screens: Home=/, Car=/car");
      return;
    }
    args.screens = screens;
  }
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

  const repo = getRepo();
  const files = imageFiles(before, after).map((f) => path.join(outDir, f));
  try {
    await step("Preparing the pr-screenshots release", () => {
      try {
        run("gh", ["release", "view", RELEASE_TAG, "--repo", repo]);
      } catch {
        run("gh", ["release", "create", RELEASE_TAG, "--repo", repo, "--prerelease", "--latest=false", "--target", "main", "--title", "PR screenshots (temporary)", "--notes", "Images for open pull requests. Deleted automatically when the pull request closes. Synthetic demo data only."]);
      }
    });
    await step("Uploading the images to the release", () => run("gh", ["release", "upload", RELEASE_TAG, "--repo", repo, "--clobber", ...files]));
  } catch (error) {
    // Keep what was taken, so the work is not lost, and say plainly what failed.
    const keep = path.join(root, "web/test-results/pr-screenshots");
    mkdirSync(keep, { recursive: true });
    cpSync(outDir, keep, { recursive: true });
    error.message += `\nThe screenshots were taken and are kept in ${keep}. Building, pnpm and the browser worked; only the GitHub step failed. (The ELIFECYCLE line below comes from pnpm, which prints it whenever a script exits with an error.) In GitHub Actions this works with the built-in token; from a session that blocks GitHub uploads, let the pr-screenshots workflow do it.`;
    throw error;
  }

  const toUrls = (found) => (found ? Object.fromEntries(Object.entries(found).map(([vp, file]) => [vp, assetUrl(repo, file)])) : null);
  const results = args.screens.map((s) => {
    const hasBefore = VIEWPORTS.every((v) => before[s.name]?.[v.key]);
    return { name: s.name, before: hasBefore ? toUrls(before[s.name]) : null, after: toUrls(after[s.name]) };
  });

  await step("Updating the pull request description", () => {
    const body = readBody();
    const bodyFile = path.join(outDir, "body.md");
    writeFileSync(bodyFile, replaceScreenshotTable(body, screenshotBlock(results)));
    run("gh", ["api", "--method", "PATCH", `repos/${repo}/pulls/${args.pr}`, "-F", `body=@${bodyFile}`]);
  });
  console.log(`Uploaded ${files.length} images and updated the Screenshots table in pull request #${args.pr}.`);
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(`pr-screenshots failed: ${error.message}`);
  process.exit(1);
});
