import { describe, expect, it, vi } from "vitest";
import { createDemoApi } from "../demo/demoApi";
import { createClient } from "./client";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_RECORD } from "@life-tracker/shared";
import type { Api } from "./types";

// One suite, two implementations (ADR-0014). `client.ts` runs against a fake network edge that answers the way
// the Worker does; `demoApi.ts` runs as is. Add each new method to `contract` so the two cannot drift.
const SAVED = { status: "saved", reading: { id: 9, date: "2026-11-13", miles: 48_402 } };
const GIFT = { id: 7, dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check", description: null };
const WARNING = { status: "needs_confirmation", warnings: [{ kind: "lower_than_previous", previous: { date: "2026-11-06", miles: 48_550 } }] };

const SERVICE = { id: 4, date: "2026-11-10", services: ["Oil change"], doneBy: "shop", place: { id: 1, name: "Joe's Garage" }, costCents: 8999, odometerMiles: 48_300, note: null };
const INTERVAL = { id: 1, service: "Oil change", miles: 5000, months: 6 };
const DOCUMENT = { id: 9, recordId: 4, contentType: "image/png", bytes: 11, createdAt: "2026-11-13T12:00:00Z" };
const WORKOUT = { id: 7, date: "2026-11-13", type: "Run", minutes: 30, reps: null, note: null, source: "manual" };

function fakeNetwork(sent: { method?: string; body?: string; guard?: string | null; url: string }[] = []): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    sent.push({ url: input, method: init?.method, body: init?.body as string | undefined, guard: new Headers(init?.headers).get("x-life-tracker") });
    if (input === "/api/health") return Response.json({ status: "ok" });
    if (input === "/api/health/parts") return Response.json({ database: "ok", documents: "ok", signIn: "ok" });
    if (input === "/api/odometer" && init?.method === "GET") return Response.json({ readings: [SAVED.reading] });
    if (input === "/api/odometer?all=1" && init?.method === "GET") return Response.json({ readings: [SAVED.reading] });
    if (input === "/api/odometer" && init?.method === "POST") {
      return JSON.parse(init.body as string).miles === 100 ? Response.json(WARNING, { status: 409 }) : Response.json(SAVED, { status: 201 });
    }
    if (input === "/api/odometer/import" && init?.method === "POST") return Response.json({ imported: 1, duplicates: 0 });
    if (input === "/api/odometer/9" && init?.method === "PUT") return Response.json(SAVED);
    if (input === "/api/weight" && init?.method === "GET") return Response.json({ entries: [WEIGHT] });
    if (input === "/api/weight" && init?.method === "POST") {
      return JSON.parse(init.body as string).pounds === 100 ? Response.json({ status: "needs_replace", existing: WEIGHT }, { status: 409 }) : Response.json({ status: "saved", entry: WEIGHT }, { status: 201 });
    }
    if (input === "/api/weight/5" && init?.method === "PUT") return Response.json(WEIGHT);
    if (input === "/api/weight/5" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/groceries" && init?.method === "GET") return Response.json({ items: [GROCERY] });
    if (input === "/api/groceries" && init?.method === "POST") {
      const sentId = JSON.parse(init.body as string).id as string;
      return sentId.startsWith("ffffffff") ? Response.json({ error: "list_full" }, { status: 409 }) : Response.json(GROCERY, { status: sentId === GROCERY.id ? 200 : 201 });
    }
    if (input === "/api/groceries" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === `/api/groceries/${GROCERY.id}` && init?.method === "PUT") return Response.json({ ...GROCERY, ...JSON.parse(init.body as string) });
    if (input === `/api/groceries/${GROCERY.id}` && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/gifts/special" && init?.method === "GET") return Response.json({ contributions: [SPECIAL] });
    if (input === "/api/gifts/special" && init?.method === "POST") return Response.json(SPECIAL, { status: 201 });
    if (input === "/api/gifts/special/3" && init?.method === "PUT") return Response.json(SPECIAL);
    if (input === "/api/gifts/special/3" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/gifts" && init?.method === "GET") return Response.json({ gifts: [GIFT] });
    if (input === "/api/gifts" && init?.method === "POST") return Response.json(GIFT, { status: 201 });
    if (input === "/api/gifts/7" && init?.method === "PUT") return Response.json(GIFT);
    if (input === "/api/gifts/7" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/workouts" && init?.method === "GET") return Response.json({ workouts: [WORKOUT] });
    if (input === "/api/workouts" && init?.method === "POST") return Response.json(WORKOUT, { status: 201 });
    if (input === "/api/workouts/goal" && init?.method === "GET") return Response.json({ perWeek: null });
    if (input === "/api/workouts/goal" && init?.method === "PUT") return Response.json(JSON.parse(init.body as string));
    if (input === "/api/workouts/7" && init?.method === "PUT") return Response.json(WORKOUT);
    if (input === "/api/workouts/7" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/odometer/9" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/maintenance/documents" && init?.method === "GET") return Response.json({ documents: [DOCUMENT] });
    if (input === "/api/maintenance/documents/9" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/maintenance/4/documents" && init?.method === "POST") return Response.json(DOCUMENT, { status: 201 });
    const refusal = /^\/api\/maintenance\/(5|6|7|8|9)\/documents$/.exec(input);
    if (refusal && init?.method === "POST") {
      const answers = { 5: [409, "limit_reached"], 6: [413, "too_large"], 7: [415, "unsupported_type"], 8: [404, "not_found"], 9: [409, "too_much"] } as const;
      const [status, error] = answers[Number(refusal[1]) as keyof typeof answers];
      return Response.json({ error }, { status });
    }
    if (input === "/api/maintenance/intervals" && init?.method === "GET") return Response.json({ intervals: [INTERVAL] });
    if (input === "/api/maintenance/intervals" && init?.method === "PUT") return Response.json({ id: 2, miles: null, months: null, ...JSON.parse(init.body as string) });
    if (input === "/api/maintenance/intervals/1" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/maintenance/places" && init?.method === "GET") return Response.json({ places: [SERVICE.place] });
    if (input === "/api/maintenance" && init?.method === "GET") return Response.json({ records: [SERVICE] });
    if (input === "/api/maintenance" && init?.method === "POST") return Response.json(SERVICE, { status: 201 });
    if (input === "/api/maintenance/4" && init?.method === "PUT") return Response.json(SERVICE);
    if (input === "/api/maintenance/4" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/maintenance/places/1" && init?.method === "PUT") return JSON.parse(init.body as string).name === "Taken" ? Response.json({ error: "name_taken" }, { status: 409 }) : Response.json({ id: 1, name: "Joe's Auto" });
    if (input === "/api/maintenance/places/1" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/maintenance/places/2" && init?.method === "DELETE") return Response.json({ error: "in_use" }, { status: 409 });
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
}

const implementations: Array<[string, () => Api]> = [
  ["client.ts", () => createClient(fakeNetwork())],
  ["demoApi.ts", () => createDemoApi()],
];

const SPECIAL = { id: 3, dateGiven: "2026-03-29", occasion: "Spring offering", cents: 10_000, method: "card" };
const GROCERY = { id: "11111111-1111-4111-8111-111111111111", name: "Milk", quantity: "2", note: "", section: "Dairy and eggs", found: false };
const WEIGHT = { id: 5, date: "2026-11-18", pounds: 172.4 };
const METHODS = ["health", "getAvailability", "listReadings", "listAllReadings", "logReading", "editReading", "deleteReading", "listGifts", "logGift", "editGift", "deleteGift", "listWeights", "logWeight", "editWeight", "deleteWeight", "listSpecialContributions", "logSpecialContribution", "editSpecialContribution", "deleteSpecialContribution", "importReadings", "listGroceries", "addGrocery", "editGrocery", "deleteGrocery", "clearGroceries", "listWorkouts", "logWorkout", "editWorkout", "deleteWorkout", "getWorkoutGoal", "saveWorkoutGoal", "listMaintenance", "listServicePlaces", "logMaintenance", "editMaintenance", "deleteMaintenance", "renameServicePlace", "deleteServicePlace", "listServiceIntervals", "saveServiceInterval", "deleteServiceInterval", "listDocuments", "uploadDocument", "deleteDocument", "documentUrl", "documentDownloadUrl"] as const satisfies ReadonlyArray<keyof Api>;

describe.each(implementations)("[AC-DEM-01.5] API contract: %s", (_name, make) => {
  it("[AC-DEM-01.5] has every method of the shared interface", () => {
    const api = make();
    for (const method of METHODS) expect(typeof api[method]).toBe("function");
    expect(Object.keys(api).sort()).toEqual([...METHODS].sort());
  });

  it("[AC-DEM-01.5] health returns the shared response shape", async () => {
    expect(await make().health()).toEqual({ status: "ok" });
  });
});

describe.each(implementations)("[AC-MIL-01.1][AC-MIL-01.4] odometer contract: %s", (_name, make) => {
  it("lists readings, saves, edits and deletes with the shared result shapes", async () => {
    const api = make();
    const list = await api.listReadings();
    expect(list.readings.length).toBeGreaterThan(0);
    const saved = await api.logReading(1_000_000);
    expect(["saved", "needs_confirmation"]).toContain(saved.status);
    const id = list.readings[0]!.id;
    expect((await api.editReading(id, list.readings[0]!.miles)).status).toBe("saved");
    await expect(api.deleteReading(id)).resolves.toBeUndefined();
  });

  it("[AC-MIL-03.2] lists the whole reading history with the shared response shape", async () => {
    const { readings } = await make().listAllReadings();
    expect(readings.length).toBeGreaterThan(0);
    expect(readings[0]).toMatchObject({ id: expect.any(Number), date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), miles: expect.any(Number) });
  });

  it("[AC-MIL-01.2] a reading lower than the previous one comes back as a warning, not saved, until confirmed", async () => {
    const api = make();
    const before = (await api.listReadings()).readings;
    const result = await api.logReading(100);
    expect(result).toMatchObject({ status: "needs_confirmation", warnings: [{ kind: "lower_than_previous" }] });
    if (_name === "demoApi.ts") {
      expect((await api.listReadings()).readings).toHaveLength(before.length);
      expect((await api.logReading(100, true)).status).toBe("saved");
    }
  });
});

describe.each(implementations)("[AC-GIV-01.1][AC-GIV-01.4] gift contract: %s", (_name, make) => {
  const input = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check", description: null } as const;

  it("lists, saves, edits and deletes gifts with the shared shapes", async () => {
    const api = make();
    const { gifts } = await api.listGifts();
    expect(gifts.length).toBeGreaterThan(0);
    expect(await api.logGift(input)).toMatchObject({ id: expect.any(Number), ...input });
    expect(await api.editGift(gifts[0]!.id, input)).toMatchObject(input);
    await expect(api.deleteGift(gifts[0]!.id)).resolves.toBeUndefined();
  });
});

describe.each(implementations)("[AC-GIV-02.1] special contribution contract: %s", (_name, make) => {
  const input = { dateGiven: "2026-03-29", occasion: "Spring offering", cents: 10_000, method: "card" } as const;

  it("lists, saves, edits and deletes special contributions with the shared shapes", async () => {
    const api = make();
    const { contributions } = await api.listSpecialContributions();
    expect(contributions.length).toBeGreaterThan(0);
    expect(await api.logSpecialContribution(input)).toMatchObject({ id: expect.any(Number), ...input });
    expect(await api.editSpecialContribution(contributions[0]!.id, input)).toMatchObject(input);
    await expect(api.deleteSpecialContribution(contributions[0]!.id)).resolves.toBeUndefined();
  });
});

describe("demo special contribution behaviour", () => {
  const input = { dateGiven: "2026-11-09", occasion: "Disaster relief offering", cents: 7_500, method: "check" } as const;

  it("[AC-GIV-02.2] keeps special contributions out of the regular gift list", async () => {
    const api = createDemoApi();
    const regularBefore = (await api.listGifts()).gifts.length;
    const saved = await api.logSpecialContribution(input);
    expect(saved).toMatchObject({ occasion: "Disaster relief offering" });
    expect((await api.listGifts()).gifts).toHaveLength(regularBefore);
    expect((await api.listSpecialContributions()).contributions.map((c) => c.id)).toContain(saved.id);
  });

  it("[AC-GIV-02.1] edit replaces the contribution and delete removes it", async () => {
    const api = createDemoApi();
    const [first] = (await api.listSpecialContributions()).contributions;
    expect(await api.editSpecialContribution(first!.id, input)).toEqual({ id: first!.id, ...input });
    await api.deleteSpecialContribution(first!.id);
    expect((await api.listSpecialContributions()).contributions.map((c) => c.id)).not.toContain(first!.id);
    await expect(api.editSpecialContribution(first!.id, input)).rejects.toThrow();
  });
});

describe("demo gift behaviour", () => {
  const input = { dateGiven: "2026-12-03", forMonth: "2026-11", cents: 2_500, method: "card", description: null } as const;

  it("[AC-GIV-01.2][AC-GIV-01.3] keeps the month it is for apart from the date given, and several gifts can share a month", async () => {
    const api = createDemoApi();
    const before = (await api.listGifts()).gifts.filter((g) => g.forMonth === "2026-11").length;
    const saved = await api.logGift(input);
    expect(saved).toMatchObject({ dateGiven: "2026-12-03", forMonth: "2026-11" });
    expect((await api.listGifts()).gifts.filter((g) => g.forMonth === "2026-11")).toHaveLength(before + 1);
  });

  it("[AC-GIV-01.4] edit replaces the gift and delete removes it", async () => {
    const api = createDemoApi();
    const [first] = (await api.listGifts()).gifts;
    expect(await api.editGift(first!.id, input)).toEqual({ id: first!.id, ...input });
    await api.deleteGift(first!.id);
    expect((await api.listGifts()).gifts.map((g) => g.id)).not.toContain(first!.id);
    await expect(api.editGift(first!.id, input)).rejects.toThrow();
  });
});

describe("client.ts gift requests", () => {
  it("[AC-GIV-01.1][AC-GIV-01.4] sends the gift as JSON with the custom header on every write", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent));
    const input = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check", description: null } as const;
    await api.logGift(input);
    await api.editGift(7, input);
    await api.deleteGift(7);
    expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
      ["POST", "/api/gifts", JSON.stringify(input)],
      ["PUT", "/api/gifts/7", JSON.stringify(input)],
      ["DELETE", "/api/gifts/7", undefined],
    ]);
    expect(sent.every((r) => r.guard === "1")).toBe(true);
  });
});

describe.each(implementations)("[AC-MIL-04.1] import contract: %s", (_name, make) => {
  it("returns the shared result shape", async () => {
    const result = await make().importReadings([{ date: "2026-01-02", miles: 1000 }]);
    expect(result).toEqual({ imported: 1, duplicates: 0 });
  });
});

describe("demo import", () => {
  it("[AC-MIL-04.4] importing the same rows twice adds each reading once", async () => {
    const api = createDemoApi();
    const rows = [{ date: "2026-01-02", miles: 1000 }, { date: "2026-01-09", miles: 1120 }];
    expect(await api.importReadings(rows)).toEqual({ imported: 2, duplicates: 0 });
    expect(await api.importReadings(rows)).toEqual({ imported: 0, duplicates: 2 });
  });
});

describe.each(implementations)("[AC-HLT-02.1][AC-HLT-02.2][AC-HLT-02.3] workout contract: %s", (_name, make) => {
  it("lists, saves, edits and deletes with the shared record shape, source included", async () => {
    const api = make();
    const list = await api.listWorkouts();
    expect(list.workouts.length).toBeGreaterThan(0);
    expect(["manual", "apple_watch"]).toContain(list.workouts[0]!.source);
    expect(await api.logWorkout({ type: "Run", minutes: 30 })).toMatchObject({ type: "Run", minutes: 30, source: "manual" });
    const first = list.workouts[0]!;
    expect(await api.editWorkout(first.id, { type: "Walk", minutes: 20 })).toMatchObject({ source: expect.stringMatching(/manual|apple_watch/) });
    await expect(api.deleteWorkout(first.id)).resolves.toBeUndefined();
  });
});

describe.each(implementations)("[AC-HLT-05.6] workout goal contract: %s", (_name, make) => {
  it("[AC-HLT-05.6] has no goal at first, saves one and returns it in the shared shape", async () => {
    const api = make();
    expect(await api.getWorkoutGoal()).toEqual({ perWeek: null });
    expect(await api.saveWorkoutGoal(4)).toEqual({ perWeek: 4 });
  });
});

describe("demo workout goal behaviour", () => {
  it("[AC-HLT-05.6] keeps the goal for the next read, replaces it, and refuses a number outside 1 to 14", async () => {
    const api = createDemoApi();
    await api.saveWorkoutGoal(4);
    expect(await api.getWorkoutGoal()).toEqual({ perWeek: 4 });
    await api.saveWorkoutGoal(2);
    expect(await api.getWorkoutGoal()).toEqual({ perWeek: 2 });
    await expect(api.saveWorkoutGoal(0)).rejects.toThrow();
    await expect(api.saveWorkoutGoal(15)).rejects.toThrow();
    expect(await api.getWorkoutGoal()).toEqual({ perWeek: 2 });
  });
});

describe.each(implementations)("[AC-HLT-02.4] pushups contract: %s", (_name, make) => {
  it("[AC-HLT-02.4] saves a pushups workout with a count and no minutes", async () => {
    const api = make();
    const saved = await api.logWorkout({ type: "Pushups", reps: 40 });
    expect(saved).toMatchObject({ source: "manual" });
  });
});

describe("demo pushups behaviour", () => {
  it("[AC-HLT-02.4] a pushups workout keeps its count in the list and can be edited", async () => {
    const api = createDemoApi({ now: () => new Date(2026, 10, 13, 9, 0, 0) });
    const saved = await api.logWorkout({ type: "Pushups", reps: 40 });
    expect(saved).toMatchObject({ minutes: null, reps: 40 });
    expect((await api.listWorkouts()).workouts[0]).toMatchObject({ type: "Pushups", reps: 40, minutes: null });
    expect(await api.editWorkout(saved.id, { type: "Pushups", reps: 55 })).toMatchObject({ reps: 55, minutes: null });
  });
});

describe.each(implementations)("[AC-MIL-05.9][AC-MIL-08.6] maintenance contract: %s", (_name, make) => {
  it("lists, saves, edits and deletes with the shared record shape, and lists the places", async () => {
    const api = make();
    const list = await api.listMaintenance();
    expect(list.records.length).toBeGreaterThan(0);
    expect(Object.keys(list)).toEqual(["records"]);
    expect(Object.keys(list.records[0]!).some((k) => /document/i.test(k))).toBe(false);
    expect((await api.listServicePlaces()).places.length).toBeGreaterThan(0);
    const request = { date: "2026-11-10", services: ["Oil change"], doneBy: "shop" as const, placeName: "Joe's Garage", costCents: 8999 };
    expect(await api.logMaintenance(request)).toMatchObject({ services: ["Oil change"], doneBy: "shop" });
    const first = list.records[0]!;
    expect(await api.editMaintenance(first.id, request)).toMatchObject({ id: first.id });
    await expect(api.deleteMaintenance(first.id)).resolves.toBeUndefined();
  });
});

// The first bytes of a PNG, then filler. Synthetic: not a real image.
const pngBlob = (extra = 3) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(extra).fill(1)])]);

