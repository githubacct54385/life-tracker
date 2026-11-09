// Pure helpers for scripts/stage-api.mjs, kept separate so they can be unit tested.
import path from "node:path";

/**
 * Point imports of `@life-tracker/shared` at a relative path.
 *
 * The deployed API does not install `shared` as a package. The Static Web Apps deploy client runs Oryx on the
 * staged folder (`npm install --production` inside a hidden subfolder, a copy, a plain `npm install`, then
 * `npm run build` if there is a build script). Every way of keeping `shared` in node_modules through that
 * sequence failed (ADR-0020), so it ships as plain files inside `dist/` and is imported by relative path.
 *
 * `file` and `sharedEntry` are absolute paths inside the staged folder.
 */
export function rewriteSharedImports(source, file, sharedEntry) {
  let rel = path.relative(path.dirname(file), sharedEntry).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return source.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])@life-tracker\/shared\2/g, `$1$2${rel}$2`);
}

/** The deployed package.json: no build script (the code is compiled) and no dependency on `shared`. */
export function toDeployPackage(pkg) {
  const next = { ...pkg, dependencies: { ...pkg.dependencies } };
  delete next.dependencies["@life-tracker/shared"];
  delete next.scripts;
  delete next.devDependencies;
  return next;
}
