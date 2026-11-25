// SET-04: one person can never reach another person's data. Two apps share ONE real Postgres (built from the real migrations,
// connected as the least-privilege app role); each app answers for a different person. Every route is listed below, and a
// test fails if a route exists that is not covered here, so a new route cannot be added without proving it stays private.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { documentRepository } from "./repositories/documentRepository.js";
import { maintenanceRepository } from "./repositories/maintenanceRepository.js";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { odometerRepository } from "./repositories/odometerRepository.js";
import { addTestPerson } from "./repositories/personTestDatabase.js";
import { weightRepository } from "./repositories/weightRepository.js";
import { workoutRepository } from "./repositories/workoutRepository.js";
import { giftRepository } from "./repositories/giftRepository.js";
import { createDocumentService } from "./services/documentService.js";
import { groceryRepository } from "./repositories/groceryRepository.js";
import { createGroceryService } from "./services/groceryService.js";
import { createGiftService } from "./services/giftService.js";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createOdometerService } from "./services/odometerService.js";
import { peopleService, type PeopleService } from "./services/peopleService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeDocumentStore } from "./testing/fakeDocuments.js";

const server = inject("postgres");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MISSING = 987_654_321; // an id no row has

/** Every route of the API apart from the health checks, which read no person's data. A new route must be added here. */
const ROUTES = [
  "GET /api/odometer", "POST /api/odometer", "POST /api/odometer/import", "PUT /api/odometer/:id", "DELETE /api/odometer/:id",
  "GET /api/gifts", "POST /api/gifts", "PUT /api/gifts/:id", "DELETE /api/gifts/:id",
  "GET /api/gifts/special", "POST /api/gifts/special", "PUT /api/gifts/special/:id", "DELETE /api/gifts/special/:id",
  "GET /api/workouts", "GET /api/workouts/goal", "PUT /api/workouts/goal", "POST /api/workouts", "PUT /api/workouts/:id", "DELETE /api/workouts/:id",
  "GET /api/weight", "POST /api/weight", "PUT /api/weight/:id", "DELETE /api/weight/:id",
  "GET /api/groceries", "POST /api/groceries", "PUT /api/groceries/:id", "DELETE /api/groceries/:id", "DELETE /api/groceries",
  "GET /api/maintenance", "POST /api/maintenance", "PUT /api/maintenance/:id", "DELETE /api/maintenance/:id",
  "GET /api/maintenance/places", "PUT /api/maintenance/places/:id", "DELETE /api/maintenance/places/:id",
  "GET /api/maintenance/documents", "GET /api/maintenance/documents/:id", "DELETE /api/maintenance/documents/:id", "POST /api/maintenance/:id/documents",
];