describe.each(implementations)("[AC-MIL-07.8][AC-MIL-08.8] document contract: %s", (_name, make) => {
  it("attaches a document to a service, lists it, gives it an address and removes it", async () => {
    const api = make();
    const record = (await api.listMaintenance()).records[0]!;
    const saved = await api.uploadDocument(record.id, pngBlob());
    expect(saved).toMatchObject({ status: "saved", document: { recordId: record.id, contentType: "image/png", bytes: 11 } });
    if (saved.status !== "saved") throw new Error("not saved");
    expect((await api.listDocuments()).documents.map((d) => d.recordId)).toContain(record.id);
    expect(typeof api.documentUrl(saved.document)).toBe("string");
    await expect(api.deleteDocument(saved.document.id)).resolves.toBeUndefined();
  });
});

describe("[AC-MIL-07.3] document answers (client.ts)", () => {
  it("reports each refusal the server can give, and sends the file as the body with the custom header and no file name", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent), { retryDelayMs: 0 });
    expect(await api.uploadDocument(5, pngBlob())).toEqual({ status: "limit_reached" });
    expect(await api.uploadDocument(6, pngBlob())).toEqual({ status: "too_large" });
    expect(await api.uploadDocument(7, pngBlob())).toEqual({ status: "unsupported_type" });
    expect(await api.uploadDocument(8, pngBlob())).toEqual({ status: "not_found" });
    expect(await api.uploadDocument(9, pngBlob())).toEqual({ status: "too_much" });
    expect(sent.map((r) => [r.method, r.url])).toEqual([5, 6, 7, 8, 9].map((id) => ["POST", `/api/maintenance/${id}/documents`]));
    expect(sent.every((r) => r.guard === "1")).toBe(true);
    expect(sent.every((r) => (r.body as unknown) instanceof Blob)).toBe(true);
    expect(api.documentUrl({ ...DOCUMENT, contentType: "image/png" } as never)).toBe("/api/maintenance/documents/9");
    expect(api.documentDownloadUrl({ ...DOCUMENT, contentType: "image/png" } as never)).toBe("/api/maintenance/documents/9?download=1");
  });
});

