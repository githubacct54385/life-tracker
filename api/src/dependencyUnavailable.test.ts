// OPS-14: when a part the Worker depends on is down (the database, document storage, the sign-in key check), the API answers 503
// with the part's name and nothing else, and the log records only the name. Real services over in-memory fakes, through the whole Worker.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE, availabilityResponseSchema, unavailableResponseSchema } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorker, type Env } from "./worker.js";
import { createDocumentService } from "./services/documentService.js";
import { createGiftService } from "./services/giftService.js";
import { createGroceryService } from "./services/groceryService.js";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { r2DocumentStore, withRequestDocuments } from "./repositories/documentStore.js";
import { DependencyUnavailable, unavailablePartOf } from "./http/unavailable.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeBucket, fakeDocumentRepo } from "./testing/fakeDocuments.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";
import { fakePeople } from "./testing/fakePeople.js";

let issuer: Awaited<ReturnType<typeof createTestIssuer>>;
let ownerToken: string;
beforeAll(async () => {
  issuer = await createTestIssuer();
  ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
});

// What a real outage looks like. The messages name a host and an address, which must never reach the person or the log.
const SECRET_HOST = "ep-secret-host-123.region.neon.example";
const databaseDown = () => Object.assign(new Error(`connect ECONNREFUSED 10.9.8.7:5432 (${SECRET_HOST})`), { code: "ECONNREFUSED" });

function setup(options: { database?: "up" | "down" | "bug"; bucket?: "up" | "down" | "unbound"; keys?: "ok" | "timeout" | "http-error" | "network" } = {}) {
  const lines: string[] = [];
  const maintenanceRepo = fakeMaintenanceRepo();
  const documentRepo = fakeDocumentRepo(() => maintenanceRepo.rows.map((r) => r.id));
  const documents = createDocumentService(documentRepo, r2DocumentStore);
  const failing = async () => {
    throw options.database === "bug" ? new Error("syntax error near select") : databaseDown();
  };
  // With the database down every query fails the same way, so every method of the repository does.
  const odometerRepo = options.database === "down" || options.database === "bug" ? (new Proxy({}, { get: () => failing }) as ReturnType<typeof fakeRepo>) : fakeRepo();
  const brokenKeys = {
    timeout: () => Object.assign(new Error("request timed out"), { code: "ERR_JWKS_TIMEOUT" }),
    "http-error": () => Object.assign(new Error("Expected 200 OK from the JSON Web Key Set HTTP response"), { code: "ERR_JOSE_GENERIC" }),
    network: () => new TypeError(`fetch failed (${SECRET_HOST})`),
  } as const;
  const keys = options.keys && options.keys !== "ok" ? () => async () => { throw brokenKeys[options.keys as keyof typeof brokenKeys](); } : issuer.keys;
  const groceryRepoFailing = { clear: async () => { throw databaseDown(); } } as never;
  const worker = createWorker({
    logger: createLogger((_level, line) => lines.push(line)),
    checkDatabase: async () => {
      if (options.database === "down") throw databaseDown();
      return true;
    },
    odometer: createOdometerService(odometerRepo),
    gifts: createGiftService(fakeGiftRepo()),
    workouts: createWorkoutService(fakeWorkoutRepo()),
    weight: createWeightService(fakeWeightRepo()),
    maintenance: createMaintenanceService(maintenanceRepo, { documents }),
    documents,
    groceries: createGroceryService(groceryRepoFailing),
    people: fakePeople(),
    keys,
  });
  const bucket = fakeBucket();
  const brokenBucket = {
    put: async () => { throw new Error(`R2 put failed for bucket ${SECRET_HOST}`); },
    get: async () => { throw new Error(`R2 get failed for bucket ${SECRET_HOST}`); },
    delete: async () => { throw new Error(`R2 delete failed for bucket ${SECRET_HOST}`); },
  };
  const env: Env = { ...TEST_SETTINGS, ASSETS: { fetch: async () => new Response("<html></html>") }, ...(options.bucket === "unbound" ? {} : { DOCUMENTS: options.bucket === "down" ? brokenBucket : bucket }) };
  const call = (method: string, path: string, token: string | null = ownerToken) => {
    const h = new Headers();
    if (token !== null) h.set("cf-access-jwt-assertion", token);
    if (method !== "GET") h.set(REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE);
    return worker.fetch(new Request(`https://app.example.test${path}`, { method, headers: h }), env);
  };
  return { call, lines };
}

