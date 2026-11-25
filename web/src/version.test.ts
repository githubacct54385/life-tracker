import { describe, expect, it } from "vitest";
import { buildInfo, versionText } from "./version";

describe("build info (OPS-11)", () => {
  it("[AC-OPS-11.5] production shows the release tag and the short commit, and has no label", () => {
    const info = buildInfo({ VITE_APP_ENV: "production", VITE_RELEASE_TAG: "v2026.11.25.1", VITE_COMMIT: "1543dbb65f2336d6446938f73abbaeeac5786748" });
    expect(info).toEqual({ environment: "production", label: null, tag: "v2026.11.25.1", commit: "1543dbb" });
    expect(versionText(info)).toBe("v2026.11.25.1 · 1543dbb");
  });

  it("[AC-OPS-11.9] staging is labelled Staging and shows the latest tag with its commit", () => {
    const info = buildInfo({ VITE_APP_ENV: "staging", VITE_RELEASE_TAG: "v2026.11.25.1", VITE_COMMIT: "abcdef1234" });
    expect(info.label).toBe("Staging");
    expect(versionText(info)).toBe("v2026.11.25.1 · abcdef1");
  });

  it("[AC-OPS-11.9] a build with no environment, or a mistyped one, is labelled Local, never production", () => {
    expect(buildInfo({}).label).toBe("Local");
    expect(buildInfo({ VITE_APP_ENV: "prod" }).environment).toBe("local");
    expect(buildInfo({ VITE_APP_ENV: "Production" }).label).toBe("Local");
  });

  it("[AC-OPS-11.5] a build with no tag or commit says so instead of showing a blank", () => {
    expect(versionText(buildInfo({}))).toBe("no release tag");
    expect(versionText(buildInfo({ VITE_APP_ENV: "staging", VITE_COMMIT: "abc1234" }))).toBe("no release tag · abc1234");
    expect(versionText(buildInfo({ VITE_APP_ENV: "production" }))).toBe("unknown version");
  });
});
