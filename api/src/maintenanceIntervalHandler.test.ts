// The service-interval endpoints with an in-memory repository, so they run without Docker (the same cases run against Postgres in maintenanceApi.int.test.ts).
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createGiftService } from "./services/giftService";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createOdometerService } from "./services/odometerService";
import { createWeightService } from "./services/weightService";
import { createWorkoutService } from "./services/workoutService";
import { createLogger } from "./telemetry/logger";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens";
import { fakeGiftRepo } from "./testing/fakeGiftRepository";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
import { fakePeople } from "./testing/fakePeople.js";
import { fakeRepo } from "./testing/fakeOdometerRepository";
import { fakeWeightRepo } from "./testing/fakeWeightRepository";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository";

describe("/api/maintenance/intervals", () => {
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
      weight: createWeightService(fakeWeightRepo()),
      maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      people: fakePeople(),
      keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken, guard = true) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET" && guard) headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });

  it("[AC-MIL-09.7] sets, replaces, lists and removes an interval", async () => {
    const created = await (await call("PUT", "/api/maintenance/intervals", { service: " Oil change ", miles: 5000, months: 6 })).json();
    expect(created).toEqual({ id: expect.any(Number), service: "Oil change", miles: 5000, months: 6 });
    const replaced = await (await call("PUT", "/api/maintenance/intervals", { service: "OIL change", months: 3 })).json();
    expect(replaced).toEqual({ id: created.id, service: "OIL change", miles: null, months: 3 });
    expect(await (await call("GET", "/api/maintenance/intervals")).json()).toEqual({ intervals: [replaced] });
    expect((await call("DELETE", `/api/maintenance/intervals/${created.id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/maintenance/intervals/${created.id}`)).status).toBe(404);
    expect((await (await call("GET", "/api/maintenance/intervals")).json()).intervals).toEqual([]);
  });

  it("[AC-MIL-09.7] refuses bad input and a bad id", async () => {
    for (const body of [{ service: "Oil change" }, { service: "Oil change", miles: 0 }, { service: "Oil change", months: 200 }, { service: "x", miles: 5, extra: true }, {}]) {
      expect((await call("PUT", "/api/maintenance/intervals", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call("DELETE", "/api/maintenance/intervals/abc")).status).toBe(400);
  });

  it("[AC-MIL-09.7] fails closed without a sign-in or the custom header", async () => {
    expect((await call("GET", "/api/maintenance/intervals", undefined, null)).status).toBe(401);
    expect((await call("PUT", "/api/maintenance/intervals", { service: "X", miles: 5 }, null)).status).toBe(401);
    expect((await call("PUT", "/api/maintenance/intervals", { service: "X", miles: 5 }, undefined, false)).status).toBe(403);
  });

  it("[AC-MIL-09.7] logs only a row count, never a service name", async () => {
    await call("PUT", "/api/maintenance/intervals", { service: "Secretname", miles: 123 });
    await call("GET", "/api/maintenance/intervals");
    expect(logged.join("\n")).not.toContain("Secretname");
  });
});
