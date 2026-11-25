// Which build this is (OPS-11): the release tag, the commit, and whether it is production, staging or a local build.
// The values are set when the app is built (VITE_APP_ENV, VITE_RELEASE_TAG, VITE_COMMIT). Only the Release workflow
// sets VITE_APP_ENV to "production", so any other build, including one where it was forgotten, shows a label.

export type Environment = "production" | "staging" | "local";

export type BuildInfo = {
  environment: Environment;
  /** "Staging" or "Local", and null for production, which shows no label. */
  label: string | null;
  /** The release tag, for example v2026.11.25.1. On staging it is the latest tag. Empty when there is none. */
  tag: string;
  /** The first seven characters of the commit, or empty when unknown. */
  commit: string;
};

type BuildEnv = { VITE_APP_ENV?: string; VITE_RELEASE_TAG?: string; VITE_COMMIT?: string };

export function buildInfo(env: BuildEnv): BuildInfo {
  const environment: Environment = env.VITE_APP_ENV === "production" ? "production" : env.VITE_APP_ENV === "staging" ? "staging" : "local";
  return {
    environment,
    label: environment === "production" ? null : environment === "staging" ? "Staging" : "Local",
    tag: env.VITE_RELEASE_TAG?.trim() ?? "",
    commit: (env.VITE_COMMIT?.trim() ?? "").slice(0, 7),
  };
}

/** For example "v2026.11.25.1 · 1543dbb". Missing parts are left out, and a build with neither says so. */
export function versionText(info: BuildInfo): string {
  const parts = [info.tag || (info.environment === "production" ? "" : "no release tag"), info.commit].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "unknown version";
}

export const BUILD: BuildInfo = buildInfo(import.meta.env as BuildEnv);