describe("a part the Worker depends on is not available (OPS-14)", () => {
  it("[AC-OPS-14.1] the database being down answers 503 with the part's name and nothing else, not a generic server error", async () => {
    const { call } = setup({ database: "down" });
    const response = await call("GET", "/api/odometer");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: "unavailable", part: "database" });
    expect(unavailableResponseSchema.safeParse(body).success).toBe(true);
  });

  it("[AC-OPS-14.1] an ordinary bug is still a 500, so a fault in the code is not passed off as an outage", async () => {
    const { call } = setup({ database: "bug" });
    const response = await call("GET", "/api/odometer");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
  });

  it("[AC-OPS-14.1] a handler that answers 500 on failure lets a down database through as a 503", async () => {
    const { call } = setup();
    const response = await call("DELETE", "/api/groceries");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable", part: "database" });
  });

  it("[AC-OPS-14.2] every document store call fails as 'documents are not available' when the bucket errors or is not bound, with the error dropped", async () => {
    const broken = { put: async () => { throw new Error(`down ${SECRET_HOST}`); }, get: async () => { throw new Error(`down ${SECRET_HOST}`); }, delete: async () => { throw new Error(`down ${SECRET_HOST}`); } };
    const body = new Blob([new Uint8Array([1, 2, 3])]).stream();
    for (const bucket of [broken, undefined]) {
      const run = <T,>(fn: () => Promise<T>) => withRequestDocuments(bucket, fn);
      for (const call of [() => r2DocumentStore.get("k"), () => r2DocumentStore.delete("k"), () => r2DocumentStore.put("k", body, "image/png", 3)] as Array<() => Promise<unknown>>) {
        const error = await run(call).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(DependencyUnavailable);
        expect(error).toMatchObject({ part: "documents" });
        expect((error as Error).message).not.toContain(SECRET_HOST);
      }
    }
    // A key that is simply not there is not an outage.
    expect(await withRequestDocuments(fakeBucket(), () => r2DocumentStore.get("missing"))).toBeUndefined();
  });

  it("[AC-OPS-14.2] a document route answers 503 naming documents when the store is down", async () => {
    const stub = { list: async () => { throw new DependencyUnavailable("documents"); }, reachable: async () => false } as never;
    const worker = createWorker({
      logger: createLogger(() => {}),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(fakeWeightRepo()),
      maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      documents: stub,
      people: fakePeople(),
      keys: issuer.keys,
    });
    const env: Env = { ...TEST_SETTINGS, ASSETS: { fetch: async () => new Response("") } };
    const response = await worker.fetch(new Request("https://app.example.test/api/maintenance/documents", { headers: { "cf-access-jwt-assertion": ownerToken } }), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable", part: "documents" });
  });

  it("[AC-OPS-14.2] the sign-in key check failing (a timeout, an error answer from Access, or no network) answers 503 naming signIn, and lets nobody in", async () => {
    for (const keys of ["timeout", "http-error", "network"] as const) {
      const { call } = setup({ keys });
      const response = await call("GET", "/api/odometer");
      expect(response.status, keys).toBe(503);
      expect(await response.json(), keys).toEqual({ error: "unavailable", part: "signIn" });
    }
  });

  it("[AC-OPS-14.2] a token that is simply wrong is still a 401, and a missing one too: only a failure to fetch the keys is an outage", async () => {
    const { call } = setup();
    expect((await call("GET", "/api/odometer", "not-a-token")).status).toBe(401);
    expect((await call("GET", "/api/odometer", null)).status).toBe(401);
    expect((await call("GET", "/api/odometer", await issuer.sign("someone-else@example.test"))).status).toBe(403);
  });

  it("[AC-OPS-14.5] nothing technical reaches the person: no host, address, driver message or error text in the answer", async () => {
    for (const options of [{ database: "down" as const }, { keys: "network" as const }]) {
      const { call } = setup(options);
      const text = await (await call("GET", "/api/odometer")).text();
      expect(text).not.toMatch(/ECONN|10\.9\.8\.7|neon|secret-host|fetch failed|TypeError|stack|at /i);
    }
  });

  it("[AC-OPS-14.5] the log records which part failed and the error's class and code, never its message, host or address", async () => {
    const database = setup({ database: "down" });
    await database.call("GET", "/api/odometer");
    const keys = setup({ keys: "network" });
    await keys.call("GET", "/api/odometer");
    const logged = [...database.lines, ...keys.lines].join("\n");
    expect(logged).toContain('"event":"api.dependency_unavailable"');
    expect(logged).toContain('"part":"database"');
    expect(logged).toContain('"part":"signIn"');
    expect(logged).toContain('"errorCode":"ECONNREFUSED"');
    expect(logged).not.toMatch(/10\.9\.8\.7|secret-host|neon\.example|fetch failed|ECONNREFUSED 10/);
  });
});