describe("demo documents", () => {
  const record = async (api: Api) => (await api.listMaintenance()).records[0]!.id;

  it("[AC-MIL-07.3][AC-MIL-07.8] checks the type from the bytes, the size and the limit of 10, and keeps files in memory only", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network call in demo mode")));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const api = createDemoApi();
      const id = await record(api);
      expect(await api.uploadDocument(id, new Blob(["plain text"], { type: "image/png" }))).toEqual({ status: "unsupported_type" });
      expect(await api.uploadDocument(id, { size: MAX_DOCUMENT_BYTES + 1 } as Blob)).toEqual({ status: "too_large" });
      expect(await api.uploadDocument(9999, pngBlob())).toEqual({ status: "not_found" });
      for (let i = 0; i < MAX_DOCUMENTS_PER_RECORD; i += 1) expect((await api.uploadDocument(id, pngBlob(i + 1))).status).toBe("saved");
      expect(await api.uploadDocument(id, pngBlob())).toEqual({ status: "limit_reached" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("[AC-MIL-07.8] shows an image from memory, has no address for a PDF, and removes documents with their service", async () => {
    const api = createDemoApi();
    const id = await record(api);
    const image = await api.uploadDocument(id, pngBlob());
    const pdf = await api.uploadDocument(id, new Blob([new TextEncoder().encode("%PDF-1.7 synthetic")]));
    if (image.status !== "saved" || pdf.status !== "saved") throw new Error("not saved");
    expect(api.documentUrl(image.document)).toMatch(/^data:image\/png;base64,/);
    expect(api.documentUrl(pdf.document)).toBeUndefined();
    await api.deleteMaintenance(id);
    expect((await api.listDocuments()).documents).toEqual([]);
  });
});

describe("[AC-MIL-06.5] place contract (client.ts)", () => {
  it("renames a place, reports a taken name, and reports a place that is in use", async () => {
    const api = createClient(fakeNetwork());
    expect(await api.renameServicePlace(1, "Joe's Auto")).toEqual({ status: "saved", place: { id: 1, name: "Joe's Auto" } });
    expect(await api.renameServicePlace(1, "Taken")).toEqual({ status: "name_taken" });
    expect(await api.deleteServicePlace(1)).toBe("deleted");
    expect(await api.deleteServicePlace(2)).toBe("in_use");
  });
});

describe("demo maintenance behaviour", () => {
  const friday = () => new Date(2026, 10, 13, 9, 0, 0);
  const base = { date: "2026-11-10", services: ["Tires"], doneBy: "shop" as const };

  it("[AC-MIL-05.3] reuses a place by name ignoring letter case, and offers a new one next time", async () => {
    const api = createDemoApi({ now: friday });
    const before = (await api.listServicePlaces()).places.length;
    await api.logMaintenance({ ...base, placeName: "joe's garage" });
    expect((await api.listServicePlaces()).places).toHaveLength(before);
    await api.logMaintenance({ ...base, placeName: "Acme Tire" });
    expect((await api.listServicePlaces()).places.map((p) => p.name)).toContain("Acme Tire");
  });

  it("[AC-MIL-05.2][AC-MIL-05.4] a service done at home has no place, and a cost of zero is kept", async () => {
    const api = createDemoApi({ now: friday });
    expect(await api.logMaintenance({ date: "2026-11-10", services: ["Air filter"], doneBy: "home", costCents: 0 })).toMatchObject({ place: null, costCents: 0 });
  });

  it("[AC-MIL-05.5] refuses a date in the future, like the real API", async () => {
    const api = createDemoApi({ now: friday });
    await expect(api.logMaintenance({ ...base, date: "2026-11-14" })).rejects.toThrow();
  });

  it("[AC-MIL-05.8] lists newest first, and edit and delete change the list", async () => {
    const api = createDemoApi({ now: friday });
    const dates = (await api.listMaintenance()).records.map((r) => r.date);
    expect(dates).toEqual([...dates].sort().reverse());
    const saved = await api.logMaintenance({ ...base, date: "2026-11-12" });
    expect((await api.listMaintenance()).records[0]!.id).toBe(saved.id);
    await api.editMaintenance(saved.id, { ...base, date: "2026-11-12", services: ["Brakes"] });
    expect((await api.listMaintenance()).records[0]!.services).toEqual(["Brakes"]);
    await api.deleteMaintenance(saved.id);
    expect((await api.listMaintenance()).records.map((r) => r.id)).not.toContain(saved.id);
  });

  it("[AC-MIL-06.5] renames a place for its services too, refuses a taken name, and deletes only an unused place", async () => {
    const api = createDemoApi({ now: friday });
    const unused = (await api.logMaintenance({ ...base, placeName: "Acme Tire" })).place!;
    expect(await api.renameServicePlace(1, "JOE'S garage")).toMatchObject({ status: "saved" });
    expect(await api.renameServicePlace(1, "acme tire")).toEqual({ status: "name_taken" });
    expect((await api.listMaintenance()).records.find((r) => r.place?.id === 1)!.place!.name).toBe("JOE'S garage");
    expect(await api.deleteServicePlace(1)).toBe("in_use");
    const record = (await api.listMaintenance()).records.find((r) => r.place?.id === unused.id)!;
    await api.deleteMaintenance(record.id);
    expect(await api.deleteServicePlace(unused.id)).toBe("deleted");
    expect((await api.listServicePlaces()).places.map((p) => p.id)).toEqual([1]);
  });
});

describe.each(implementations)("[AC-MIL-09.7] service interval contract: %s", (_name, make) => {
  it("lists intervals with the shared shape, saves one and removes one", async () => {
    const api = make();
    const { intervals } = await api.listServiceIntervals();
    expect(intervals.length).toBeGreaterThan(0);
    expect(intervals[0]).toMatchObject({ id: expect.any(Number), service: expect.any(String) });
    expect(await api.saveServiceInterval({ service: "Brakes", miles: 30_000 })).toMatchObject({ service: "Brakes", miles: 30_000, months: null });
    await expect(api.deleteServiceInterval(intervals[0]!.id)).resolves.toBeUndefined();
  });
});

describe("demo service intervals", () => {
  it("[AC-MIL-09.7] has sample intervals that live only in memory, replaces a type's interval ignoring letter case, and refuses bad input", async () => {
    const api = createDemoApi();
    const before = (await api.listServiceIntervals()).intervals;
    const replaced = await api.saveServiceInterval({ service: before[0]!.service.toUpperCase(), months: 3 });
    expect(replaced).toMatchObject({ id: before[0]!.id, months: 3, miles: null });
    expect((await api.listServiceIntervals()).intervals).toHaveLength(before.length);
    await expect(api.saveServiceInterval({ service: "X" })).rejects.toThrow();
    await expect(api.saveServiceInterval({ service: "X", miles: 0 })).rejects.toThrow();
    await expect(api.deleteServiceInterval(9999)).rejects.toThrow();
    // A second demo starts from the sample intervals again: nothing was kept.
    expect((await createDemoApi().listServiceIntervals()).intervals).toEqual(before);
  });
});

describe("client.ts maintenance requests", () => {
  it("[AC-MIL-05.9] sends the service as JSON with the custom header on writes, to the paths the API serves", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent), { retryDelayMs: 0 });
    const request = { date: "2026-11-10", services: ["Oil change"], doneBy: "home" as const, costCents: 0 };
    await api.listMaintenance();
    await api.listServicePlaces();
    await api.logMaintenance(request);
    await api.editMaintenance(4, request);
    await api.deleteMaintenance(4);
    await api.listServiceIntervals();
    await api.saveServiceInterval({ service: "Oil change", miles: 5000 });
    await api.deleteServiceInterval(1);
    expect(sent.map((r) => [r.method ?? "GET", r.url, r.body])).toEqual([
      ["GET", "/api/maintenance", undefined],
      ["GET", "/api/maintenance/places", undefined],
      ["POST", "/api/maintenance", JSON.stringify(request)],
      ["PUT", "/api/maintenance/4", JSON.stringify(request)],
      ["DELETE", "/api/maintenance/4", undefined],
      ["GET", "/api/maintenance/intervals", undefined],
      ["PUT", "/api/maintenance/intervals", JSON.stringify({ service: "Oil change", miles: 5000 })],
      ["DELETE", "/api/maintenance/intervals/1", undefined],
    ]);
    expect(sent.filter((r) => r.method !== "GET").every((r) => r.guard === "1")).toBe(true);
  });
});

