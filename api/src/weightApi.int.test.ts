import { createMaintenanceService } from "./services/maintenanceService.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
// The weight endpoints end to end: owner check, handler, service, repository, and a real Postgres created from the real migrations.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { weightRepository } from "./repositories/weightRepository.js";
import { clearWeight } from "./repositories/weightTestDatabase.js";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { createGiftService } from "./services/giftService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";

const server = inject("postgres");

describe.skipIf(!server)("/api/weight (real Postgres)", () => {
  let call: (method: string, url: string, body?: unknown) => Promise<Response>;

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    const app = createApp({
      logger: createLogger(() => {}),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(weightRepository, { now: () => new Date("2026-11-18T20:00:00Z") }),
      maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      keys: issuer.keys,
    });
    call = (method, url, body) =>
      Promise.resolve(
        app.request(
          url,
          { method, headers: { "content-type": "application/json", "cf-access-jwt-assertion": ownerToken, [REQUEST_GUARD_HEADER]: REQUEST_GUARD_VALUE }, body: body === undefined ? undefined : JSON.stringify(body) },
          TEST_SETTINGS,
        ),
      );
  });
  afterAll(disconnectAppDatabase);
  beforeEach(clearWeight);

  it("[AC-HLT-01.1] saves a weight dated today, lists it, edits it and deletes it", async () => {
    const saved = (await (await call("POST", "/api/weight", { pounds: 172.4 })).json()).entry;
    expect(saved).toEqual({ id: expect.any(Number), date: "2026-11-18", pounds: 172.4 });
    expect((await (await call("GET", "/api/weight")).json()).entries).toEqual([saved]);
    expect(await (await call("PUT", `/api/weight/${saved.id}`, { pounds: 171.9 })).json()).toEqual({ ...saved, pounds: 171.9 });
    expect((await call("DELETE", `/api/weight/${saved.id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/weight/${saved.id}`)).status).toBe(404);
  });

  it("[AC-HLT-01.3] keeps one entry per day: the second asks to replace, and confirming replaces it", async () => {
    await call("POST", "/api/weight", { pounds: 172.4 });
    expect((await call("POST", "/api/weight", { pounds: 171 })).status).toBe(409);
    expect((await call("POST", "/api/weight", { pounds: 171, replace: true })).status).toBe(201);
    const { entries } = await (await call("GET", "/api/weight")).json();
    expect(entries).toHaveLength(1);
    expect(entries[0].pounds).toBe(171);
  });

  it("[AC-HLT-01.3] the database itself refuses two entries for one date", async () => {
    await weightRepository.insert({ date: "2026-11-01", pounds: 170 });
    await expect(weightRepository.insert({ date: "2026-11-01", pounds: 171 })).rejects.toThrow();
  });

  it("[AC-HLT-01.4] stores pounds to one decimal and refuses out-of-range values at the database", async () => {
    expect((await weightRepository.insert({ date: "2026-11-02", pounds: 172.4 })).pounds).toBe(172.4);
    await expect(weightRepository.insert({ date: "2026-11-03", pounds: 5 })).rejects.toThrow();
    await expect(weightRepository.insert({ date: "2026-11-04", pounds: 2000 })).rejects.toThrow();
  });
});
