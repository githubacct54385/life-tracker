// Maintenance documents (MIL-07, ADR-0024) through the whole Worker: owner check, upload limits, the R2 adapter, headers,
// deletes and logging. Real services over in-memory fakes and a fake bucket; the SQL is covered by maintenanceApi.int.test.ts.
import { MAX_DOCUMENT_BYTES, REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorker, type Env } from "./worker.js";
import { createDocumentService } from "./services/documentService.js";
import { createGiftService } from "./services/giftService.js";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { r2DocumentStore } from "./repositories/documentStore.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeBucket, fakeDocumentRepo } from "./testing/fakeDocuments.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";

let issuer: Awaited<ReturnType<typeof createTestIssuer>>;
let ownerToken: string;
beforeAll(async () => {
  issuer = await createTestIssuer();
  ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
});

// The first bytes of each allowed type, followed by filler. Synthetic: not real images.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 1];
const PDF = [...Buffer.from("%PDF-1.7\n"), 1, 2, 3];
const bytes = (...parts: number[][]) => new Uint8Array(new ArrayBuffer(parts.flat().length)).map((_, i) => parts.flat()[i]!);

function setup(options: { bucket?: boolean } = {}) {
  const lines: string[] = [];
  const maintenanceRepo = fakeMaintenanceRepo();
  const documentRepo = fakeDocumentRepo(() => maintenanceRepo.rows.map((r) => r.id));
  const bucket = fakeBucket();
  const documents = createDocumentService(documentRepo, r2DocumentStore);
  const worker = createWorker({
    logger: createLogger((_level, line) => lines.push(line)),
    checkDatabase: async () => true,
    odometer: createOdometerService(fakeRepo()),
    gifts: createGiftService(fakeGiftRepo()),
    workouts: createWorkoutService(fakeWorkoutRepo()),
    weight: createWeightService(fakeWeightRepo()),
    maintenance: createMaintenanceService(maintenanceRepo, { now: () => new Date("2026-11-13T12:00:00Z"), documents }),
    documents,
    keys: issuer.keys,
  });
  const env: Env = { ...TEST_SETTINGS, ASSETS: { fetch: async () => new Response("<html></html>") }, ...(options.bucket === false ? {} : { DOCUMENTS: bucket }) };
  const call = (method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}, token: string | null = ownerToken) => {
    const h = new Headers({ ...headers });
    if (token !== null) h.set("cf-access-jwt-assertion", token);
    if (method !== "GET") h.set(REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE);
    return worker.fetch(new Request(`https://app.example.test${path}`, { method, headers: h, body }), env);
  };
  const upload = (recordId: number, data: Uint8Array<ArrayBuffer>, type = "application/octet-stream") => call("POST", `/api/maintenance/${recordId}/documents`, data, { "content-type": type, "content-length": String(data.byteLength) });
  const addService = async () => {
    const res = await call("POST", "/api/maintenance", JSON.stringify({ date: "2026-11-10", services: ["Oil change"], doneBy: "home" }), { "content-type": "application/json" });
    return ((await res.json()) as { id: number }).id;
  };
  return { call, upload, addService, bucket, lines, documentRepo, maintenanceRepo, env };
}