describe("demo workout behaviour", () => {
  const friday = () => new Date(2026, 10, 13, 9, 0, 0);

  it("[AC-HLT-02.1][AC-HLT-02.3] dates a new workout today, marks it manual, and sends no date", async () => {
    const api = createDemoApi({ now: friday });
    expect(await api.logWorkout({ type: "Swim", minutes: 25, note: "pool" })).toMatchObject({ date: "2026-11-13", source: "manual", note: "pool" });
    expect((await api.listWorkouts()).workouts[0]).toMatchObject({ date: "2026-11-13", type: "Swim" });
  });

  it("[AC-HLT-02.2] edit keeps the date and source, delete removes the workout", async () => {
    const api = createDemoApi({ now: friday });
    const watch = (await api.listWorkouts()).workouts.find((w) => w.source === "apple_watch")!;
    expect(await api.editWorkout(watch.id, { type: "Hike", minutes: 60 })).toMatchObject({ date: watch.date, source: "apple_watch", type: "Hike" });
    await api.deleteWorkout(watch.id);
    expect((await api.listWorkouts()).workouts.map((w) => w.id)).not.toContain(watch.id);
  });
});

describe("client.ts time zone header", () => {
  it("[AC-SET-01.5] sends the owner's time zone from Settings with every request, reads and writes alike", async () => {
    const seen: Array<string | null> = [];
    const api = createClient(
      async (_input, init) => {
        seen.push(new Headers(init?.headers).get("x-owner-time-zone"));
        return Response.json({ readings: [], status: "saved", reading: { id: 1, date: "2026-11-13", miles: 1 } });
      },
      { timeZone: () => "Asia/Tokyo" },
    );
    await api.listReadings();
    await api.logReading(1);
    expect(seen).toEqual(["Asia/Tokyo", "Asia/Tokyo"]);
  });

  it("[AC-SET-01.5] reads the zone from the saved preferences when none is given", async () => {
    localStorage.setItem("life-tracker.preferences", JSON.stringify({ theme: "system", timeZone: "Europe/London", weightUnit: "lb" }));
    let seen: string | null = null;
    const api = createClient(async (_input, init) => {
      seen = new Headers(init?.headers).get("x-owner-time-zone");
      return Response.json({ readings: [] });
    });
    await api.listReadings();
    localStorage.clear();
    expect(seen).toBe("Europe/London");
  });
});

