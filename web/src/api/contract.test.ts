import { describe, expect, it, vi } from "vitest";
import { createDemoApi } from "../demo/demoApi";
import { createClient } from "./client";
import type { Api } from "./types";

// One suite, two implementations (ADR-0014). `client.ts` runs against a fake network edge that answers the way
// the Worker does; `demoApi.ts` runs as is. Add each new method to `contract` so the two cannot drift.
const SAVED = { status: "saved", reading: { id: 9, date: "2026-11-13", miles: 48_402 } };
const GIFT = { id: 7, dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" };
const WARNING = { status: "needs_confirmation", warnings: [{ kind: "lower_than_previous", previous: { date: "2026-11-06", miles: 48_550 } }] };

const WORKOUT = { id: 7, date: "2026-11-13", type: "Run", minutes: 30, note: null, source: "manual" };

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
    if (input === "/api/gifts" && init?.method === "GET") return Response.json({ gifts: [GIFT] });
    if (input === "/api/gifts" && init?.method === "POST") return Response.json(GIFT, { status: 201 });
    if (input === "/api/gifts/7" && init?.method === "PUT") return Response.json(GIFT);
    if (input === "/api/gifts/7" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/workouts" && init?.method === "GET") return Response.json({ workouts: [WORKOUT] });
    if (input === "/api/workouts" && init?.method === "POST") return Response.json(WORKOUT, { status: 201 });
    if (input === "/api/workouts/7" && init?.method === "PUT") return Response.json(WORKOUT);
    if (input === "/api/workouts/7" && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (input === "/api/odometer/9" && init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
}

const implementations: Array<[string, () => Api]> = [
  ["client.ts", () => createClient(fakeNetwork())],
  ["demoApi.ts", () => createDemoApi()],
];

const METHODS = ["health", "listReadings", "listAllReadings", "logReading", "editReading", "deleteReading", "listGifts", "logGift", "editGift", "deleteGift", "importReadings", "listWorkouts", "logWorkout", "editWorkout", "deleteWorkout"] as const satisfies ReadonlyArray<keyof Api>;

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
  const input = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" } as const;

  it("lists, saves, edits and deletes gifts with the shared shapes", async () => {
    const api = make();
    const { gifts } = await api.listGifts();
    expect(gifts.length).toBeGreaterThan(0);
    expect(await api.logGift(input)).toMatchObject({ id: expect.any(Number), ...input });
    expect(await api.editGift(gifts[0]!.id, input)).toMatchObject(input);
    await expect(api.deleteGift(gifts[0]!.id)).resolves.toBeUndefined();
  });
});

describe("demo gift behaviour", () => {
  const input = { dateGiven: "2026-12-03", forMonth: "2026-11", cents: 2_500, method: "card" } as const;

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
    const input = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" } as const;
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

describe("client.ts workout requests", () => {
  it("[AC-HLT-02.1][AC-HLT-02.2] sends only type, minutes and note with the custom header", async () => {
    const sent: { method?: string; body?: string; guard?: string | null; url: string }[] = [];
    const api = createClient(fakeNetwork(sent));
    await api.logWorkout({ type: "Run", minutes: 30 });
    await api.editWorkout(7, { type: "Run", minutes: 35, note: "hills" });
    await api.deleteWorkout(7);
    expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
      ["POST", "/api/workouts", '{"type":"Run","minutes":30}'],
      ["PUT", "/api/workouts/7", '{"type":"Run","minutes":35,"note":"hills"}'],
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
