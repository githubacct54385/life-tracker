#!/usr/bin/env node
// Read-only check of a deployed Life Tracker (ADR-0023). Needs the smoke-test service token (docs/cloudflare-access-setup.md, section 9).
// Usage: SMOKE_CLIENT_ID=<id> SMOKE_CLIENT_SECRET=<secret> node scripts/smoke-prod.mjs https://<worker>.workers.dev
// Sends GET requests only. Prints status codes and counts, never the data.
const base = process.argv[2]?.replace(/\/$/, "");
const id = process.env.SMOKE_CLIENT_ID;
const secret = process.env.SMOKE_CLIENT_SECRET;
if (!base || !id || !secret) {
  console.error("Usage: SMOKE_CLIENT_ID=... SMOKE_CLIENT_SECRET=... node scripts/smoke-prod.mjs <https://worker-url>");
  process.exit(2);
}
const paths = ["/api/health", "/api/odometer", "/api/gifts", "/api/gifts/special", "/api/weight", "/api/workouts"];
let failed = 0;
for (const path of paths) {
  try {
    const res = await fetch(base + path, { headers: { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret }, redirect: "manual" });
    const ok = res.status === 200;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${res.status} GET ${path}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL --- GET ${path} (${error instanceof Error ? error.name : "error"})`);
  }
}
console.log(failed === 0 ? "All reads worked." : `${failed} read(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