describe("client.ts workout goal requests", () => {
  it("[AC-HLT-05.6] reads the goal with GET and saves it with a PUT that sends only the number, with the custom header", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent));
    await api.getWorkoutGoal();
    await api.saveWorkoutGoal(4);
    expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
      ["GET", "/api/workouts/goal", undefined],
      ["PUT", "/api/workouts/goal", '{"perWeek":4}'],
    ]);
    expect(sent[1]!.guard).toBeTruthy();
  });
});

describe("client.ts workout requests", () => {
  it("[AC-HLT-02.1][AC-HLT-02.2] sends only type, minutes and note with the custom header", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent));
    await api.logWorkout({ type: "Run", minutes: 30 });
    await api.editWorkout(7, { type: "Run", minutes: 35, note: "hills" });
    await api.logWorkout({ type: "Pushups", reps: 40 });
    await api.deleteWorkout(7);
    expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
      ["POST", "/api/workouts", '{"type":"Run","minutes":30}'],
      ["PUT", "/api/workouts/7", '{"type":"Run","minutes":35,"note":"hills"}'],
      ["POST", "/api/workouts", '{"type":"Pushups","reps":40}'],
      ["DELETE", "/api/workouts/7", undefined],
    ]);
    expect(sent.every((r) => r.guard === "1")).toBe(true);
  });
});

