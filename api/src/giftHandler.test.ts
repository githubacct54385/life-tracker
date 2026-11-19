import { createMaintenanceService } from "./services/maintenanceService.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
// The gift endpoints with an in-memory repository, so they run without Docker (the same cases run against Postgres in giftsApi.int.test.ts).
import { createWeightService } from "./services/weightService";
import { fakeWeightRepo } from "./testing/fakeWeightRepository";
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createGiftService } from "./services/giftService";
import { createOdometerService } from "./services/odometerService";
import { createWorkoutService } from "./services/workoutService";
import { createLogger } from "./telemetry/logger";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens";
import { fakeGiftRepo } from "./testing/fakeGiftRepository";
import { fakeRepo } from "./testing/fakeOdometerRepository";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository";

const gift = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" as const, description: null };

describe("/api/gifts", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null, guard?: boolean) => Promise<Response>;

  beforeAll(async () => {
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    const app = createApp({
      logger: createLogger(() => {}),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(fakeWeightRepo()), maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken, guard = true) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET" && guard) headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });

  it("[AC-GIV-01.1][AC-GIV-01.2][AC-GIV-01.3][AC-GIV-01.4] saves, lists, edits and deletes gifts, several per month", async () => {
    const first = await call("POST", "/api/gifts", gift);
    expect(first.status).toBe(201);
    const { id } = await first.json();
    await call("POST", "/api/gifts", { ...gift, dateGiven: "2026-01-20", cents: 5_000, method: "card" });
    const { gifts } = await (await call("GET", "/api/gifts")).json();
    expect(gifts).toHaveLength(2);

    const changed = { dateGiven: "2026-03-02", forMonth: "2026-02", cents: 12_500, method: "card", description: null };
    expect(await (await call("PUT", `/api/gifts/${id}`, changed)).json()).toEqual({ id, ...changed });
    expect((await call("DELETE", `/api/gifts/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/gifts/${id}`)).status).toBe(404);
  });

  it("[AC-GIV-02.3] saves and returns a description, and treats a blank one as none", async () => {
    const saved = await (await call("POST", "/api/gifts", { ...gift, description: "January tithe" })).json();
    expect(saved.description).toBe("January tithe");
    const blank = await (await call("POST", "/api/gifts", { ...gift, description: "  " })).json();
    expect(blank.description).toBeNull();
    expect((await call("POST", "/api/gifts", { ...gift, description: "x".repeat(81) })).status).toBe(400);
  });

  it("[AC-GIV-01.1] refuses a time, an unknown method, a zero amount and a bad id", async () => {
    for (const bad of [{ ...gift, dateGiven: "2026-02-03T10:00" }, { ...gift, method: "cash" }, { ...gift, cents: 0 }]) {
      expect((await call("POST", "/api/gifts", bad)).status).toBe(400);
    }
    expect((await call("PUT", "/api/gifts/abc", gift)).status).toBe(400);
  });

  it("[AC-GIV-01.1] fails closed without a sign-in or the custom header", async () => {
    expect((await call("GET", "/api/gifts", undefined, null)).status).toBe(401);
    expect((await call("POST", "/api/gifts", gift, undefined, false)).status).toBe(403);
  });
});

describe("/api/gifts/special", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null, guard?: boolean) => Promise<Response>;
  let logged: string[];
  const special = { dateGiven: "2026-03-29", occasion: "Spring offering", cents: 10_000, method: "card" };

  beforeAll(async () => {
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    logged = [];
    const app = createApp({
      logger: createLogger((_level, line) => logged.push(line)),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo([gift])),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(fakeWeightRepo()), maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken, guard = true) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET" && guard) headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });

  it("[AC-GIV-02.1][AC-GIV-02.2] saves, lists, edits and deletes special contributions, apart from regular gifts", async () => {
    const created = await call("POST", "/api/gifts/special", special);
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect(await (await call("GET", "/api/gifts/special")).json()).toEqual({ contributions: [{ id, ...special }] });
    expect((await (await call("GET", "/api/gifts")).json()).gifts).toHaveLength(1);

    const changed = { dateGiven: "2026-04-05", occasion: "Easter offering", cents: 7_500, method: "check" };
    expect(await (await call("PUT", `/api/gifts/special/${id}`, changed)).json()).toEqual({ id, ...changed });
    expect((await call("DELETE", `/api/gifts/special/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/gifts/special/${id}`)).status).toBe(404);
    expect((await call("PUT", `/api/gifts/special/${id}`, changed)).status).toBe(404);
  });

  it("[AC-GIV-02.1] refuses a missing or blank occasion, a month it is for, a time, and a bad id", async () => {
    const bad = [{ ...special, occasion: "" }, { ...special, occasion: "   " }, { ...special, forMonth: "2026-03" }, { ...special, dateGiven: "2026-03-29T10:00" }, { dateGiven: special.dateGiven, cents: 1, method: "card" }];
    for (const body of bad) expect((await call("POST", "/api/gifts/special", body)).status).toBe(400);
    expect((await call("PUT", "/api/gifts/special/abc", special)).status).toBe(400);
    expect((await call("DELETE", "/api/gifts/special/abc")).status).toBe(400);
  });

  it("[AC-GIV-02.1] fails closed without a sign-in or the custom header", async () => {
    expect((await call("GET", "/api/gifts/special", undefined, null)).status).toBe(401);
    expect((await call("POST", "/api/gifts/special", special, null)).status).toBe(401);
    expect((await call("POST", "/api/gifts/special", special, undefined, false)).status).toBe(403);
  });

  it("[AC-GIV-02.1] logs only a row count, never an occasion or an amount", async () => {
    await call("POST", "/api/gifts/special", { ...special, occasion: "Invented Occasion Name", cents: 123_457 });
    await call("GET", "/api/gifts/special");
    expect(logged.join("\n")).not.toContain("Invented Occasion Name");
    expect(logged.join("\n")).not.toContain("123457");
  });
});

