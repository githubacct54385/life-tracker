// Bundles the Worker without deploying and checks its size (AC-MIG-03.6). Needs no Cloudflare login.
//
//   pnpm check:worker-size
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkerSize } from "./worker-size-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".stage/worker");
rmSync(out, { recursive: true, force: true });
execFileSync("pnpm", ["--filter", "@life-tracker/api", "exec", "wrangler", "deploy", "--dry-run", "--outdir", out], { cwd: root, stdio: "inherit" });

// Source maps are not uploaded as code, so count only the JavaScript modules.
const bytes = readdirSync(out)
  .filter((name) => name.endsWith(".js") || name.endsWith(".mjs"))
  .reduce((sum, name) => sum + statSync(path.join(out, name)).size, 0);
const result = checkWorkerSize(bytes);
console.log(result.reason);
process.exit(result.ok ? 0 : 1);
