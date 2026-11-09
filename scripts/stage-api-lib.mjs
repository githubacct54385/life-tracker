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
 * Turn the API package.json that `pnpm deploy` wrote into the one that is deployed.
 *
 * The Static Web Apps deploy client runs Oryx on the staged folder: `npm install --production`, a copy into
 * node_modules, a plain `npm install`, and `npm run build` if a build script exists. So:
 * - `scripts` is removed. The code is already compiled, and `tsc` is not available there.
 * - `@life-tracker/shared` is declared as `file:./vendor/shared` (a relative path, the compiled copy).
 *   `pnpm deploy` writes a build-machine absolute path instead, and a plain `npm install` deletes any
 *   package in node_modules that package.json does not list, which would remove `shared`.
 * Pair this with `install-links=true` in .npmrc so npm copies the folder instead of symlinking it.
 */
export function toDeployPackage(pkg) {
  const next = { ...pkg, dependencies: { ...pkg.dependencies, "@life-tracker/shared": "file:./vendor/shared" } };
  delete next.scripts;
  delete next.devDependencies;
  return next;
}
