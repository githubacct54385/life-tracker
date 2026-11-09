import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const config = JSON.parse(readFileSync(path.join(publicDir, "staticwebapp.config.json"), "utf8")) as {
  routes: { route: string; allowedRoles?: string[]; statusCode?: number; rewrite?: string }[];
  responseOverrides: Record<string, { redirect?: string; rewrite?: string; statusCode?: number }>;
  navigationFallback: { rewrite: string; exclude?: string[] };
  auth?: unknown;
};

const routeFor = (route: string) => config.routes.find((r) => r.route === route);

describe("edge rules (staticwebapp.config.json)", () => {
  it("[AC-FND-02.1] requires the owner role on every route by default", () => {
    expect(routeFor("/*")?.allowedRoles).toEqual(["owner"]);
    expect(routeFor("/api/*")?.allowedRoles).toEqual(["owner"]);
  });

  it("[AC-FND-02.2] sends a signed-in non-owner (403) to the access-denied page, which is open to everyone", () => {
    expect(config.responseOverrides["403"]).toMatchObject({ rewrite: "/access-denied.html", statusCode: 403 });
    expect(routeFor("/access-denied.html")?.allowedRoles).toEqual(["anonymous"]);
  });

  it("[AC-FND-02.1] sends a signed-out visitor (401) to GitHub sign-in", () => {
    expect(config.responseOverrides["401"]?.redirect).toMatch(/^\/\.auth\/login\/github/);
  });

  it("[AC-FND-02.2] blocks the pre-configured Microsoft sign-in with a 404", () => {
    expect(routeFor("/.auth/login/aad")).toMatchObject({ statusCode: 404 });
    expect(routeFor("/.auth/login/aad")?.allowedRoles).toBeUndefined();
  });

  it("[AC-FND-02.2] leaves only sign-in, sign-out, the identity read, and the demo open", () => {
    const open = config.routes.filter((r) => r.allowedRoles?.includes("anonymous")).map((r) => r.route).sort();
    expect(open).toEqual(["/.auth/login/github", "/.auth/logout", "/.auth/me", "/access-denied.html", "/demo", "/demo/*"].sort());
  });

  it("[AC-FND-02.1] serves the app shell for client routes, but only after the role check", () => {
    expect(config.navigationFallback.rewrite).toBe("/index.html");
    expect(config.navigationFallback.exclude).toContain("/api/*");
  });

  it("[AC-FND-02.2] ships a self-contained access-denied page with no script and no personal data", () => {
    const html = readFileSync(path.join(publicDir, "access-denied.html"), "utf8");
    expect(html).toContain("Access denied");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("/.auth/logout");
  });
});