describe("demo odometer behaviour", () => {
  const friday = () => new Date(2026, 10, 13, 9, 0, 0); // local time, so the local calendar date is 2026-11-13

  it("[AC-MIL-01.1] dates a new reading with today's date and takes no date from the caller", async () => {
    const api = createDemoApi({ now: friday });
    const saved = await api.logReading(48_500);
    expect(saved).toMatchObject({ status: "saved", reading: { date: "2026-11-13", miles: 48_500 } });
    expect((await api.listReadings()).readings[0]).toMatchObject({ date: "2026-11-13" });
  });

  it("[AC-MIL-01.3] a jump of more than 300 miles a day needs confirmation", async () => {
    const api = createDemoApi({ now: friday });
    expect(await api.logReading(48_402 + 301 * 7 + 1)).toMatchObject({ status: "needs_confirmation", warnings: [{ kind: "implausible_jump" }] });
  });

  it("[AC-MIL-01.4] edit keeps the date, delete removes the reading", async () => {
    const api = createDemoApi({ now: friday });
    const [newest] = (await api.listReadings()).readings;
    const edited = await api.editReading(newest!.id, newest!.miles + 5);
    expect(edited).toMatchObject({ status: "saved", reading: { id: newest!.id, date: newest!.date, miles: newest!.miles + 5 } });
    await api.deleteReading(newest!.id);
    expect((await api.listReadings()).readings.map((r) => r.id)).not.toContain(newest!.id);
  });
});

