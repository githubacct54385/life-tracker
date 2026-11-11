// The gift endpoints end to end: owner check, handler, service, repository, and a real Postgres created from the real migrations.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { giftRepository } from "./repositories/giftRepository.js";
import { clearGifts, connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/giftTestDatabase.js";
import { createGiftService } from "./services/giftService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";

const server = inject("postgres");
const gift = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" };

describe.skipIf(!server)("/api/gifts (real Postgres)", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null, guard?: boolean) => Promise<Response>;
  let logged: string[];

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    logged = [];
    const logger = createLogger((_level, line) => logged.push(line));
    const app = createApp({
      logger,
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(giftRepository),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken, guard = true) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET" && guard) headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });
  afterAll(disconnectAppDatabase);
  beforeEach(clearGifts);

  it("[AC-GIV-01.1][AC-GIV-01.2] saves a gift whose month differs from its date, and lists it", async () => {
    const res = await call("POST", "/api/gifts", gift);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: expect.any(Number), ...gift });
    expect(await (await call("GET", "/api/gifts")).json()).toEqual({ gifts: [{ id: expect.any(Number), ...gift }] });
  });

  it("[AC-GIV-01.1] refuses a time, a bad method, a bad amount or an unknown field", async () => {
    for (const bad of [
      { ...gift, dateGiven: "2026-02-03T10:00:00Z" },
      { ...gift, method: "cash" },
      { ...gift, cents: 0 },
      { ...gift, cents: 10.5 },
      { ...gift, forMonth: "2026-13" },
      { ...gift, note: "x" },
    ]) {
      expect((await call("POST", "/api/gifts", bad)).status).toBe(400);
    }
    expect(await (await call("GET", "/api/gifts")).json()).toEqual({ gifts: [] });
  });

  it("[AC-GIV-01.3] keeps several gifts for one month", async () => {
    await call("POST", "/api/gifts", gift);
    await call("POST", "/api/gifts", { ...gift, dateGiven: "2026-01-20", cents: 5_000, method: "card" });
    const { gifts } = await (await call("GET", "/api/gifts")).json();
    expect(gifts.filter((g: { forMonth: string }) => g.forMonth === "2026-01")).toHaveLength(2);
  });

  it("[AC-GIV-01.4] edit replaces the gift, delete removes it, missing ids give 404", async () => {
    const { id } = await (await call("POST", "/api/gifts", gift)).json();
    const changed = { dateGiven: "2026-03-02", forMonth: "2026-02", cents: 12_500, method: "card" };
    const edited = await call("PUT", `/api/gifts/${id}`, changed);
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({ id, ...changed });

    expect((await call("DELETE", `/api/gifts/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/gifts/${id}`)).status).toBe(404);
    expect((await call("PUT", `/api/gifts/${id}`, changed)).status).toBe(404);
    expect((await call("DELETE", "/api/gifts/abc")).status).toBe(400);
    expect((await call("PUT", `/api/gifts/${id}`, { cents: 1 })).status).toBe(400);
  });

  it("[AC-GIV-01.1] fails closed: no sign-in, or no custom header on a write, means no data", async () => {
    await call("POST", "/api/gifts", gift);
    expect((await call("GET", "/api/gifts", undefined, null)).status).toBe(401);
    expect((await call("POST", "/api/gifts", gift, null)).status).toBe(401);
    expect((await call("POST", "/api/gifts", gift, undefined, false)).status).toBe(403);
    expect((await (await call("GET", "/api/gifts")).json()).gifts).toHaveLength(1);
  });

  it("[AC-GIV-01.1] logs only a row count, never an amount", async () => {
    await call("POST", "/api/gifts", { ...gift, cents: 123_457 });
    await call("GET", "/api/gifts");
    expect(logged.join("\n")).not.toContain("123457");
  });
});
