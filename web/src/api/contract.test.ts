import { describe, expect, it, vi } from "vitest";
import { createDemoApi } from "../demo/demoApi";
import { createClient } from "./client";
import type { Api } from "./types";

// One suite, two implementations (ADR-0014). `client.ts` runs against a fake network edge that answers the way
// the Worker does; `demoApi.ts` runs as is. Add each new method to `contract` so the two cannot drift.
const SAVED = { status: "saved", reading: { id: 9, date: "2026-11-13", miles: 48_402 } };
const WARNING = { status: "needs_confirmation", warnings: [{ kind: "lower_than_previous", previous: { date: "2026-11-06", miles: 48_550 } }] };

function fakeNetwork(sent: { method?: string; body?: string; guard?: string | null; url: string }[] = []): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    sent.push({ url: input, method: init?.method, body: init?.body as string | undefined, guard: new Headers(init?.headers).get("x-life-tracker") });
    if (input === "/api/health") return Response.json({ status: "ok" });
    if (input === "/api/odometer" && init?.method === "GET") return Response.json({ readings: [SAVED.reading] });
    if (input === "/api/odometer" && init?.method === "POST") {
      return JSON.parse(init.body as string).miles === 100 ? Response.json(WARNING, { status: 409 }) : Response.json(SAVED, { status: 201 });
    }
    if (input === "/api/odometer/9" && init?.method === "PUT") return Response.json(SAVED);
    if (input === "/api/odometer/9" && init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
}

const implementations: Array<[string, () => Api]> = [
  ["client.ts", () => createClient(fakeNetwork())],
  ["demoApi.ts", () => createDemoApi()],
];

const METHODS = ["health", "listReadings", "logReading", "editReading", "deleteReading"] as const satisfies ReadonlyArray<keyof Api>;

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