describe("client.ts import request", () => {
  it("[AC-MIL-04.5] sends only the parsed rows as JSON, with the custom header, never the file", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    await createClient(fakeNetwork(sent)).importReadings([{ date: "2026-01-02", miles: 1000 }]);
    expect(sent).toEqual([{ url: "/api/odometer/import", method: "POST", body: '{"rows":[{"date":"2026-01-02","miles":1000}]}', guard: "1" }]);
  });
});

describe("client.ts odometer requests", () => {
  it("[AC-MIL-01.1][AC-MIL-01.4] sends only the miles (never a date) with the custom header, and treats 409 as an answer", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent));
    expect(await api.logReading(100)).toMatchObject({ status: "needs_confirmation" });
    await api.logReading(48_402, true);
    await api.editReading(9, 48_402);
    await api.deleteReading(9);
    expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
      ["POST", "/api/odometer", '{"miles":100}'],
      ["POST", "/api/odometer", '{"miles":48402,"confirmed":true}'],
      ["PUT", "/api/odometer/9", '{"miles":48402}'],
      ["DELETE", "/api/odometer/9", undefined],
    ]);
    expect(sent.every((r) => r.guard === "1")).toBe(true);
  });
});

describe("demo API", () => {
  it("[AC-DEM-01.2][AC-DEM-01.3] answers from the browser without any network call", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network call in demo mode")));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await createDemoApi().health();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("client.ts failure path", () => {
  it("[AC-DEM-01.5] throws ApiError when the API answers with an error status", async () => {
    const denied = (async () => Response.json({ error: "unauthorized" }, { status: 401 })) as typeof fetch;
    await expect(createClient(denied).health()).rejects.toMatchObject({ status: 401 });
  });
});

describe("client.ts database wake-up", () => {
  const noWait = { retryDelayMs: 0 };

  it("[AC-FND-05.4] retries a 503 once and shows the waking state meanwhile", async () => {
    const states: boolean[] = [];
    const calls = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "waking" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    const api = createClient(calls as unknown as typeof fetch, { ...noWait, onWaking: (w) => states.push(w) });
    await expect(api.health()).resolves.toEqual({ status: "ok" });
    expect(calls).toHaveBeenCalledTimes(2);
    expect(states).toEqual([true, false]);
  });

  it("[AC-FND-05.4] gives up after one retry", async () => {
    const calls = vi.fn(async () => Response.json({ error: "down" }, { status: 503 }));
    await expect(createClient(calls as unknown as typeof fetch, { ...noWait, onWaking: () => {} }).health()).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveBeenCalledTimes(2);
  });
});

describe.each(implementations)("[AC-HLT-01.1] weight contract: %s", (_name, make) => {
  it("lists, saves, edits and deletes weights with the shared shapes", async () => {
    const api = make();
    const { entries } = await api.listWeights();
    expect(entries.length).toBeGreaterThan(0);
    expect((await api.logWeight(172.4, true)).status).toBe("saved");
    expect(await api.editWeight(entries[0]!.id, 171.5)).toMatchObject({ id: expect.any(Number), date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    await expect(api.deleteWeight(entries[0]!.id)).resolves.toBeUndefined();
  });
});

describe("client.ts weight requests", () => {
  it("[AC-HLT-01.3] a 409 is read as needs_replace, not as a failure, and replace is sent only when confirmed", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent));
    expect(await api.logWeight(100)).toMatchObject({ status: "needs_replace", existing: { pounds: 172.4 } });
    await api.logWeight(172.4, true);
    const posts = sent.filter((s) => s.url === "/api/weight" && s.method === "POST");
    expect(JSON.parse(posts[0]!.body!)).toEqual({ pounds: 100 });
    expect(JSON.parse(posts[1]!.body!)).toEqual({ pounds: 172.4, replace: true });
    expect(posts.every((p) => p.guard !== null)).toBe(true);
  });
});

