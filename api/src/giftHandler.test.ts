// The gift endpoints with an in-memory repository, so they run without Docker (the same cases run against Postgres in giftsApi.int.test.ts).
import { REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createGiftService } from "./services/giftService";
import { createOdometerService } from "./services/odometerService";
import { createWorkoutService } from "./services/workoutService";
import { createLogger } from "./telemetry/logger";
import { createTestIssuer, TEST_SETTINGS } from "./testing/accessTokens";
import { fakeGiftRepo } from "./testing/fakeGiftRepository";
import { fakeRepo } from "./testing/fakeOdometerRepository";
import { fakeWorkoutRepo } from "./testing/fakeWorkoutRepository";

const gift = { dateGiven: "2026-02-03", forMonth: "2026-01", cents: 10_000, method: "check" };

describe("/api/gifts", () => {
  let call: (method: string, url: string, body?: unknown, token?: string | null, guard?: boolean) => Promise<Response>;

  beforeAll(async () => {
    const issuer = await createTestIssuer();
    const ownerToken = await issuer.sign(TEST_SETTINGS.OWNER_EMAIL);
    const app = createApp({
      logger: createLogger(() => {}),
      checkDatabase: async () => true,
      odometer: createOdometerService(fakeRepo()),
      gifts: createGiftService(fakeGiftRepo()),
      workouts: createWorkoutService(fakeWorkoutRepo()),
      keys: issuer.keys,
    });
    call = async (method, url, body, token = ownerToken, guard = true) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["cf-access-jwt-assertion"] = token;
      if (method !== "GET" && guard) headers[REQUEST_GUARD_HEADER] = REQUEST_GUARD_VALUE;
      return app.request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TEST_SETTINGS);
    };
  });

  it("[AC-GIV-01.1][AC-GIV-01.2][AC-GIV-01.3][AC-GIV-01.4] saves, lists, edits and deletes gifts, several per month", async () => {
    const first = await call("POST", "/api/gifts", gift);
    expect(first.status).toBe(201);
    const { id } = await first.json();
    await call("POST", "/api/gifts", { ...gift, dateGiven: "2026-01-20", cents: 5_000, method: "card" });
    const { gifts } = await (await call("GET", "/api/gifts")).json();
    expect(gifts).toHaveLength(2);

    const changed = { dateGiven: "2026-03-02", forMonth: "2026-02", cents: 12_500, method: "card" };
    expect(await (await call("PUT", `/api/gifts/${id}`, changed)).json()).toEqual({ id, ...changed });
    expect((await call("DELETE", `/api/gifts/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/gifts/${id}`)).status).toBe(404);
  });

  it("[AC-GIV-01.1] refuses a time, an unknown method, a zero amount and a bad id", async () => {
    for (const bad of [{ ...gift, dateGiven: "2026-02-03T10:00" }, { ...gift, method: "cash" }, { ...gift, cents: 0 }]) {
      expect((await call("POST", "/api/gifts", bad)).status).toBe(400);
    }
    expect((await call("PUT", "/api/gifts/abc", gift)).status).toBe(400);
  });

  it("[AC-GIV-01.1] fails closed without a sign-in or the custom header", async () => {
    expect((await call("GET", "/api/gifts", undefined, null)).status).toBe(401);
    expect((await call("POST", "/api/gifts", gift, undefined, false)).status).toBe(403);
  });
});
