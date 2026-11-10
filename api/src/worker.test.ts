import { describe, expect, it } from "vitest";
import { ALLOWED_LOG_FIELDS, createLogger } from "./telemetry/logger";
import { createWorker, isApiPath, type Env } from "./worker";

function setup(checkDatabase: () => Promise<boolean> = async () => true) {
  const lines: { level: string; entry: Record<string, unknown> }[] = [];
  const logger = createLogger((level, line) => lines.push({ level, entry: JSON.parse(line) }));
  const assetCalls: string[] = [];
  const env: Env = {
    ASSETS: {
      fetch: async (request) => {
        assetCalls.push(new URL(request.url).pathname);
        return new Response("<html>app</html>", { headers: { "content-type": "text/html" } });
      },
    },
  };
  const worker = createWorker({ logger, checkDatabase });
  const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://app.example.test${path}`, init), env);
  return { call, lines, assetCalls };
}

describe("routing", () => {
  it("[AC-MIG-03.2] sends /api/* to the API and everything else to the static assets", async () => {
    const { call, assetCalls } = setup();
    const api = await call("/api/health");
    expect(api.status).toBe(200);
    expect(assetCalls).toEqual([]);

    const page = await call("/mileage");
    expect(await page.text()).toBe("<html>app</html>");
    await call("/api-docs"); // looks like /api but is not under it
    expect(assetCalls).toEqual(["/mileage", "/api-docs"]);
  });

  it("[AC-MIG-03.2] isApiPath matches /api and /api/..., nothing else", () => {
    expect(["/api", "/api/", "/api/health"].every(isApiPath)).toBe(true);
    expect(["/", "/apis", "/api-docs", "/x/api/health"].some(isApiPath)).toBe(false);
  });

  it("[AC-MIG-03.1] unknown API paths get a JSON 404, not the single-page app", async () => {
    const { call, assetCalls } = setup();
    const res = await call("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(assetCalls).toEqual([]);
  });
});

describe("health route", () => {
  it("[AC-MIG-03.5] returns 200 with only a status word", async () => {
    const { call } = setup();
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("[AC-MIG-03.5] goes through the logger with allow-listed fields only", async () => {
    const { call, lines } = setup();
    await call("/api/health?token=secret-value", { headers: { cookie: "session=secret-value" } });
    expect(lines).toHaveLength(1);
    const { level, entry } = lines[0]!;
    expect(level).toBe("info");
    expect(entry).toMatchObject({ event: "api.request", route: "api/health", statusCode: 200 });
    expect(entry.droppedFields).toBeUndefined();
    for (const key of Object.keys(entry)) expect(["level", "event", ...ALLOWED_LOG_FIELDS]).toContain(key);
    expect(JSON.stringify(lines)).not.toContain("secret-value");
  });

  it("[AC-MIG-03.5] logs unknown paths under one label, never the URL", async () => {
    const { call, lines } = setup();
    await call("/api/some/private-looking-path");
    expect(lines[0]!.entry).toMatchObject({ route: "unmatched", statusCode: 404 });
    expect(JSON.stringify(lines)).not.toContain("private-looking-path");
  });

  it("[AC-MIG-03.5] the database check reports unavailable without leaking the error", async () => {
    const { call, lines } = setup(async () => {
      throw new Error("password authentication failed for user lt_app at db.example.test");
    });
    const res = await call("/api/health/db");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable" });
    const errorLine = lines.find((l) => l.level === "error");
    expect(errorLine?.entry).toMatchObject({ event: "health.db_failed", errorType: "Error" });
    expect(JSON.stringify(lines)).not.toContain("lt_app");
  });

  it("[AC-MIG-03.5] the database check returns the same status word when the database answers", async () => {
    const { call } = setup(async () => true);
    expect(await (await call("/api/health/db")).json()).toEqual({ status: "ok" });
  });
});

describe("request guard", () => {
  it("[AC-MIG-03.3] rejects a non-GET request without the custom header, before any route runs", async () => {
    const { call } = setup();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await call("/api/health", { method });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    }
  });

  it("[AC-MIG-03.3] lets a non-GET request through when the custom header is present", async () => {
    const { call } = setup();
    const res = await call("/api/health", { method: "POST", headers: { "x-life-tracker": "1" } });
    expect(res.status).toBe(404); // guard passed; there is simply no POST route yet
    expect((await call("/api/health", { method: "POST", headers: { "x-life-tracker": "0" } })).status).toBe(403);
  });

  it("[AC-MIG-03.3] GET and HEAD need no header", async () => {
    const { call } = setup();
    expect((await call("/api/health")).status).toBe(200);
    expect((await call("/api/health", { method: "HEAD" })).status).toBe(200);
  });
});

describe("security headers on the Worker", () => {
  it("[AC-MIG-03.7] are set on API responses, error responses and static files", async () => {
    const { call } = setup();
    for (const res of [await call("/api/health"), await call("/api/health", { method: "POST" }), await call("/")]) {
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    }
    expect((await call("/api/health")).headers.get("cache-control")).toBe("no-store");
    expect((await call("/")).headers.get("cache-control")).toBeNull();
  });
});