describe("uploading a document", () => {
  it("[AC-MIL-07.2][AC-MIL-07.3] stores a JPEG, PNG, WebP or PDF for an existing service and lists it, without a file name or storage key", async () => {
    const { upload, addService, call, bucket } = setup();
    const id = await addService();
    for (const [data, type] of [[bytes(JPEG), "image/jpeg"], [bytes(PNG), "image/png"], [bytes(WEBP), "image/webp"], [bytes(PDF), "application/pdf"]] as const) {
      const res = await upload(id, data);
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: expect.any(Number), recordId: id, contentType: type, bytes: data.byteLength, createdAt: expect.any(String) });
    }
    expect(bucket.objects.size).toBe(4);
    const list = await (await call("GET", "/api/maintenance/documents")).json();
    expect(JSON.stringify(list)).not.toMatch(/objectKey|object_key|filename|name/i);
    expect((list as { documents: unknown[] }).documents).toHaveLength(4);
  });

  it("[AC-MIL-07.3] decides the type from the file's own bytes: a claimed image type on a text file is refused and nothing is stored", async () => {
    const { upload, addService, bucket } = setup();
    const id = await addService();
    const res = await upload(id, new TextEncoder().encode("not an image at all"), "image/png");
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "unsupported_type" });
    expect(bucket.objects.size).toBe(0);
  });

  it("[AC-MIL-07.3] a PDF sent as image/png is stored as the PDF it really is", async () => {
    const { upload, addService, bucket } = setup();
    const id = await addService();
    expect(((await (await upload(id, bytes(PDF), "image/png")).json()) as { contentType: string }).contentType).toBe("application/pdf");
    expect([...bucket.objects.values()][0]!.contentType).toBe("application/pdf");
  });

  it("[AC-MIL-07.10] streams a 36 MB PDF through to storage in one piece", async () => {
    const { upload, addService, bucket } = setup();
    const id = await addService();
    const big = new Uint8Array(new ArrayBuffer(36 * 1024 * 1024));
    big.set(PDF);
    big[big.length - 1] = 7;
    const res = await upload(id, big);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { bytes: number }).bytes).toBe(big.byteLength);
    const stored = [...bucket.objects.values()][0]!.bytes;
    expect(stored.byteLength).toBe(big.byteLength);
    expect(stored[stored.length - 1]).toBe(7);
  });

  it("[AC-MIL-07.10] refuses a file over 100 MB by its declared length, without reading it, and stores nothing", async () => {
    const { call, addService, bucket } = setup();
    const id = await addService();
    const over = String(MAX_DOCUMENT_BYTES + 1);
    const res = await call("POST", `/api/maintenance/${id}/documents`, bytes(PNG), { "content-type": "image/png", "content-length": over });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
    expect(bucket.objects.size).toBe(0);
  });

  it("[AC-MIL-07.10] a body longer or shorter than it says is refused and nothing is kept", async () => {
    const { call, addService, bucket, documentRepo } = setup();
    const id = await addService();
    const longer = await call("POST", `/api/maintenance/${id}/documents`, bytes(PNG, [1, 2, 3, 4, 5, 6, 7, 8]), { "content-type": "image/png", "content-length": "12" });
    expect(longer.status).toBe(413);
    const shorter = await call("POST", `/api/maintenance/${id}/documents`, bytes(PNG), { "content-type": "image/png", "content-length": "40" });
    expect(shorter.status).toBe(400);
    expect(bucket.objects.size).toBe(0);
    expect(documentRepo.rows).toHaveLength(0);
  });

  it("[AC-MIL-07.10] an upload that does not say how long it is gets 411", async () => {
    const { call, addService, bucket } = setup();
    const id = await addService();
    expect((await call("POST", `/api/maintenance/${id}/documents`, bytes(PNG), { "content-type": "image/png" })).status).toBe(411);
    expect(bucket.objects.size).toBe(0);
  });

  it("[AC-MIL-07.10] refuses a document that would take a service past 250 MB in total, and leaves no file behind", async () => {
    const { upload, addService, bucket, documentRepo } = setup();
    const id = await addService();
    // Rows only: 249.9 MB already used, so even a small file does not fit.
    await documentRepo.insert(id, "earlier-1", "application/pdf", 100 * 1024 * 1024);
    await documentRepo.insert(id, "earlier-2", "application/pdf", 100 * 1024 * 1024);
    await documentRepo.insert(id, "earlier-3", "application/pdf", 49 * 1024 * 1024 + 900 * 1024);
    const res = await upload(id, new Uint8Array(new ArrayBuffer(300 * 1024)).map((_, i) => PNG[i] ?? 0));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "too_much" });
    expect(bucket.objects.size).toBe(0);
  });

  it("[AC-MIL-07.3] refuses a content type outside the allowed list", async () => {
    const { upload, addService, bucket } = setup();
    const id = await addService();
    expect((await upload(id, bytes(PNG), "text/html")).status).toBe(415);
    expect(bucket.objects.size).toBe(0);
  });

  it("[AC-MIL-07.3] refuses a service that does not exist, and leaves no file behind", async () => {
    const { upload, bucket } = setup();
    expect((await upload(99, bytes(PNG))).status).toBe(404);
    expect((await upload(0, bytes(PNG))).status).toBe(400);
    expect(bucket.objects.size).toBe(0);
  });

  it("[AC-MIL-07.4] allows 10 documents per service and refuses the 11th without leaving its file in storage", async () => {
    const { upload, addService, bucket } = setup();
    const id = await addService();
    for (let i = 0; i < 10; i += 1) expect((await upload(id, bytes(PNG, [i]))).status).toBe(201);
    const eleventh = await upload(id, bytes(PNG));
    expect(eleventh.status).toBe(409);
    expect(await eleventh.json()).toEqual({ error: "limit_reached" });
    expect(bucket.objects.size).toBe(10);
    const other = await addService();
    expect((await upload(other, bytes(PNG))).status).toBe(201);
  });

  it("[AC-MIL-07.4] stores each file under a random key that carries no file name", async () => {
    const { call, upload, addService, bucket } = setup();
    const id = await addService();
    await upload(id, bytes(PNG), "image/png");
    await call("POST", `/api/maintenance/${id}/documents`, bytes(PNG), { "content-type": "image/png", "content-length": String(PNG.length), "content-disposition": 'attachment; filename="invoice-jane-doe.png"' });
    const keys = [...bucket.objects.keys()];
    expect(keys).toHaveLength(2);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(keys).size).toBe(2);
  });

  it("[AC-MIL-07.2] fails closed when the bucket is not bound: an error, and nothing stored", async () => {
    const { upload, addService, documentRepo } = setup({ bucket: false });
    const id = await addService();
    expect((await upload(id, bytes(PNG))).status).toBe(500);
    expect(documentRepo.rows).toHaveLength(0);
  });
});

