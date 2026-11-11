import { describe, expect, it, vi } from "vitest";
import { createDemoApi } from "../demo/demoApi";
import { createClient } from "./client";
import type { Api } from "./types";

// One suite, two implementations (ADR-0014). `client.ts` runs against a fake network edge that answers the way
// the Worker does; `demoApi.ts` runs as is. Add each new method to `contract` so the two cannot drift.
function fakeNetwork(): typeof fetch {
  return (async (input: string) => {
    if (input === "/api/health") return Response.json({ status: "ok" });
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;
}

const implementations: Array<[string, () => Api]> = [
  ["client.ts", () => createClient(fakeNetwork())],
  ["demoApi.ts", () => createDemoApi()],
];

const METHODS = ["health"] as const satisfies ReadonlyArray<keyof Api>;

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
