// The grocery endpoints end to end against a real Postgres built from the real migrations (GRO-01).
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.js";
import { connectFreshAppDatabase, disconnectAppDatabase } from "./repositories/odometerTestDatabase.js";
import { groceryRepository } from "./repositories/groceryRepository.js";
import { addTestPerson, asPerson, testQuery } from "./repositories/personTestDatabase.js";
import { createGiftService } from "./services/giftService.js";
import { createGroceryService } from "./services/groceryService.js";
import { createMaintenanceService } from "./services/maintenanceService.js";
import { createOdometerService } from "./services/odometerService.js";
import { peopleService } from "./services/peopleService.js";
import { createWeightService } from "./services/weightService.js";
import { createWorkoutService } from "./services/workoutService.js";
import { createLogger } from "./telemetry/logger.js";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens.js";
import { fakeGiftRepo } from "./testing/fakeGiftRepository.js";
import { fakeMaintenanceRepo } from "./testing/fakeMaintenanceRepository.js";
import { fakeRepo } from "./testing/fakeOdometerRepository.js";
import { fakeWeightRepo } from "./testing/fakeWeightRepository.js";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository.js";

const server = inject("postgres");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe.skipIf(!server)("/api/groceries (real Postgres)", () => {
  let call: (method: string, url: string, body?: unknown) => Promise<Response>;
  let otherId = 0;

  beforeAll(async () => {
    await connectFreshAppDatabase(server!);
    otherId = await addTestPerson("someone-else@example.test");
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    const app = createApp({
      logger: createLogger(() => {}),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      weight: createWeightService(fakeWeightRepo()),
      maintenance: createMaintenanceService(fakeMaintenanceRepo()),
      groceries: createGroceryService(groceryRepository),
      people: peopleService,
      keys: issuer.keys,
    });
    call = (method, url, body) => {
      const headers: Record<string, string> = { "content-type": "application/json", "cf-access-jwt-assertion": ownerToken };
      if (method !== "GET") headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return Promise.resolve(app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS));
    };
  });
  afterAll(disconnectAppDatabase);

  it("[AC-GRO-01.1][AC-GRO-01.2][AC-GRO-01.4][AC-GRO-01.5] add, repeat, found, move, remove and finish trip, stored in Postgres", async () => {
    const first = await call("POST", "/api/groceries", { id: A, name: "Spinach", quantity: "1 bag" });
    expect(first.status).toBe(201);
    expect((await first.json()).section).toBe("Produce");
    expect((await call("POST", "/api/groceries", { id: A, name: "Spinach" })).status).toBe(200);
    expect((await (await call("GET", "/api/groceries")).json()).items).toHaveLength(1);

    const found = await call("PUT", `/api/groceries/${A}`, { name: "Spinach", quantity: "1 bag", note: "", section: "Frozen", found: true });
    expect(await found.json()).toMatchObject({ id: A, section: "Frozen", found: true });

    await call("POST", "/api/groceries", { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "soap" });
    expect((await call("DELETE", `/api/groceries/${A}`)).status).toBe(204);
    expect((await call("DELETE", `/api/groceries/${A}`)).status).toBe(404);

    expect((await call("DELETE", "/api/groceries")).status).toBe(204);
    expect((await testQuery("SELECT count(*)::int AS n FROM grocery_items")).rows[0].n).toBe(0);
  });

  it("[AC-GRO-01.6] another person's item with the same id is never reached: add makes a separate item, edit and delete treat it as missing, and the clear leaves it", async () => {
    const mine = asPerson(groceryRepository, () => otherId);
    await mine.add({ id: A, name: "someone else's", quantity: "", note: "", section: "Other" });

    expect((await call("POST", "/api/groceries", { id: A, name: "mine" })).status).toBe(201); // the same id is a different item for me
    await call("DELETE", `/api/groceries/${A}`);
    expect((await call("PUT", `/api/groceries/${A}`, { name: "x", quantity: "", note: "", section: "Other", found: false })).status).toBe(404);
    expect((await call("DELETE", `/api/groceries/${A}`)).status).toBe(404);
    expect((await (await call("GET", "/api/groceries")).json()).items).toEqual([]);
    await call("DELETE", "/api/groceries");
    expect(await mine.list(10)).toHaveLength(1);
  });

  it("[AC-GRO-01.1] the list holds at most 300 items; the 301st is refused and a repeat of an existing add still answers", async () => {
    await testQuery("DELETE FROM grocery_items WHERE user_id <> $1", [otherId]);
    await testQuery(
      "INSERT INTO grocery_items (id, user_id, name, section) SELECT gen_random_uuid(), u.id, 'item ' || g, 'Other' FROM generate_series(1, 300) g, users u WHERE u.email = $1",
      [TEST_SETTINGS.OWNER_EMAIL],
    );
    expect((await call("POST", "/api/groceries", { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "one too many" })).status).toBe(409);
    expect((await (await call("GET", "/api/groceries")).json()).items).toHaveLength(300);
  });
});
