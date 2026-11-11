// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Runs public/sw.js against a fake worker scope and cache, then fires fetch events at it.
type Handler = (event: unknown) => void;

function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const stored: string[] = [];
  const cache = { put: vi.fn(async (req: Request | string) => void stored.push(typeof req === "string" ? req : new URL(req.url).pathname)), addAll: vi.fn() };
  const caches = { open: vi.fn(async () => cache), match: vi.fn(async () => undefined), keys: vi.fn(async () => []), delete: vi.fn() };
  const self = { addEventListener: (t: string, h: Handler) => (handlers[t] = h), location: new URL("https://app.example.test/"), skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
  const network = vi.fn(async () => Object.defineProperty(new Response("ok"), "type", { value: "basic" }));
  new Function("self", "caches", "fetch", readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8"))(self, caches, network);
  async function fetchEvent(url: string, init: { method?: string; mode?: string } = {}) {
    const request = Object.defineProperty(new Request(url, { method: init.method ?? "GET" }), "mode", { value: init.mode ?? "cors" });
    let responded: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers.fetch!({ request, respondWith: (p: Promise<Response>) => (responded = p), waitUntil: (p: Promise<unknown>) => pending.push(p) });
    if (responded) await responded;
    await Promise.all(pending);
    return { handled: responded !== undefined };
  }
  return { fetchEvent, stored, network };
}

describe("service worker", () => {
  it("[AC-FND-05.2] never handles or stores API requests", async () => {
    const { fetchEvent, stored, network } = loadWorker();
    for (const path of ["/api/health", "/api/mileage/odometer", "/api"]) {
      expect((await fetchEvent(`https://app.example.test${path}`)).handled).toBe(false);
    }
    expect(stored).toEqual([]);
    expect(network).not.toHaveBeenCalled();
  });

  it("[AC-FND-05.2] ignores writes and other origins", async () => {
    const { fetchEvent, stored } = loadWorker();
    expect((await fetchEvent("https://app.example.test/assets/a.js", { method: "POST" })).handled).toBe(false);
    expect((await fetchEvent("https://other.example.test/assets/a.js")).handled).toBe(false);
    expect(stored).toEqual([]);
  });

  it("[AC-FND-05.2] stores the page and built files", async () => {
    const { fetchEvent, stored } = loadWorker();
    await fetchEvent("https://app.example.test/health", { mode: "navigate" });
    await fetchEvent("https://app.example.test/assets/index-abc.js");
    expect(stored).toEqual(["/", "/assets/index-abc.js"]);
  });
});
