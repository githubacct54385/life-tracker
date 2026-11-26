// OPS-14 against the real database driver: a database that cannot be reached fails the way the driver really fails (a connection
// error, not one we made up), and the API answers 503 naming the database. Also the health check for each part, on a real Postgres.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { databaseReachable } from "./services/healthService.js";
import { odometerService } from "./services/odometerService.js";
import { peopleService } from "./services/peopleService.js";
import { createGiftService } from "./services/giftService.js";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { createWorker, type Env } from "./worker.js";
import { maintenanceRepository } from "./repositories/maintenanceRepository.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";

const server = inject("postgres");

describe.skipIf(!server)("a part is down (real Postgres driver)", () => {
  let ownerToken = "";
  let keys: Awaited<ReturnType<typeof createTestIssuer>>["keys"];
  const lines: string[] = [];

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    const issuer = await createTestIssuer();
    keys = issuer.keys;
    ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
  });
  afterAll(async () => {
    await disconnectAppDatabase().catch(() => undefined);
  });

  const deps = () => ({
    logger: createLogger((_level, line) => lines.push(line)),
    checkDatabase: databaseReachable,
    odometer: odometerService,
    gifts: createGiftService(fakeGiftRepo()),
    workouts: createWorkoutService(fakeWorkoutRepo()),
    weight: createWeightService(fakeWeightRepo()),
    maintenance: createMaintenanceService(maintenanceRepository),
    people: peopleService,
    keys,
  });
  const headers = () => ({ "cf-access-jwt-assertion": ownerToken, [REQUEST_GUARD_HEADER]: REQUEST_GUARD_VALUE });

  it("[AC-OPS-14.3] the health check says every part is ok when the database answers", async () => {
    const app = createApp(deps());
    const response = await app.request("/api/health/parts", { headers: headers() }, TEST_SETTINGS);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ database: "ok", documents: "ok", signIn: "ok" });
  });

  it("[AC-OPS-14.1] a database that refuses the connection answers 503 naming the database, and the log has no address", async () => {
    // Port 1 has nothing listening, so the driver fails with its own connection error. The test pool is closed so the request builds its own from DATABASE_URL.
    await disconnectAppDatabase();
    const worker = createWorker(deps());
    const env: Env = { ...TEST_SETTINGS, DATABASE_URL: "postgres://app:secret-password@127.0.0.1:1/nowhere", ASSETS: { fetch: async () => new Response("") } };
    const request = (path: string) => worker.fetch(new Request(`https://app.example.test${path}`, { headers: headers() }), env);

    const response = await request("/api/odometer");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable", part: "database" });

    const parts = await request("/api/health/parts");
    expect(await parts.json()).toEqual({ database: "unavailable", documents: "ok", signIn: "ok" });

    const logged = lines.join("\n");
    expect(logged).toContain('"part":"database"');
    expect(logged).not.toMatch(/127\.0\.0\.1|secret-password|nowhere/);
  });
});