describe("reading a document", () => {
  it("[AC-MIL-07.5] serves the stored type with nosniff and private, no-store, and the security headers and CSP still apply", async () => {
    const { upload, addService, call } = setup();
    const id = await addService();
    const saved = (await (await upload(id, bytes(PNG))).json()) as { id: number };
    const res = await call("GET", `/api/maintenance/documents/${saved.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual(PNG);
  });

  it("[AC-MIL-07.13] a download gets a made-up name that carries nothing from the file, and the same private headers", async () => {
    const { upload, addService, call } = setup();
    const id = await addService();
    const saved = (await (await upload(id, bytes(PDF))).json()) as { id: number };
    const res = await call("GET", `/api/maintenance/documents/${saved.id}?download=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="life-tracker-document-${saved.id}.pdf"`);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const plain = await call("GET", `/api/maintenance/documents/${saved.id}`);
    expect(plain.headers.get("content-disposition")).toBe("inline");
  });

  it("[AC-MIL-07.5] a JSON answer from the API is still forced to no-store", async () => {
    const { call } = setup();
    expect((await call("GET", "/api/maintenance/documents")).headers.get("cache-control")).toBe("no-store");
  });

  it("[AC-MIL-07.6] a document whose file is missing answers 404 and the list still works", async () => {
    const { upload, addService, call, bucket } = setup();
    const id = await addService();
    const saved = (await (await upload(id, bytes(PNG))).json()) as { id: number };
    bucket.objects.clear();
    expect((await call("GET", `/api/maintenance/documents/${saved.id}`)).status).toBe(404);
    expect(((await (await call("GET", "/api/maintenance/documents")).json()) as { documents: unknown[] }).documents).toHaveLength(1);
    expect((await call("GET", "/api/maintenance/documents/999")).status).toBe(404);
  });

  it("[AC-MIL-07.6] a file with no record is never listed or served", async () => {
    const { call, bucket } = setup();
    await bucket.put("orphan-without-a-row-0000", bytes(PNG));
    expect(((await (await call("GET", "/api/maintenance/documents")).json()) as { documents: unknown[] }).documents).toEqual([]);
  });
});

describe("owner only", () => {
  it("[AC-MIL-07.2] every document route answers 401 without a signed-in owner, and nothing is stored", async () => {
    const { call, bucket, addService } = setup();
    const id = await addService();
    const none = null;
    expect((await call("GET", "/api/maintenance/documents", undefined, {}, none)).status).toBe(401);
    expect((await call("GET", "/api/maintenance/documents/1", undefined, {}, none)).status).toBe(401);
    expect((await call("DELETE", "/api/maintenance/documents/1", undefined, {}, none)).status).toBe(401);
    expect((await call("POST", `/api/maintenance/${id}/documents`, bytes(PNG), { "content-type": "image/png" }, none)).status).toBe(401);
    expect(bucket.objects.size).toBe(0);
  });
});

describe("deleting", () => {
  it("[AC-MIL-07.6] deleting a document deletes its stored file", async () => {
    const { upload, addService, call, bucket } = setup();
    const id = await addService();
    const saved = (await (await upload(id, bytes(PNG))).json()) as { id: number };
    expect((await call("DELETE", `/api/maintenance/documents/${saved.id}`)).status).toBe(204);
    expect(bucket.objects.size).toBe(0);
    expect((await call("DELETE", `/api/maintenance/documents/${saved.id}`)).status).toBe(404);
  });

  it("[AC-MIL-07.6] deleting a service deletes every stored file of it, and only its own", async () => {
    const { upload, addService, call, bucket, maintenanceRepo } = setup();
    const first = await addService();
    const second = await addService();
    await upload(first, bytes(PNG));
    await upload(first, bytes(PDF));
    await upload(second, bytes(JPEG));
    expect((await call("DELETE", `/api/maintenance/${first}`)).status).toBe(204);
    expect(bucket.objects.size).toBe(1);
    expect(maintenanceRepo.rows.map((r) => r.id)).toEqual([second]);
  });

  it("[AC-MIL-07.6] when a stored file cannot be deleted the service and its row are kept, so the delete can be retried", async () => {
    const { upload, addService, call, bucket, maintenanceRepo, documentRepo } = setup();
    const id = await addService();
    await upload(id, bytes(PNG));
    const realDelete = bucket.delete;
    bucket.delete = async () => {
      throw new Error("storage unavailable");
    };
    expect((await call("DELETE", `/api/maintenance/${id}`)).status).toBe(500);
    expect(maintenanceRepo.rows).toHaveLength(1);
    expect(documentRepo.rows).toHaveLength(1);
    bucket.delete = realDelete;
    expect((await call("DELETE", `/api/maintenance/${id}`)).status).toBe(204);
    expect(bucket.objects.size).toBe(0);
  });
});

describe("logging", () => {
  it("[AC-MIL-07.7] writes only counts and status codes for uploads, reads and deletes, never a key, a size, a type or content", async () => {
    const { upload, addService, call, lines, bucket } = setup();
    const id = await addService();
    const saved = (await (await upload(id, bytes(PNG))).json()) as { id: number };
    const key = [...bucket.objects.keys()][0]!;
    await call("GET", "/api/maintenance/documents");
    await call("GET", `/api/maintenance/documents/${saved.id}`);
    await upload(id, new TextEncoder().encode("refused text"), "image/png");
    await call("DELETE", `/api/maintenance/documents/${saved.id}`);
    const text = lines.join("\n");
    expect(text).not.toContain(key);
    expect(text).not.toMatch(/image\/png|application\/pdf|refused text|contentType|objectKey|bytes/);
    for (const line of lines) expect(Object.keys(JSON.parse(line) as object).every((k) => ["level", "event", "requestId", "route", "statusCode", "durationMs", "rowCount", "errorType", "errorCode", "droppedFields"].includes(k))).toBe(true);
  });
});
