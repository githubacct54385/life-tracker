import { createMaintenanceService } from "./services/maintenanceService.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
// The workout endpoints end to end: owner check, handler, service, repository, and a real Postgres created from the real migrations.
import { createWeightService } from "./services/weightService.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { workoutRepository } from "./repositories/workoutRepository.js";
import { clearWorkouts, seedWorkout } from "./repositories/workoutTestDatabase.js";
import { createGiftService } from "./services/giftService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";

const server = inject("postgres");

describe.skipIf(!server)("/api/workouts (real Postgres)", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null) => Promise<Response>;

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    const logger = createLogger(() => {});
    // Friday 2026-11-13, 04:00 in Los Angeles.
    const workouts = createWorkoutService(workoutRepository, { now: () => new Date("2026-11-13T12:00:00Z") });
    const app = createApp({ logger, checkDatabase: async () => true, odometer: createOdometerService(fakeRepo()), gifts: createGiftService(fakeGiftRepo()), workouts, weight: createWeightService(fakeWeightRepo()), maintenance: createMaintenanceService(fakeMaintenanceRepo()), keys: issuer.keys });
    call = async (method, url, body, token = ownerToken) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET") headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });
  afterAll(disconnectAppDatabase);
  beforeEach(clearWorkouts);

  it("[AC-HLT-02.1][AC-HLT-02.3] saves a manual workout dated today when only type, minutes and note are sent", async () => {
    const res = await call("POST", "/api/workouts", { type: "Run", minutes: 30, note: "easy" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: expect.any(Number), date: "2026-11-13", type: "Run", minutes: 30, reps: null, note: "easy", source: "manual" });
  });

  it("[AC-HLT-02.1] refuses a request that tries to choose a date or a source, and saves nothing", async () => {
    expect((await call("POST", "/api/workouts", { type: "Run", minutes: 30, date: "2026-01-01" })).status).toBe(400);
    expect((await call("POST", "/api/workouts", { type: "Run", minutes: 30, source: "apple_watch" })).status).toBe(400);
    expect(await (await call("GET", "/api/workouts")).json()).toEqual({ workouts: [] });
  });

  it("[AC-HLT-02.2] edits type, minutes and note and keeps the date and source", async () => {
    await seedWorkout("2026-11-06", "Run", 30, "apple_watch");
    const id = (await (await call("GET", "/api/workouts")).json()).workouts[0].id;
    const res = await call("PUT", `/api/workouts/${id}`, { type: "Hike", minutes: 90, note: "long one" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, date: "2026-11-06", type: "Hike", minutes: 90, reps: null, note: "long one", source: "apple_watch" });
  });

  it("[AC-HLT-02.2] deletes a workout, and answers 404 for one that is not there", async () => {
    const id = (await (await call("POST", "/api/workouts", { type: "Yoga", minutes: 20 })).json()).id;
    expect((await call("DELETE", `/api/workouts/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/workouts/${id}`)).status).toBe(404);
    expect((await call("PUT", `/api/workouts/${id}`, { type: "Yoga", minutes: 20 })).status).toBe(404);
    expect(await (await call("GET", "/api/workouts")).json()).toEqual({ workouts: [] });
  });

  it("[AC-HLT-02.3] lists newest first and shows each workout's source", async () => {
    await seedWorkout("2026-11-05", "Run", 30, "apple_watch");
    await seedWorkout("2026-11-06", "Yoga", 40, "manual");
    const list = (await (await call("GET", "/api/workouts")).json()).workouts;
    expect(list.map((w: { date: string; source: string }) => [w.date, w.source])).toEqual([["2026-11-06", "manual"], ["2026-11-05", "apple_watch"]]);
  });

  it("[AC-HLT-02.4] saves pushups with a count and no minutes, lists them, and edits the count", async () => {
    const saved = await call("POST", "/api/workouts", { type: "Pushups", reps: 40 });
    expect(saved.status).toBe(201);
    const record = await saved.json();
    expect(record).toEqual({ id: expect.any(Number), date: "2026-11-13", type: "Pushups", minutes: null, reps: 40, note: null, source: "manual" });
    expect((await (await call("GET", "/api/workouts")).json()).workouts[0]).toEqual(record);
    const edited = await call("PUT", `/api/workouts/${record.id}`, { type: "Pushups", reps: 55 });
    expect((await edited.json()).reps).toBe(55);
  });

  it("[AC-HLT-02.4] refuses pushups without a count, a run without minutes, and a count on a timed workout", async () => {
    for (const bad of [{ type: "Pushups" }, { type: "Pushups", reps: 20, minutes: 5 }, { type: "Run" }, { type: "Run", minutes: 30, reps: 20 }, { type: "Pushups", reps: 10_001 }]) {
      expect((await call("POST", "/api/workouts", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(await (await call("GET", "/api/workouts")).json()).toEqual({ workouts: [] });
  });

  it("[AC-HLT-02.4] the database itself refuses a workout with neither minutes nor a count", async () => {
    await expect(seedWorkout("2026-11-06", "Other", null, "manual", null)).rejects.toThrow(/workouts_minutes_or_reps/);
  });

  it("[AC-HLT-02.1] answers 401 without the owner's token", async () => {
    expect((await call("GET", "/api/workouts", undefined, null)).status).toBe(401);
  });
});
