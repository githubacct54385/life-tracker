// The grocery endpoints with an in-memory repository, so they run without Docker (the same cases run against Postgres in groceryApi.int.test.ts).
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createGiftService } from "./services/giftService";
import { createGroceryService } from "./services/groceryService";
import { createMaintenanceService } from "./services/maintenanceService";
import { createOdometerService } from "./services/odometerService";
import { createWeightService } from "./services/weightService";
import { createWorkoutService } from "./services/workoutService";
import { createLogger } from "./telemetry/logger";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens";
import { fakeGiftRepo } from "./testing/fakeGiftRepository";
import { fakeGroceryRepo } from "./testing/fakeGroceryRepository";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository";
import { fakePeople } from "./testing/fakePeople.js";
import { fakeRepo } from "./testing/fakeOdometerRepository";
import { fakeWeightRepo } from "./testing/fakeWeightRepository";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("/api/groceries", () => {
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
      groceries: createGroceryService(fakeGroceryRepo()),
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

  it("[AC-GRO-01.1][AC-GRO-01.3] adds an item by name, guesses its section, and lists it", async () => {
    expect((await (await call("GET", "/api/groceries")).json()).items).toEqual([]);
    const added = await call("POST", "/api/groceries", { id: A, name: "  Milk ", quantity: "2" });
    expect(added.status).toBe(201);
    expect(await added.json()).toEqual({ id: A, name: "Milk", quantity: "2", note: "", section: "Dairy and eggs", found: false });
    expect((await (await call("GET", "/api/groceries")).json()).items).toHaveLength(1);
  });

  it("[AC-GRO-01.1] sending the same add twice makes one item (safe to repeat)", async () => {
    const again = await call("POST", "/api/groceries", { id: A, name: "Milk" });
    expect(again.status).toBe(200);
    expect((await (await call("GET", "/api/groceries")).json()).items).toHaveLength(1);
  });

  it("[AC-GRO-01.2][AC-GRO-01.3][AC-GRO-01.4] edits every field, so an item can be marked found and moved to another section", async () => {
    const edit = { name: "Oat milk", quantity: "1", note: "the blue carton", section: "Drinks", found: true };
    const response = await call("PUT", `/api/groceries/${A}`, edit);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: A, ...edit });
    expect((await (await call("GET", "/api/groceries")).json()).items[0]).toMatchObject({ section: "Drinks", found: true });
    expect((await call("PUT", `/api/groceries/${B}`, edit)).status).toBe(404);
    expect((await call("PUT", `/api/groceries/${A}`, { ...edit, section: "Aisle 9" })).status).toBe(400);
  });

  it("[AC-GRO-01.4] removes one item, and answers 404 for one that is gone", async () => {
    await call("POST", "/api/groceries", { id: B, name: "bread" });
    expect((await call("DELETE", `/api/groceries/${B}`)).status).toBe(204);
    expect((await call("DELETE", `/api/groceries/${B}`)).status).toBe(404);
    expect((await call("DELETE", "/api/groceries/not-an-id")).status).toBe(400);
  });

  it("[AC-GRO-01.5] finish trip deletes the whole list in one call and keeps nothing", async () => {
    await call("POST", "/api/groceries", { id: B, name: "bread" });
    expect((await call("DELETE", "/api/groceries")).status).toBe(204);
    expect((await (await call("GET", "/api/groceries")).json()).items).toEqual([]);
  });

  it("[AC-GRO-01.1] refuses a bad request with 400", async () => {
    expect((await call("POST", "/api/groceries", { id: A, name: "" })).status).toBe(400);
    expect((await call("POST", "/api/groceries", { name: "milk" })).status).toBe(400);
  });

  it("[AC-GRO-01.6] refuses anyone who is not signed in, and every write without the request header", async () => {
    expect((await call("GET", "/api/groceries", undefined, null)).status).toBe(401);
    expect((await call("DELETE", "/api/groceries", undefined, null)).status).toBe(401);
    expect((await call("POST", "/api/groceries", { id: A, name: "milk" }, undefined, false)).status).toBe(403);
  });

  it("[AC-GRO-01.6] never writes an item's name into the logs", async () => {
    expect(logged.join("\n")).not.toMatch(/milk|bread/i);
  });
});
