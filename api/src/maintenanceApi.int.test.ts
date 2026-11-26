// The maintenance endpoints end to end: owner check, handler, service, SQL repository, and a real Postgres built from the real migrations.
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { maintenanceRepository } from "./repositories/maintenanceRepository.js";
import { asPerson, testOwnerId } from "./repositories/personTestDatabase.js";
import { clearMaintenance } from "./repositories/maintenanceTestDatabase.js";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { createGiftService } from "./services/giftService.js";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createOdometerService } from "./services/odometerService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";
import { peopleService } from "./services/peopleService.js";

const server = inject("postgres");

describe.skipIf(!server)("/api/maintenance (real Postgres)", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null) => Promise<Response>;

  // For calls made straight to the repository (not through a request), as the owner.
  let ownerId = 0;
  const asOwner = asPerson(maintenanceRepository, () => ownerId);
  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    ownerId = await testOwnerId();
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    // Friday 2026-11-13, 04:00 in Los Angeles.
    const app = createApp({
      logger: createLogger(() => {}),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(fakeWeightRepo()),
      maintenance: createMaintenanceService(maintenanceRepository, { now: () => new Date("2026-11-13T12:00:00Z") }),
      people: peopleService, keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET") headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });
  afterAll(disconnectAppDatabase);
  beforeEach(clearMaintenance);

  const shop = { date: "2026-11-10", services: ["Oil change", "Cabin filter"], doneBy: "shop", placeName: "Joe's Garage", costCents: 8999, odometerMiles: 48_300, note: "Synthetic oil" };

  it("[AC-MIL-05.1][AC-MIL-05.2][AC-MIL-05.3][AC-MIL-05.4][AC-MIL-05.7] saves a shop service with its place, types, cost, mileage and note", async () => {
    const res = await call("POST", "/api/maintenance", shop);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: expect.any(Number), date: "2026-11-10", services: ["Oil change", "Cabin filter"], doneBy: "shop", place: { id: expect.any(Number), name: "Joe's Garage" }, costCents: 8999, odometerMiles: 48_300, note: "Synthetic oil" });
  });

  it("[AC-MIL-05.2][AC-MIL-05.4] saves a service done at home with no place and a cost of zero", async () => {
    const res = await call("POST", "/api/maintenance", { date: "2026-11-12", services: ["Air filter"], doneBy: "home", costCents: 0 });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ doneBy: "home", place: null, costCents: 0 });
  });

  it("[AC-MIL-05.3] one place per name whatever the letter case, offered again in the list, sorted by name", async () => {
    await call("POST", "/api/maintenance", shop);
    await call("POST", "/api/maintenance", { ...shop, placeName: "JOE'S GARAGE" });
    await call("POST", "/api/maintenance", { ...shop, placeName: "Acme Tire" });
    const places = (await (await call("GET", "/api/maintenance/places")).json()).places;
    expect(places.map((p: { name: string }) => p.name)).toEqual(["Acme Tire", "Joe's Garage"]);
    const list = (await (await call("GET", "/api/maintenance")).json()).records;
    expect(new Set(list.map((r: { place: { id: number } }) => r.place.id)).size).toBe(2);
  });

  it("[AC-MIL-05.5] refuses a date in the future and saves nothing", async () => {
    const res = await call("POST", "/api/maintenance", { ...shop, date: "2026-11-14" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "future_date" });
    expect(await (await call("GET", "/api/maintenance")).json()).toEqual({ records: [] });
  });

  it("[AC-MIL-05.5] the owner's time zone decides what today is", async () => {
    expect((await call("POST", "/api/maintenance", { ...shop, date: "2026-11-14" })).status).toBe(400);
  });

  it("[AC-MIL-05.8] edits every field and keeps the id, and can move a shop service to home", async () => {
    const id = (await (await call("POST", "/api/maintenance", shop)).json()).id;
    const res = await call("PUT", `/api/maintenance/${id}`, { date: "2026-11-11", services: ["Brakes"], doneBy: "home", costCents: 4000 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, date: "2026-11-11", services: ["Brakes"], doneBy: "home", place: null, costCents: 4000, odometerMiles: null, note: null });
  });

  it("[AC-MIL-05.8] deletes a service, answers 404 for one that is not there, and lists newest first", async () => {
    await call("POST", "/api/maintenance", { ...shop, date: "2026-10-01" });
    const id = (await (await call("POST", "/api/maintenance", { ...shop, date: "2026-11-01" })).json()).id;
    const dates = (await (await call("GET", "/api/maintenance")).json()).records.map((r: { date: string }) => r.date);
    expect(dates).toEqual(["2026-11-01", "2026-10-01"]);
    expect((await call("DELETE", `/api/maintenance/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/maintenance/${id}`)).status).toBe(404);
    expect((await call("PUT", `/api/maintenance/${id}`, shop)).status).toBe(404);
  });

  it("[AC-MIL-05.9] refuses bad requests: no types, an unknown field, a place on a home service, a bad cost", async () => {
    for (const bad of [{ ...shop, services: [] }, { ...shop, id: 4 }, { ...shop, doneBy: "home" }, { ...shop, costCents: -5 }, { ...shop, date: "2026-02-30" }]) {
      expect((await call("POST", "/api/maintenance", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await call("PUT", "/api/maintenance/abc", shop)).status).toBe(400);
    expect(await (await call("GET", "/api/maintenance")).json()).toEqual({ records: [] });
  });

  it("[AC-MIL-05.2] the database itself refuses a home service that has a place", async () => {
    const place = await asOwner.findOrCreatePlace("Check Garage");
    await expect(
      asOwner.insert({ date: "2026-11-01", services: ["Tires"], doneBy: "home", placeId: place.id, costCents: null, odometerMiles: null, note: null }),
    ).rejects.toThrow(/maintenance_home_has_no_place/);
  });

  it("[AC-MIL-05.1] the database refuses a service with no types", async () => {
    await expect(
      asOwner.insert({ date: "2026-11-01", services: [], doneBy: "home", placeId: null, costCents: null, odometerMiles: null, note: null }),
    ).rejects.toThrow();
  });

  it("[AC-MIL-06.5] renames a place in the database and its services keep pointing at it", async () => {
    const saved = await (await call("POST", "/api/maintenance", shop)).json();
    const placeId = saved.place.id;
    const res = await call("PUT", `/api/maintenance/places/${placeId}`, { name: "Joe's Auto" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: placeId, name: "Joe's Auto" });
    expect((await (await call("GET", "/api/maintenance")).json()).records[0].place).toEqual({ id: placeId, name: "Joe's Auto" });
  });

  it("[AC-MIL-06.5] answers 409 for a name that is taken, 404 for a place that is not there, and 400 for a bad request", async () => {
    await call("POST", "/api/maintenance", shop);
    const other = await (await call("POST", "/api/maintenance", { ...shop, placeName: "Acme Tire" })).json();
    expect((await call("PUT", `/api/maintenance/places/${other.place.id}`, { name: "JOE'S garage" })).status).toBe(409);
    expect((await call("PUT", `/api/maintenance/places/${other.place.id}`, { name: "ACME TIRE" })).status).toBe(200);
    expect((await call("PUT", "/api/maintenance/places/999999", { name: "Nowhere" })).status).toBe(404);
    expect((await call("PUT", `/api/maintenance/places/${other.place.id}`, { name: "  " })).status).toBe(400);
    expect((await call("PUT", "/api/maintenance/places/abc", { name: "X" })).status).toBe(400);
  });

  it("[AC-MIL-06.5] deletes a place only when no service uses it", async () => {
    const saved = await (await call("POST", "/api/maintenance", shop)).json();
    const url = `/api/maintenance/places/${saved.place.id}`;
    expect((await call("DELETE", url)).status).toBe(409);
    expect((await (await call("GET", "/api/maintenance/places")).json()).places).toHaveLength(1);
    expect((await call("DELETE", `/api/maintenance/${saved.id}`)).status).toBe(204);
    expect((await call("DELETE", url)).status).toBe(204);
    expect((await call("DELETE", url)).status).toBe(404);
    expect((await call("DELETE", "/api/maintenance/places/abc")).status).toBe(400);
  });

  it("[AC-MIL-09.7] saves a service interval, replaces the one a type had (ignoring letter case), lists them and removes one", async () => {
    expect(await (await call("GET", "/api/maintenance/intervals")).json()).toEqual({ intervals: [] });
    const first = await call("PUT", "/api/maintenance/intervals", { service: "Oil change", miles: 5000, months: 6 });
    expect(first.status).toBe(200);
    const saved = await first.json();
    expect(saved).toEqual({ id: expect.any(Number), service: "Oil change", miles: 5000, months: 6 });

    const again = await (await call("PUT", "/api/maintenance/intervals", { service: "oil CHANGE", months: 3 })).json();
    expect(again).toEqual({ id: saved.id, service: "oil CHANGE", miles: null, months: 3 });
    await call("PUT", "/api/maintenance/intervals", { service: "Tires", miles: 40_000 });
    expect((await (await call("GET", "/api/maintenance/intervals")).json()).intervals.map((i: { service: string }) => i.service)).toEqual(["oil CHANGE", "Tires"]);

    expect((await call("DELETE", `/api/maintenance/intervals/${saved.id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/maintenance/intervals/${saved.id}`)).status).toBe(404);
    expect((await (await call("GET", "/api/maintenance/intervals")).json()).intervals).toHaveLength(1);
  });

  it("[AC-MIL-09.7] refuses an interval with no miles or months, a zero, a decimal, an unknown field and a bad id", async () => {
    for (const body of [{ service: "Oil change" }, { service: "Oil change", miles: 0 }, { service: "Oil change", months: 1.5 }, { service: "Oil change", miles: 5, extra: 1 }, { service: "", miles: 5 }]) {
      expect((await call("PUT", "/api/maintenance/intervals", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call("DELETE", "/api/maintenance/intervals/abc")).status).toBe(400);
  });

  it("[AC-MIL-09.7] the database itself refuses a row with neither miles nor months", async () => {
    await expect(asOwner.saveInterval("Oil change", null, null)).rejects.toThrow();
  });

  it("[AC-MIL-05.9] answers 401 without the owner's token", async () => {
    expect((await call("GET", "/api/maintenance", undefined, null)).status).toBe(401);
    expect((await call("GET", "/api/maintenance/places", undefined, null)).status).toBe(401);
    expect((await call("PUT", "/api/maintenance/places/1", { name: "X" }, null)).status).toBe(401);
    expect((await call("DELETE", "/api/maintenance/places/1", undefined, null)).status).toBe(401);
    expect((await call("GET", "/api/maintenance/intervals", undefined, null)).status).toBe(401);
    expect((await call("PUT", "/api/maintenance/intervals", { service: "X", miles: 1 }, null)).status).toBe(401);
  });
});
