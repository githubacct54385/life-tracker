import { createOdometerService } from "./services/odometerService";
import { fakeRepo } from "./testing/fakeOdometerRepository";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens";
import { ALLOWED_LOG_FIELDS, createLogger } from "./telemetry/logger";
import { createWorker, isApiPath, type Env } from "./worker";

let issuer: Awaited<ReturnType<typeof createTestIssuer>>;
let ownerToken: string;
beforeAll(async () => {
  issuer = await createTestIssuer();
  ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
});

function setup(checkDatabase: () => Promise<boolean> = async () => true, seed: Array<{ date: string; miles: number }> = []) {
  const lines: { level: string; entry: Record<string, unknown> }[] = [];
  const logger = createLogger((level, line) => lines.push({ level, entry: JSON.parse(line) }));
  const assetCalls: string[] = [];
  const env: Env = {
    ...TEST_SETTINGS,
    ASSETS: {
      fetch: async (request) => {
        assetCalls.push(new URL(request.url).pathname);
        return new Response("<html>app</html>", { headers: { "content-type": "text/html" } });
      },
    },
  };
  const worker = createWorker({ logger, checkDatabase, odometer: createOdometerService(fakeRepo(seed)), keys: issuer.keys });
  // Signed in as the owner unless a test says otherwise: the same header Cloudflare Access adds at the edge.
  const call = (path: string, init: RequestInit = {}, token: string | null = ownerToken) => {
    const headers = new Headers(init.headers);
    if (token !== null) headers.set("cf-access-jwt-assertion", token);
    return worker.fetch(new Request(`https://app.example.test${path}`, { ...init, headers }), env);
  };
  return { call, lines, assetCalls, env, worker };
}

describe("https only", () => {
  it("[AC-SET-03.1] redirects http to https with security headers, before the API or assets run", async () => {
    const { worker, env, assetCalls } = setup();
    const res = await worker.fetch(new Request("http://app.example.test/api/health"), env);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.example.test/api/health");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(assetCalls).toEqual([]);
  });
});

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

describe("owner guard on the Worker", () => {
  it("[AC-MIG-04.3] a request with no token gets 401 and no data, on every API path and method", async () => {
    const { call, lines } = setup();
    for (const [path, method] of [["/api/health", "GET"], ["/api/health/db", "GET"], ["/api/nope", "GET"], ["/api/health", "POST"], ["/api/health", "DELETE"]] as const) {
      const res = await call(path, { method }, null);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(lines.every((l) => l.entry.statusCode === 401)).toBe(true);
  });

  it("[AC-MIG-04.3] a request with a bad token gets 401 and no data", async () => {
    const { call } = setup();
    const other = await createTestIssuer(); // a different key, so the signature does not verify
    for (const token of ["garbage", await other.sign(TEST_SETTINGS.OWNER_EMAIL), await issuer.sign(TEST_SETTINGS.OWNER_EMAIL, { aud: "another-app" }), await issuer.sign(TEST_SETTINGS.OWNER_EMAIL, { expiresInSeconds: -5 })]) {
      expect((await call("/api/health", {}, token)).status).toBe(401);
    }
  });

  it("[AC-MIG-04.3] a valid token for someone who is not the owner gets 403 and no data", async () => {
    const { call } = setup();
    const res = await call("/api/health", {}, await issuer.sign("someone-else@example.test"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect((await call("/api/health", {}, await issuer.sign(null))).status).toBe(403);
  });

  it("[AC-MIG-04.2] with the settings missing, even the owner's token is refused", async () => {
    const { worker, env } = setup();
    const req = new Request("https://app.example.test/api/health", { headers: { "cf-access-jwt-assertion": ownerToken } });
    for (const key of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "OWNER_EMAIL"] as const) {
      const res = await worker.fetch(req.clone(), { ...env, [key]: undefined });
      expect(res.status).toBe(403);
    }
  });

  it("[AC-MIG-04.3] checks identity before the custom header, so a stranger learns nothing about it", async () => {
    const { call } = setup();
    expect((await call("/api/health", { method: "POST" }, null)).status).toBe(401);
    expect((await call("/api/health", { method: "POST" })).status).toBe(403); // owner, but no custom header
  });

  it("[AC-MIG-04.3] the failure responses carry no token, email or setting value", async () => {
    const { call, lines } = setup();
    const res = await call("/api/health", {}, await issuer.sign("someone-else@example.test"));
    const text = JSON.stringify([await res.text(), lines]);
    for (const secret of [TEST_SETTINGS.OWNER_EMAIL, "someone-else", TEST_SETTINGS.ACCESS_AUD, "eyJ"]) expect(text).not.toContain(secret);
  });

  it("[AC-DEM-01.1] paths outside /api, such as the demo, are not answered by the API", async () => {
    const { call, assetCalls } = setup();
    const res = await call("/demo/index.html", {}, null);
    expect(res.status).toBe(200);
    expect(assetCalls).toEqual(["/demo/index.html"]);
    expect((await call("/demo/api/health", {}, null)).status).toBe(200); // still a static file request, never the API
    expect(assetCalls).toContain("/demo/api/health");
  });
});

describe("odometer history", () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 2 + i * 7)).toISOString().slice(0, 10), miles: 1000 + i * 100 }));

  it("[AC-MIL-03.2] the list holds the latest 30 readings, and ?all=1 returns the whole history for the stats", async () => {
    const { call } = setup(async () => true, history);
    expect((await (await call("/api/odometer")).json()).readings).toHaveLength(30);
    expect((await (await call("/api/odometer?all=1")).json()).readings).toHaveLength(40);
  });
});