// The body of an answer, read loosely: this test looks at a few fields and compares whole answers.
type Answer = { status: number; json: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Call = (method: string, url: string, body?: unknown, raw?: { body: BodyInit; headers: Record<string, string> }) => Promise<Answer>;

describe.skipIf(!server)("one person cannot reach another person's data (real Postgres)", () => {
  let a: Call;
  let b: Call;
  let routes: string[] = [];
  const store = fakeDocumentStore();

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    const idA = await addTestPerson("person-a@example.test");
    const idB = await addTestPerson("person-b@example.test");
    const issuer = await createTestIssuer();
    const token = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL); // passes the owner check; the people service below decides whose data it is
    const documents = createDocumentService(documentRepository, store);
    const build = (id: number) => {
      const people: PeopleService = { ensureOwner: async () => ({ id, role: "user", status: "active" }), runAs: peopleService.runAs };
      const app = createApp({
        logger: createLogger(() => {}),
        checkDatabase: async () => true,
        odometer: createOdometerService(odometerRepository, { now: () => new Date("2026-11-13T12:00:00Z") }),
        gifts: createGiftService(giftRepository),
        workouts: createWorkoutService(workoutRepository, { now: () => new Date("2026-11-13T12:00:00Z") }),
        weight: createWeightService(weightRepository, { now: () => new Date("2026-11-13T12:00:00Z") }),
        maintenance: createMaintenanceService(maintenanceRepository, { now: () => new Date("2026-11-13T12:00:00Z"), documents }),
        documents,
        groceries: createGroceryService(groceryRepository),
        people,
        keys: issuer.keys,
      });
      if (id === idA) routes = app.routes.filter((r) => r.method !== "ALL" && !r.path.startsWith("/api/health")).map((r) => `${r.method} ${r.path}`);
      const call: Call = async (method, url, body, raw) => {
        const headers = new Headers({ "cf-access-jwt-assertion": token, [REQUEST_GUARD_HEADER]: REQUEST_GUARD_VALUE, ...(raw?.headers ?? { "content-type": "application/json" }) });
        const res = await app.request(url, { method, headers, body: raw ? raw.body : body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
        const text = await res.text();
        return { status: res.status, json: text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : { text } };
      };
      return call;
    };
    a = build(idA);
    b = build(idB);
  });
  afterAll(disconnectAppDatabase);

  it("[AC-SET-04.8] this test lists every route the API has, so a new route cannot skip the isolation check", () => {
    expect([...routes].sort()).toEqual([...ROUTES].sort());
  });

  // The same answer for another person's id as for an id that never existed, so ids are never confirmed to exist.
  async function sameAsMissing(call: Call, method: string, url: (id: number) => string, id: number, body?: unknown): Promise<void> {
    const theirs = await call(method, url(id), body);
    const nobodys = await call(method, url(MISSING), body);
    expect(theirs.status, `${method} ${url(id)}`).toBe(404);
    expect(theirs, `${method} ${url(id)}`).toEqual(nobodys);
  }

  it("[AC-SET-04.2][AC-SET-04.8] odometer: another person sees none of it, cannot change or delete it, and importing the same rows adds them for that person only", async () => {
    const saved = await a("POST", "/api/odometer", { miles: 50_000 });
    expect(saved.status).toBe(201);
    const id = saved.json.reading.id as number;
    expect((await b("GET", "/api/odometer?all=1")).json).toEqual({ readings: [] });
    await sameAsMissing(b, "PUT", (n) => `/api/odometer/${n}`, id, { miles: 60_000, confirmed: true });
    await sameAsMissing(b, "DELETE", (n) => `/api/odometer/${n}`, id);
    expect((await a("GET", "/api/odometer?all=1")).json.readings).toEqual([expect.objectContaining({ id, miles: 50_000 })]);

    const row = { date: saved.json.reading.date as string, miles: 50_000 };
    const imported = await b("POST", "/api/odometer/import", { rows: [row] });
    expect(imported.status).toBe(200);
    expect(imported.json).toEqual({ imported: 1, duplicates: 0 }); // not a duplicate of the other person's identical row
    expect((await a("GET", "/api/odometer?all=1")).json.readings).toHaveLength(1);
    expect((await b("GET", "/api/odometer?all=1")).json.readings).toHaveLength(1);
  });

  it("[AC-SET-04.2][AC-SET-04.8] gifts and special contributions are private to the person who saved them", async () => {
    const gift = await a("POST", "/api/gifts", { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" });
    const special = await a("POST", "/api/gifts/special", { dateGiven: "2026-02-03", occasion: "Sample appeal", cents: 500, method: "card" });
    expect([gift.status, special.status]).toEqual([201, 201]);
    expect((await b("GET", "/api/gifts")).json).toEqual(expect.objectContaining({ gifts: [] }));
    expect(JSON.stringify((await b("GET", "/api/gifts/special")).json)).not.toContain("Sample appeal");
    await sameAsMissing(b, "PUT", (n) => `/api/gifts/${n}`, gift.json.id, { dateGiven: "2026-02-04", forMonth: "2026-01", cents: 1, method: "card" });
    await sameAsMissing(b, "DELETE", (n) => `/api/gifts/${n}`, gift.json.id);
    await sameAsMissing(b, "PUT", (n) => `/api/gifts/special/${n}`, special.json.id, { dateGiven: "2026-02-04", occasion: "Changed", cents: 1, method: "card" });
    await sameAsMissing(b, "DELETE", (n) => `/api/gifts/special/${n}`, special.json.id);
    expect(JSON.stringify((await a("GET", "/api/gifts")).json)).toContain(String(gift.json.id));
    expect(JSON.stringify((await a("GET", "/api/gifts/special")).json)).toContain("Sample appeal");
  });

  it("[AC-SET-04.2][AC-SET-04.8] workouts are private to the person who saved them", async () => {
    const saved = await a("POST", "/api/workouts", { type: "Run", minutes: 30 });
    expect(saved.status).toBe(201);
    expect(JSON.stringify((await b("GET", "/api/workouts")).json)).not.toContain("Run");
    await sameAsMissing(b, "PUT", (n) => `/api/workouts/${n}`, saved.json.id, { type: "Hike", minutes: 90 });
    await sameAsMissing(b, "DELETE", (n) => `/api/workouts/${n}`, saved.json.id);
    expect(JSON.stringify((await a("GET", "/api/workouts")).json)).toContain("Run");
  });

  it("[AC-SET-04.2][AC-SET-04.8][AC-HLT-05.6] the weekly workout goal is private: one person's goal is never another's, and each person has their own", async () => {
    expect((await a("GET", "/api/workouts/goal")).json).toEqual({ perWeek: null });
    expect((await a("PUT", "/api/workouts/goal", { perWeek: 4 })).json).toEqual({ perWeek: 4 });
    expect((await b("GET", "/api/workouts/goal")).json).toEqual({ perWeek: null });
    expect((await b("PUT", "/api/workouts/goal", { perWeek: 2 })).json).toEqual({ perWeek: 2 });
    expect((await a("GET", "/api/workouts/goal")).json).toEqual({ perWeek: 4 });
  });

  it("[AC-SET-04.2][AC-SET-04.8][AC-SET-04.10] weight is private, and each person can have an entry for the same day", async () => {
    const mine = await a("POST", "/api/weight", { pounds: 180 });
    expect(mine.status).toBe(201);
    expect((await b("GET", "/api/weight")).json).toEqual(expect.objectContaining({ entries: [] }));
    await sameAsMissing(b, "PUT", (n) => `/api/weight/${n}`, mine.json.entry.id, { pounds: 150 });
    await sameAsMissing(b, "DELETE", (n) => `/api/weight/${n}`, mine.json.entry.id);
    expect(JSON.stringify((await a("GET", "/api/weight")).json)).toContain("180");
  });

  it("[AC-SET-04.2][AC-SET-04.8][AC-GRO-01.6] the grocery list is private, the same item id is a separate item for each person, and clearing one list leaves the other", async () => {
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    expect((await a("POST", "/api/groceries", { id, name: "Sample cheese" })).status).toBe(201);
    expect((await b("GET", "/api/groceries")).json).toEqual({ items: [] });
    const edit = { name: "Changed", quantity: "", note: "", section: "Other", found: true };
    expect(await b("PUT", `/api/groceries/${id}`, edit)).toEqual(await b("PUT", "/api/groceries/99999999-9999-4999-8999-999999999999", edit));
    expect((await b("PUT", `/api/groceries/${id}`, edit)).status).toBe(404);
    expect((await b("DELETE", `/api/groceries/${id}`)).status).toBe(404);
    expect((await b("POST", "/api/groceries", { id, name: "Sample bread" })).status).toBe(201); // b's own item, not a repeat of a's
    expect((await a("GET", "/api/groceries")).json.items).toEqual([expect.objectContaining({ id, name: "Sample cheese", found: false })]);
    expect((await b("DELETE", "/api/groceries")).status).toBe(204);
    expect((await b("GET", "/api/groceries")).json).toEqual({ items: [] });
    expect((await a("GET", "/api/groceries")).json.items).toHaveLength(1);
  });

  it("[AC-SET-04.2][AC-SET-04.6][AC-SET-04.8] services, places and documents are private, and a document cannot be fetched, deleted or added to by another person", async () => {
    const service = await a("POST", "/api/maintenance", { date: "2026-11-10", services: ["Oil change"], doneBy: "shop", placeName: "Sample Garage" });
    expect(service.status).toBe(201);
    const recordId = service.json.id as number;
    const placeId = service.json.place.id as number;
    const upload = await a("POST", `/api/maintenance/${recordId}/documents`, undefined, { body: PNG, headers: { "content-type": "image/png", "content-length": String(PNG.byteLength) } });
    expect(upload.status).toBe(201);
    const documentId = upload.json.id as number;
    const filesBefore = store.files.size;

    expect((await b("GET", "/api/maintenance")).json).toEqual({ records: [] });
    expect(JSON.stringify((await b("GET", "/api/maintenance/places")).json)).not.toContain("Sample Garage");
    expect(JSON.stringify((await b("GET", "/api/maintenance/documents")).json)).not.toContain(String(documentId));
    await sameAsMissing(b, "PUT", (n) => `/api/maintenance/${n}`, recordId, { date: "2026-11-11", services: ["Brakes"], doneBy: "home" });
    await sameAsMissing(b, "DELETE", (n) => `/api/maintenance/${n}`, recordId);
    await sameAsMissing(b, "PUT", (n) => `/api/maintenance/places/${n}`, placeId, { name: "Taken over" });
    await sameAsMissing(b, "DELETE", (n) => `/api/maintenance/places/${n}`, placeId);
    await sameAsMissing(b, "GET", (n) => `/api/maintenance/documents/${n}`, documentId);
    await sameAsMissing(b, "DELETE", (n) => `/api/maintenance/documents/${n}`, documentId);
    const intruder = await b("POST", `/api/maintenance/${recordId}/documents`, undefined, { body: PNG, headers: { "content-type": "image/png", "content-length": String(PNG.byteLength) } });
    const nobodys = await b("POST", `/api/maintenance/${MISSING}/documents`, undefined, { body: PNG, headers: { "content-type": "image/png", "content-length": String(PNG.byteLength) } });
    expect(intruder).toEqual(nobodys);
    expect(intruder.status).toBe(404);

    // Nothing of A's changed, and no file was added or removed.
    expect(store.files.size).toBe(filesBefore);
    expect((await a("GET", "/api/maintenance")).json.records).toEqual([expect.objectContaining({ id: recordId })]);
    expect((await a("GET", `/api/maintenance/documents/${documentId}`)).status).toBe(200);
  });

  it("[AC-SET-04.2][AC-SET-04.6] a person's documents are stored under a folder named for them", async () => {
    const keys = [...store.files.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => /^\d+\/[0-9a-f-]{36}$/.test(key))).toBe(true);
  });
});