describe("GET /api/health/parts (OPS-14)", () => {
  it("[AC-OPS-14.3] says ok for every part when all is well, in the one fixed shape", async () => {
    const response = await setup().call("GET", "/api/health/parts");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(availabilityResponseSchema.parse(body)).toEqual({ database: "ok", documents: "ok", signIn: "ok" });
  });

  it("[AC-OPS-14.3] says which part is down, so the banner can clear itself when it is back", async () => {
    expect(await (await setup({ database: "down" }).call("GET", "/api/health/parts")).json()).toEqual({ database: "unavailable", documents: "ok", signIn: "ok" });
    expect(await (await setup({ bucket: "down" }).call("GET", "/api/health/parts")).json()).toEqual({ database: "ok", documents: "unavailable", signIn: "ok" });
    expect(await (await setup({ bucket: "unbound" }).call("GET", "/api/health/parts")).json()).toEqual({ database: "ok", documents: "unavailable", signIn: "ok" });
  });

  it("[AC-OPS-14.5] never returns an error message, a host or any data, and logs only the part", async () => {
    const { call, lines } = setup({ database: "down", bucket: "down" });
    const text = await (await call("GET", "/api/health/parts")).text();
    expect(text).not.toMatch(/ECONN|secret-host|10\.9\.8\.7|R2/);
    const logged = lines.join("\n");
    expect(logged).toContain('"event":"health.part_unavailable"');
    expect(logged).not.toMatch(/ECONN|secret-host|10\.9\.8\.7|R2 /);
  });

  it("[AC-OPS-14.5] still refuses someone who is not signed in, and answers 503 for sign-in when the keys cannot be fetched", async () => {
    expect((await setup().call("GET", "/api/health/parts", null)).status).toBe(401);
    const response = await setup({ keys: "timeout" }).call("GET", "/api/health/parts");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable", part: "signIn" });
  });
});

describe("which errors count as a part being down", () => {
  it("[AC-OPS-14.1] recognises connection failures and the driver's connection messages, and nothing else", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "08006", "08001", "57P01", "53300"]) {
      expect(unavailablePartOf(Object.assign(new Error("x"), { code })), code).toBe("database");
    }
    for (const message of ["Connection terminated unexpectedly", "timeout exceeded when trying to connect", "Connection error"]) expect(unavailablePartOf(new Error(message)), message).toBe("database");
    for (const code of ["42P01", "23505", "42501", "22P02"]) expect(unavailablePartOf(Object.assign(new Error("x"), { code })), code).toBeUndefined();
    expect(unavailablePartOf(new Error("Cannot read properties of undefined"))).toBeUndefined();
    expect(unavailablePartOf("not an error")).toBeUndefined();
    expect(unavailablePartOf(new DependencyUnavailable("documents"))).toBe("documents");
  });
});
