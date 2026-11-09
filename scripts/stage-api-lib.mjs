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

/**
 * Remove a dependency from a staged package.json.
 * `pnpm deploy` writes `shared` as an absolute `file:` path from the build machine. The Static Web Apps
 * deploy client runs its own `npm install` on the staged folder (Oryx), turns that entry into a symlink, and
 * then fails copying it over the real folder we staged. `shared` is already in node_modules, compiled,
 * and has no dependencies of its own, so the entry is dropped.
 */
export function withoutDependency(pkg, name) {
  const next = { ...pkg };
  for (const field of ["dependencies", "optionalDependencies", "devDependencies"]) {
    if (next[field] && name in next[field]) {
      next[field] = { ...next[field] };
      delete next[field][name];
    }
  }
  return next;
}
