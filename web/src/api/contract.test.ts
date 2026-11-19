import { describe, expect, it, vi } from "vitest";
import { createDemoApi } from "../demo/demoApi";
import { createClient } from "./client";
import type { Api } from "./types";

// One suite, two implementations (ADR-0014). `client.ts` runs against a fake network edge that answers the way
// the Worker does; `demoApi.ts` runs as is. Add each new method to `contract` so the two cannot drift.
const SAVED = { status: "saved", reading: { id: 9, date: "2026-11-13", miles: 48_402 } };
const GIFT = { id: 7, dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check", description: null };
const WARNING = { status: "needs_confirmation", warnings: [{ kind: "lower_than_previous", previous: { date: "2026-11-06", miles: 48_550 } }] };

const SERVICE = { id: 4, date: "2026-11-10", services: ["Oil change"], doneBy: "shop", place: { id: 1, name: "Joe's Garage" }, costCents: 8999, odometerMiles: 48_300, note: null };
const WORKOUT = { id: 7, date: "2026-11-13", type: "Run", minutes: 30, reps: null, note: null, source: "manual" };

function fakeNetwork(sent: { method?: string; body?: string; guard?: string | null; url: string }[] = []): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    sent.push({ url: input, method: init?.method, body: init?.body as string | undefined, guard: new Headers(init?.headers).get("x-life-tracker") });
    if (input === "/api/health") return Response.json({ status: "ok" });
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
    if (input === "/api/workouts/7" && init?.method === "PUT") return Response.json(WORKOUT);
    if (input === "/api/workouts/7" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/odometer/9" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/maintenance/places" && init?.method === "GET") return Response.json({ places: [SERVICE.place] });
    if (input === "/api/maintenance" && init?.method === "GET") return Response.json({ records: [SERVICE] });
    if (input === "/api/maintenance" && init?.method === "POST") return Response.json(SERVICE, { status: 201 });
    if (input === "/api/maintenance/4" && init?.method === "PUT") return Response.json(SERVICE);
    if (input === "/api/maintenance/4" && init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
}

const implementations: Array<[string, () => Api]> = [
  ["client.ts", () => createClient(fakeNetwork())],
  ["demoApi.ts", () => createDemoApi()],
];

const SPECIAL = { id: 3, dateGiven: "2026-03-29", occasion: "Spring offering", cents: 10_000, method: "card" };
const WEIGHT = { id: 5, date: "2026-11-18", pounds: 172.4 };
const METHODS = ["health", "listReadings", "listAllReadings", "logReading", "editReading", "deleteReading", "listGifts", "logGift", "editGift", "deleteGift", "listWeights", "logWeight", "editWeight", "deleteWeight", "listSpecialContributions", "logSpecialContribution", "editSpecialContribution", "deleteSpecialContribution", "importReadings", "listWorkouts", "logWorkout", "editWorkout", "deleteWorkout", "listMaintenance", "listServicePlaces", "logMaintenance", "editMaintenance", "deleteMaintenance"] as const satisfies ReadonlyArray<keyof Api>;

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

describe.each(implementations)("[AC-MIL-05.9] maintenance contract: %s", (_name, make) => {
  it("lists, saves, edits and deletes with the shared record shape, and lists the places", async () => {
    const api = make();
    const list = await api.listMaintenance();
    expect(list.records.length).toBeGreaterThan(0);
    expect((await api.listServicePlaces()).places.length).toBeGreaterThan(0);
    const request = { date: "2026-11-10", services: ["Oil change"], doneBy: "shop" as const, placeName: "Joe's Garage", costCents: 8999 };
    expect(await api.logMaintenance(request)).toMatchObject({ services: ["Oil change"], doneBy: "shop" });
    const first = list.records[0]!;
    expect(await api.editMaintenance(first.id, request)).toMatchObject({ id: first.id });
    await expect(api.deleteMaintenance(first.id)).resolves.toBeUndefined();
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
    expect(sent.map((r) => [r.method ?? "GET", r.url, r.body])).toEqual([
      ["GET", "/api/maintenance", undefined],
      ["GET", "/api/maintenance/places", undefined],
      ["POST", "/api/maintenance", JSON.stringify(request)],
      ["PUT", "/api/maintenance/4", JSON.stringify(request)],
      ["DELETE", "/api/maintenance/4", undefined],
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
