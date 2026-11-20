import { createMaintenanceService } from "./services/maintenanceService.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
// The owner's time zone, sent by the browser in a header, decides the calendar day of a new reading, weight or workout.
// The whole API runs here with in-memory repositories and a fixed clock.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE, TIME_ZONE_HEADER } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createGiftService } from "./services/giftService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakePeople } from "./testing/fakePeople.js";

// 03:30 UTC on Nov 14: still the evening of Nov 13 in Los Angeles and Chicago, already Nov 14 in Tokyo and UTC.
const NOW = () => new Date("2026-11-14T03:30:00Z");

let post: (path: string, body: unknown, zone?: string) => Promise<{ status: number; json: Record<string, unknown> }>;

beforeAll(async () => {
  const issuer = await createTestIssuer();
  const token = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
  const app = createApp({
    logger: createLogger(() => {}),
    checkDatabase: async () => true,
    odometer: createOdometerService(fakeRepo(), { now: NOW }),
    gifts: createGiftService(fakeGiftRepo()),
    workouts: createWorkoutService(fakeWorkoutRepo(), { now: NOW }),
    weight: createWeightService(fakeWeightRepo(), { now: NOW }), maintenance: createMaintenanceService(fakeMaintenanceRepo()),
    people: fakePeople(), keys: issuer.keys,
  });
  post = async (path, body, zone) => {
    const headers: Record<string, string> = { "content-type": "application/json", "cf-access-jwt-assertion": token, [REQUEST_GUARD_HEADER]: REQUEST_GUARD_VALUE };
    if (zone !== undefined) headers[TIME_ZONE_HEADER] = zone;
    const res = await app.request(path, { method: "POST", headers, body: JSON.stringify(body) }, TEST_SETTINGS);
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
});

const dateOf = (r: { json: Record<string, unknown> }) => (r.json.reading ?? r.json.entry ?? r.json) as { date: string };

describe("time zone header", () => {
  it("[AC-SET-01.5] a reading, a weight and a workout are dated in the zone the browser sends", async () => {
    expect(dateOf(await post("/api/odometer", { miles: 50_000 }, "Asia/Tokyo")).date).toBe("2026-11-14");
    expect(dateOf(await post("/api/weight", { pounds: 180 }, "Asia/Tokyo")).date).toBe("2026-11-14");
    expect(dateOf(await post("/api/workouts", { type: "Run", minutes: 30 }, "Asia/Tokyo")).date).toBe("2026-11-14");
    expect(dateOf(await post("/api/odometer", { miles: 50_100, confirmed: true }, "America/Chicago")).date).toBe("2026-11-13");
    expect(dateOf(await post("/api/workouts", { type: "Run", minutes: 30 }, "America/Chicago")).date).toBe("2026-11-13");
  });

  it("[AC-SET-01.5] with no header, or one that is not a real zone, the default zone is used and nothing fails", async () => {
    for (const zone of [undefined, "", "Not/AZone", "America/Chicago; DROP TABLE x", "a".repeat(200)]) {
      const res = await post("/api/workouts", { type: "Walk", minutes: 10 }, zone);
      expect(res.status, String(zone)).toBe(201);
      expect(dateOf(res).date, String(zone)).toBe("2026-11-13"); // default zone: Los Angeles
    }
  });
});
