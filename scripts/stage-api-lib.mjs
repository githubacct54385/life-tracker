// Pure helpers for scripts/stage-api.mjs, kept separate so they can be unit tested.

/**
 * Apply a package's `publishConfig` entry points over its development ones.
 * In this repo `shared` points `main` at TypeScript source for Vite, Vitest, and tsc,
 * and `publishConfig` at the compiled output that Node can load. `pnpm deploy` does not
 * apply `publishConfig`, so the staging step does it.
 */
export function applyPublishConfig(pkg) {
  const publish = pkg.publishConfig ?? {};
  const next = { ...pkg };
  for (const field of ["main", "types", "exports"]) {
    if (publish[field] !== undefined) next[field] = publish[field];
  }
  delete next.publishConfig;
  return next;
}
