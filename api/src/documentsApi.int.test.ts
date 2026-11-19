// The document rows end to end against a real Postgres built from the real migrations (MIL-07). The R2 bucket is a fake;
// the real bucket is covered by the full-stack browser test and the manual check.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { documentKeys, serviceExists } from "./repositories/documentTestDatabase.js";
import { documentRepository } from "./repositories/documentRepository.js";
import { maintenanceRepository } from "./repositories/maintenanceRepository.js";
import { clearMaintenance } from "./repositories/maintenanceTestDatabase.js";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { createDocumentService } from "./services/documentService.js";
import { createGiftService } from "./services/giftService.js";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeDocumentStore } from "./testing/fakeDocuments.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";

const server = inject("postgres");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe.skipIf(!server)("/api/maintenance documents (real Postgres)", () => {
  let call: (method: string, url: string, body?: BodyInit, headers?: Record<string, string>, token?: string | null) => Promise<Response>;
  const store = fakeDocumentStore();

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    const documents = createDocumentService(documentRepository, store);
    const app = createApp({
      logger: createLogger(() => {}),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(fakeWeightRepo()),
      maintenance: createMaintenanceService(maintenanceRepository, { now: () => new Date("2026-11-13T12:00:00Z"), documents }),
      documents,
      keys: issuer.keys,
    });
    call = async (method, url, body, headers = {}, token = ownerToken) => {
      const h = new Headers(headers);
      if (token) h.set("cf-access-jwt-assertion", token);
      if (method !== "GET") h.set(REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE);
      return app.request(url, { method, headers: h, body }, TEST_SETTINGS);
    };
  });
  afterAll(disconnectAppDatabase);
  beforeEach(async () => {
    await clearMaintenance();
    store.files.clear();
    store.failDeletes = false;
  });

  const addService = async () => ((await (await call("POST", "/api/maintenance", JSON.stringify({ date: "2026-11-10", services: ["Oil change"], doneBy: "home" }), { "content-type": "application/json" })).json()) as { id: number }).id;
  const upload = (id: number, data = PNG) => call("POST", `/api/maintenance/${id}/documents`, data, { "content-type": "image/png", "content-length": String(data.byteLength) });

  it("[AC-MIL-07.3][AC-MIL-07.4] saves a document row for an existing service, refuses an unknown one, and allows at most 10 per service", async () => {
    const id = await addService();
    expect((await upload(id)).status).toBe(201);
    expect((await upload(id + 1000)).status).toBe(404);
    for (let i = 1; i < 10; i += 1) expect((await upload(id)).status).toBe(201);
    expect((await upload(id)).status).toBe(409);
    expect(store.files.size).toBe(10);
    const keys = await documentKeys(id);
    expect(keys).toHaveLength(10);
    expect(keys.every((key) => /^[0-9a-f-]{36}$/.test(key))).toBe(true);
  });

  it("[AC-MIL-07.10] allows a file of up to 100 MB in the table, and refuses a service going past 250 MB in total", async () => {
    const id = await addService();
    // Rows only, as the file itself is not needed to test the SQL: 100 + 100 + 50 MB use the whole 250 MB.
    for (const mb of [100, 100, 50]) expect((await documentRepository.insert(id, crypto.randomUUID(), "application/pdf", mb * 1024 * 1024)).status).toBe("saved");
    const res = await upload(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "too_much" });
    expect(await documentRepository.room(id, 100)).toBe("too_much");
    expect(store.files.size).toBe(0);
    // The table itself refuses a single file over 100 MB, whatever the code says (migration 0010).
    await expect(documentRepository.insert(await addService(), crypto.randomUUID(), "application/pdf", 100 * 1024 * 1024 + 1)).rejects.toThrow();
  });

  it("[AC-MIL-07.3] refuses a file whose bytes are not an allowed type, and stores neither a row nor a file", async () => {
    const id = await addService();
    const res = await call("POST", `/api/maintenance/${id}/documents`, new TextEncoder().encode("plain text"), { "content-type": "image/png", "content-length": "10" });
    expect(res.status).toBe(415);
    expect(await documentKeys()).toHaveLength(0);
    expect(store.files.size).toBe(0);
  });

  it("[AC-MIL-07.5] serves the file with its stored type and the document headers", async () => {
    const id = await addService();
    const saved = (await (await upload(id)).json()) as { id: number };
    const res = await call("GET", `/api/maintenance/documents/${saved.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("[AC-MIL-07.6] deleting a service deletes its files and, by the foreign key, its rows; a row whose file is missing answers 404", async () => {
    const id = await addService();
    const saved = (await (await upload(id)).json()) as { id: number };
    store.files.clear();
    expect((await call("GET", `/api/maintenance/documents/${saved.id}`)).status).toBe(404);
    await upload(id);
    expect((await call("DELETE", `/api/maintenance/${id}`)).status).toBe(204);
    expect(store.files.size).toBe(0);
    expect(await documentKeys()).toHaveLength(0);
  });

  it("[AC-MIL-07.6] when the file cannot be deleted the service and the row stay, and a retry succeeds", async () => {
    const id = await addService();
    await upload(id);
    store.failDeletes = true;
    expect((await call("DELETE", `/api/maintenance/${id}`)).status).toBe(500);
    expect(await serviceExists(id)).toBe(true);
    expect(await documentKeys()).toHaveLength(1);
    store.failDeletes = false;
    expect((await call("DELETE", `/api/maintenance/${id}`)).status).toBe(204);
  });

  it("[AC-MIL-07.2] every document route is 401 without the owner", async () => {
    const id = await addService();
    expect((await call("GET", "/api/maintenance/documents", undefined, {}, null)).status).toBe(401);
    expect((await call("POST", `/api/maintenance/${id}/documents`, PNG, { "content-type": "image/png" }, null)).status).toBe(401);
  });
});
