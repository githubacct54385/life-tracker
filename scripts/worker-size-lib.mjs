// Size rules for the bundled Worker (AC-MIG-03.6).
// Cloudflare limit, checked 2026-11-10 at developers.cloudflare.com/workers/platform/limits: 64 MiB uncompressed on Free and Paid, no compressed limit.
export const WORKER_SIZE_LIMIT_BYTES = 64 * 1024 * 1024;
/** Our own tripwire. The Worker is about 0.3 MiB today, so growth past this is a surprise worth a look. */
export const WORKER_SIZE_BUDGET_BYTES = 5 * 1024 * 1024;

export function checkWorkerSize(bytes, { limit = WORKER_SIZE_LIMIT_BYTES, budget = WORKER_SIZE_BUDGET_BYTES } = {}) {
  if (bytes > limit) return { ok: false, reason: `Worker is ${bytes} bytes, over the platform limit of ${limit}.` };
  if (bytes > budget) return { ok: false, reason: `Worker is ${bytes} bytes, over our budget of ${budget}. Raise the budget on purpose or trim the bundle.` };
  return { ok: true, reason: `Worker is ${bytes} bytes (budget ${budget}, platform limit ${limit}).` };
}
