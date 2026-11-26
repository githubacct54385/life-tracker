// The workout endpoints with an in-memory repository, so they run without Docker (the same cases run against Postgres in workoutApi.int.test.ts).
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { beforeEach, describe, expect, it } from "vitest";
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
import { fakeRepo } from "./testing/fakeOdometerRepository";
import { fakePeople } from "./testing/fakePeople.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository";

describe("/api/workouts", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null) => Promise<Response>;
  let logged: string[];

  beforeEach(async () => {
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    logged = [];
    const app = createApp({
      logger: createLogger((_level, line) => logged.push(line)),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo(), { now: () => new Date("2026-11-13T12:00:00Z") }),
      weight: createWeightService(fakeWeightRepo()),
      maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      people: fakePeople(),
      keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET") headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });

  it("[AC-HLT-02.1][AC-HLT-02.3] saves a workout dated by the server, lists it, edits it and deletes it", async () => {
    const created = await call("POST", "/api/workouts", { type: "Run", minutes: 30, note: "easy" });
    expect(created.status).toBe(201);
    const saved = await created.json();
    expect(saved).toEqual({ id: expect.any(Number), date: "2026-11-13", type: "Run", minutes: 30, reps: null, note: "easy", source: "manual" });
    expect((await (await call("GET", "/api/workouts")).json()).workouts).toHaveLength(1);
    expect(logged.join("\n")).toContain("workouts.list");

    const edited = await call("PUT", `/api/workouts/${saved.id}`, { type: "Walk", minutes: 45 });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ id: saved.id, date: "2026-11-13", type: "Walk", minutes: 45 });
    expect((await call("DELETE", `/api/workouts/${saved.id}`)).status).toBe(204);
    expect((await (await call("GET", "/api/workouts")).json()).workouts).toEqual([]);
  });

  it("[AC-HLT-02.1] refuses a workout that tries to choose a date, and a bad id, and answers not found for a workout that is not there", async () => {
    expect((await call("POST", "/api/workouts", { type: "Run", minutes: 30, date: "2020-01-01" })).status).toBe(400);
    expect((await call("PUT", "/api/workouts/abc", { type: "Run", minutes: 30 })).status).toBe(400);
    expect((await call("PUT", "/api/workouts/999", { type: "Run", minutes: 30 })).status).toBe(404);
    expect((await call("PUT", "/api/workouts/999", { type: "Run" })).status).toBe(400);
    expect((await call("DELETE", "/api/workouts/abc")).status).toBe(400);
    expect((await call("DELETE", "/api/workouts/999")).status).toBe(404);
  });

  it("[AC-HLT-05.6] has no goal until one is set, saves a whole number from 1 to 14 and keeps it, and a new goal replaces the old one", async () => {
    expect(await (await call("GET", "/api/workouts/goal")).json()).toEqual({ perWeek: null });
    const saved = await call("PUT", "/api/workouts/goal", { perWeek: 4 });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ perWeek: 4 });
    expect(await (await call("GET", "/api/workouts/goal")).json()).toEqual({ perWeek: 4 });
    expect(await (await call("PUT", "/api/workouts/goal", { perWeek: 14 })).json()).toEqual({ perWeek: 14 });
    expect(await (await call("GET", "/api/workouts/goal")).json()).toEqual({ perWeek: 14 });
  });

  it("[AC-HLT-05.6] refuses a goal that is not a whole number from 1 to 14, and keeps the old one", async () => {
    await call("PUT", "/api/workouts/goal", { perWeek: 3 });
    for (const bad of [{ perWeek: 0 }, { perWeek: 15 }, { perWeek: 2.5 }, { perWeek: "3" }, { perWeek: 3, extra: 1 }, {}, undefined]) {
      expect((await call("PUT", "/api/workouts/goal", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(await (await call("GET", "/api/workouts/goal")).json()).toEqual({ perWeek: 3 });
  });

  it("[AC-HLT-05.6] the goal route is not read as a workout id, so it never reaches a workout", async () => {
    expect((await call("PUT", "/api/workouts/goal", { type: "Run", minutes: 30 })).status).toBe(400);
    expect((await (await call("GET", "/api/workouts")).json()).workouts).toEqual([]);
  });

  it("[AC-HLT-05.6] answers 401 to every workout route without the owner's token", async () => {
    for (const [method, url] of [["GET", "/api/workouts"], ["GET", "/api/workouts/goal"], ["PUT", "/api/workouts/goal"], ["POST", "/api/workouts"]] as const) {
      expect((await call(method, url, method === "GET" ? undefined : {}, null)).status, `${method} ${url}`).toBe(401);
    }
  });
});
