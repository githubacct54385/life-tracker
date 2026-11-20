#!/usr/bin/env node
// Read-only check of a deployed Life Tracker, used by the staging workflow and by hand (OPS-08, ADR-0025).
// Usage: SMOKE_CLIENT_ID=<id> SMOKE_CLIENT_SECRET=<secret> node scripts/smoke.mjs https://<worker>.workers.dev
// Sends GET requests only. Prints status codes and short reasons, never the data or a header value.
// Needs the read-only service token (docs/staging-setup.md, section 4). For production, scripts/smoke-prod.mjs does the older, shorter check.
import { appendFileSync } from "node:fs";
import { credentialProblem, runSmoke } from "./smoke-lib.mjs";

const base = process.argv[2];
if (!base || !/^https:\/\/[^\s/]+\/?$/.test(base)) {
  console.error("Usage: SMOKE_CLIENT_ID=... SMOKE_CLIENT_SECRET=... node scripts/smoke.mjs https://<worker-address>");
  process.exit(2);
}
const id = process.env.SMOKE_CLIENT_ID;
const secret = process.env.SMOKE_CLIENT_SECRET;
// Only a fixed word comes back from the check, and only fixed text is printed, so nothing derived from a token can reach the log.
const WHAT_IS_WRONG = {
  missing: "is not set.",
  hidden: "has a space or a hidden character in it. Save it again without one.",
};
let invalid = false;
for (const [label, value] of [
  ["SMOKE_CLIENT_ID", id],
  ["SMOKE_CLIENT_SECRET", secret],
]) {
  const problem = credentialProblem(value);
  if (problem) {
    invalid = true;
    console.error(`${label} ${WHAT_IS_WRONG[problem]}`);
  }
}
if (invalid) process.exit(2);

const { ok, lines } = await runSmoke({ base, id, secret });
for (const line of lines) console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const list = lines.map((line) => `- \`${line}\``).join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Smoke test\n${list}\n`);
}
process.exit(ok ? 0 : 1);