describe("demo weight behaviour", () => {
  const today = () => new Date(2026, 10, 18, 9, 0);

  it("[AC-HLT-01.1] dates the entry today, with no date from the caller", async () => {
    const api = createDemoApi({ now: today });
    await api.logWeight(172.4);
    expect((await api.listWeights()).entries[0]).toMatchObject({ date: "2026-11-18", pounds: 172.4 });
  });

  it("[AC-HLT-01.3] a second entry for the day needs confirming, and confirming keeps one entry for the day", async () => {
    const api = createDemoApi({ now: today });
    await api.logWeight(172.4);
    expect(await api.logWeight(171)).toMatchObject({ status: "needs_replace", existing: { pounds: 172.4 } });
    await api.logWeight(171, true);
    const entries = (await api.listWeights()).entries.filter((e) => e.date === "2026-11-18");
    expect(entries).toEqual([expect.objectContaining({ pounds: 171 })]);
  });
});

describe.each(implementations)("[AC-GRO-01.1][AC-GRO-01.8] grocery contract: %s", (_name, make) => {
  it("lists, adds, edits, removes and clears the list with the shared shapes", async () => {
    const api = make();
    const { items } = await api.listGroceries();
    expect(items.length).toBeGreaterThan(0);
    const added = await api.addGrocery({ id: "22222222-2222-4222-8222-222222222222", name: "Bread" });
    expect(added.status).toBe("added");
    const edited = await api.editGrocery(items[0]!.id, { name: items[0]!.name, quantity: "", note: "", section: "Other", found: true });
    expect(edited).toMatchObject({ id: items[0]!.id, found: true });
    await expect(api.deleteGrocery(items[0]!.id)).resolves.toBeUndefined();
    await expect(api.clearGroceries()).resolves.toBeUndefined();
  });
});

describe("client.ts grocery requests", () => {
  it("[AC-GRO-01.1] sends the id the caller chose, reads 200 as already added and 409 as a full list, and sends the custom header on every write", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent));
    expect(await api.addGrocery({ id: "33333333-3333-4333-8333-333333333333", name: "Milk" })).toMatchObject({ status: "added" });
    expect(await api.addGrocery({ id: GROCERY.id, name: "Milk" })).toMatchObject({ status: "already_added" });
    expect(await api.addGrocery({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Milk" })).toEqual({ status: "list_full" });
    await api.editGrocery(GROCERY.id, { name: "Milk", quantity: "2", note: "", section: "Dairy and eggs", found: true });
    await api.deleteGrocery(GROCERY.id);
    await api.clearGroceries();
    const writes = sent.filter((s) => s.method !== "GET");
    expect(JSON.parse(writes[0]!.body!)).toEqual({ id: "33333333-3333-4333-8333-333333333333", name: "Milk" });
    expect(writes.map((w) => `${w.method} ${w.url}`)).toEqual([
      "POST /api/groceries", "POST /api/groceries", "POST /api/groceries", `PUT /api/groceries/${GROCERY.id}`, `DELETE /api/groceries/${GROCERY.id}`, "DELETE /api/groceries",
    ]);
    expect(writes.every((w) => w.guard !== null)).toBe(true);
  });
});

describe("demo grocery behaviour", () => {
  it("[AC-GRO-01.8] starts with a made-up list, guesses sections, and adding the same id twice makes one item", async () => {
    const api = createDemoApi();
    expect((await api.listGroceries()).items.length).toBeGreaterThan(3);
    const id = "44444444-4444-4444-8444-444444444444";
    expect(await api.addGrocery({ id, name: "Butter" })).toMatchObject({ status: "added", item: { section: "Dairy and eggs" } });
    expect(await api.addGrocery({ id, name: "Butter" })).toMatchObject({ status: "already_added" });
    expect((await api.listGroceries()).items.filter((i) => i.id === id)).toHaveLength(1);
  });

  it("[AC-GRO-01.5][AC-GRO-01.8] finish trip empties the list", async () => {
    const api = createDemoApi();
    await api.clearGroceries();
    expect((await api.listGroceries()).items).toEqual([]);
  });

  it("[AC-GRO-01.8] never calls the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await createDemoApi().listGroceries();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
