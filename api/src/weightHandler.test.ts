import { createMaintenanceService } from "./services/maintenanceService.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
// The weight endpoints with an in-memory repository, so they run without Docker (the same cases run against Postgres in weightApi.int.test.ts).
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createGiftService } from "./services/giftService";
import { createOdometerService } from "./services/odometerService";
import { createWeightService } from "./services/weightService";
import { createWorkoutService } from "./services/workoutService";
import { createLogger } from "./telemetry/logger";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens";
import { fakeGiftRepo } from "./testing/fakeGiftRepository";
import { fakeRepo } from "./testing/fakeOdometerRepository";
import { fakeWeightRepo } from "./testing/fakeWeightRepository";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository";

describe("/api/weight", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null, guard?: boolean) => Promise<Response>;
  let logged: string[];

  beforeAll(async () => {
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    logged = [];
    const app = createApp({
      logger: createLogger((_level, line) => logged.push(line)),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(fakeWeightRepo(), { now: () => new Date("2026-11-18T20:00:00Z") }), maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken, guard = true) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET" && guard) headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });

  it("[AC-HLT-01.1][AC-HLT-01.3] logs a weight dated by the server, asks before replacing, then edits and deletes", async () => {
    const first = await call("POST", "/api/weight", { pounds: 172.4 });
    expect(first.status).toBe(201);
    const saved = await first.json();
    expect(saved).toEqual({ status: "saved", entry: { id: expect.any(Number), date: "2026-11-18", pounds: 172.4 } });
    const id = saved.entry.id;

    const second = await call("POST", "/api/weight", { pounds: 171 });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ status: "needs_replace", existing: { id, date: "2026-11-18", pounds: 172.4 } });
    expect((await (await call("GET", "/api/weight")).json()).entries).toHaveLength(1);

    const replaced = await call("POST", "/api/weight", { pounds: 171, replace: true });
    expect(replaced.status).toBe(201);
    expect((await replaced.json()).entry).toEqual({ id, date: "2026-11-18", pounds: 171 });

    expect(await (await call("PUT", `/api/weight/${id}`, { pounds: 170.5 })).json()).toEqual({ id, date: "2026-11-18", pounds: 170.5 });
    expect((await call("DELETE", `/api/weight/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/weight/${id}`)).status).toBe(404);
    expect((await call("PUT", `/api/weight/${id}`, { pounds: 170 })).status).toBe(404);
  });

  it("[AC-HLT-01.1] refuses a date or time, a bad weight, an extra decimal, and a bad id", async () => {
    const bad = [{ pounds: 172, date: "2026-11-01" }, { pounds: 0 }, { pounds: -5 }, { pounds: 5000 }, { pounds: 172.44 }, { pounds: "172" }, {}];
    for (const body of bad) expect((await call("POST", "/api/weight", body)).status).toBe(400);
    expect((await call("PUT", "/api/weight/abc", { pounds: 170 })).status).toBe(400);
    expect((await call("DELETE", "/api/weight/abc")).status).toBe(400);
  });

  it("[AC-HLT-01.1] fails closed without a sign-in or the custom header", async () => {
    expect((await call("GET", "/api/weight", undefined, null)).status).toBe(401);
    expect((await call("POST", "/api/weight", { pounds: 150 }, null)).status).toBe(401);
    expect((await call("POST", "/api/weight", { pounds: 150 }, undefined, false)).status).toBe(403);
  });

  it("[AC-HLT-01.1] logs only a row count, never a weight", async () => {
    await call("GET", "/api/weight");
    await call("POST", "/api/weight", { pounds: 187.3, replace: true });
    expect(logged.join("\n")).not.toContain("187.3");
  });
});
