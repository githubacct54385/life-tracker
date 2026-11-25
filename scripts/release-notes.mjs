#!/usr/bin/env node
// Works out the next release tag and the release notes from the git history (OPS-11). Run in a checkout that has all tags and history.
//   node scripts/release-notes.mjs --out release-notes.md [--date YYYY-MM-DD]
// Prints the tag, and when GITHUB_OUTPUT is set it writes `tag` and `previous` there for the workflow's later steps.
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { nextTag, previousTag, renderNotes } from "./release-lib.mjs";

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const out = option("--out");
if (!out) {
  console.error("Usage: node scripts/release-notes.mjs --out <notes file> [--date YYYY-MM-DD]");
  process.exit(2);
}
const git = (...gitArgs) => execFileSync("git", gitArgs, { encoding: "utf8" }).trim();
const lines = (text) => (text ? text.split("\n") : []);

const date = option("--date") ?? new Date().toISOString().slice(0, 10);
const tags = lines(git("tag", "--list"));
const previous = previousTag(tags);
const sha = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
const repoUrl = process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}` : "https://github.com";
const tag = nextTag(date, tags);

const subjects = previous === null ? [] : lines(git("log", `${previous}..${sha}`, "--first-parent", "--format=%s"));
const migrations = previous === null ? [] : lines(git("diff", "--name-only", "--diff-filter=A", previous, sha, "--", "db/migrations")).filter((file) => file.endsWith(".sql"));

writeFileSync(out, renderNotes({ tag, previous, subjects, migrations, repoUrl, sha }));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nprevious=${previous ?? ""}\n`);
console.log(tag);
