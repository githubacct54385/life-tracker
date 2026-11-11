// The odometer endpoints end to end: owner check, handler, service, repository, and a real Postgres created from the real migration.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { odometerRepository } from "./repositories/odometerRepository.js";
import { clearOdometerReadings, connectFreshAppDatabase, disconnectAppDatabase, seedOdometerReading } from "./repositories/odometerTestDatabase.js";
import { createGiftService } from "./services/giftService.js";
import { createOdometerService } from "./services/odometerService.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { createWorkoutService } from "./services/workoutService.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";

const server = inject("postgres");

describe.skipIf(!server)("/api/odometer (real Postgres)", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null, guard?: boolean) => Promise<Response>;
  let logged: string[];

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    logged = [];
    const logger = createLogger((_level, line) => logged.push(line));
    // Friday 2026-11-13, 04:00 in Los Angeles.
    const odometer = createOdometerService(odometerRepository, { now: () => new Date("2026-11-13T12:00:00Z") });
    const app = createApp({ logger, checkDatabase: async () => true, odometer, gifts: createGiftService(fakeGiftRepo()), workouts: createWorkoutService(fakeWorkoutRepo()), keys: issuer.keys });
    call = async (method, url, body, token = ownerToken, guard = true) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET" && guard) headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });
  afterAll(disconnectAppDatabase);
  beforeEach(clearOdometerReadings);

  it("[AC-MIL-01.1] saves a reading dated today (owner's day) when only the miles are sent", async () => {
    const res = await call("POST", "/api/odometer", { miles: 48_402 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "saved", reading: { id: expect.any(Number), date: "2026-11-13", miles: 48_402 } });
  });

  it("[AC-MIL-01.1][AC-MIL-01.4] refuses a request that tries to choose a date", async () => {
    const res = await call("POST", "/api/odometer", { miles: 100, date: "2026-01-01" });
    expect(res.status).toBe(400);
    expect(await (await call("GET", "/api/odometer")).json()).toEqual({ readings: [] });
  });

  it("[AC-MIL-01.2] answers 409 with a warning for a lower reading and saves nothing until confirmed", async () => {
    await seedOdometerReading("2026-11-06", 48550);
    const blocked = await call("POST", "/api/odometer", { miles: 48_402 });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ status: "needs_confirmation", warnings: [{ kind: "lower_than_previous", previous: { date: "2026-11-06", miles: 48_550 } }] });
    expect((await (await call("GET", "/api/odometer")).json()).readings).toHaveLength(1);

    const confirmed = await call("POST", "/api/odometer", { miles: 48_402, confirmed: true });
    expect(confirmed.status).toBe(201);
    expect((await (await call("GET", "/api/odometer")).json()).readings).toHaveLength(2);
  });

  it("[AC-MIL-01.3] answers 409 for an implausibly high jump", async () => {
    await seedOdometerReading("2026-11-12", 1000);
    const res = await call("POST", "/api/odometer", { miles: 1_500 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ warnings: [{ kind: "implausible_jump", miles: 500, days: 1 }] });
  });

  it("[AC-MIL-01.4] edit keeps the date, delete removes the row, missing ids give 404", async () => {
    await seedOdometerReading("2026-10-30", 48000);
    const { readings } = await (await call("GET", "/api/odometer")).json();
    const id = readings[0].id as number;

    const edited = await call("PUT", `/api/odometer/${id}`, { miles: 48_100 });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({ status: "saved", reading: { id, date: "2026-10-30", miles: 48_100 } });

    expect((await call("DELETE", `/api/odometer/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/odometer/${id}`)).status).toBe(404);
    expect((await call("PUT", `/api/odometer/${id}`, { miles: 1 })).status).toBe(404);
    expect((await call("DELETE", "/api/odometer/abc")).status).toBe(400);
  });

  it("[AC-MIL-01.4] rejects miles that are not whole numbers in range", async () => {
    for (const miles of [-1, 1.5, "100", 10_000_000, null]) {
      expect((await call("POST", "/api/odometer", { miles })).status).toBe(400);
    }
  });

  it("[AC-MIL-01.1] fails closed: no sign-in, or no custom header on a write, means no data", async () => {
    expect((await call("GET", "/api/odometer", undefined, null)).status).toBe(401);
    expect((await call("POST", "/api/odometer", { miles: 1 }, null)).status).toBe(401);
    expect((await call("POST", "/api/odometer", { miles: 1 }, undefined, false)).status).toBe(403);
    expect((await (await call("GET", "/api/odometer")).json()).readings).toEqual([]);
  });

  it("[AC-MIL-01.1] logs only a row count, never a reading", async () => {
    await call("POST", "/api/odometer", { miles: 123_456 });
    await call("GET", "/api/odometer");
    expect(logged.join("\n")).not.toContain("123456");
  });

  it("[AC-MIL-04.1][AC-MIL-04.4] imports rows with their own dates, and importing the same rows again adds nothing", async () => {
    const rows = [
      { date: "2026-01-02", miles: 1000 },
      { date: "2026-01-09", miles: 1120 },
    ];
    const first = await call("POST", "/api/odometer/import", { rows });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ imported: 2, duplicates: 0 });
    expect(await (await call("POST", "/api/odometer/import", { rows })).json()).toEqual({ imported: 0, duplicates: 2 });
    expect((await (await call("GET", "/api/odometer")).json()).readings).toHaveLength(2);
  });

  it("[AC-MIL-04.1] validates every row the browser sends and refuses the whole request if one is bad", async () => {
    for (const rows of [[{ date: "2026-02-30", miles: 1 }], [{ date: "2026-01-02", miles: -5 }], [{ date: "2026-01-02", miles: 1, milesDriven: 3 }], []]) {
      expect((await call("POST", "/api/odometer/import", { rows })).status).toBe(400);
    }
    expect((await call("POST", "/api/odometer/import", { rows: [{ date: "2026-01-02", miles: 1 }, { date: "bad", miles: 1 }] })).status).toBe(400);
    expect((await (await call("GET", "/api/odometer")).json()).readings).toEqual([]);
  });

  it("[AC-MIL-04.5] accepts only JSON rows, never a file", async () => {
    const res = await call("POST", "/api/odometer/import", "PK\u0003\u0004 pretend spreadsheet bytes");
    expect(res.status).toBe(400);
    expect((await (await call("GET", "/api/odometer")).json()).readings).toEqual([]);
  });

  it("[AC-MIL-04.1] needs the owner and the request header like every other write", async () => {
    const rows = [{ date: "2026-01-02", miles: 1000 }];
    expect((await call("POST", "/api/odometer/import", { rows }, null)).status).toBe(401);
    expect((await call("POST", "/api/odometer/import", { rows }, undefined, false)).status).toBe(403);
  });
});
