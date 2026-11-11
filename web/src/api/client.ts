import {
  giftListResponseSchema,
  giftSchema,
  healthResponseSchema,
  importMileageResultSchema,
  readingListResponseSchema,
  REQUEST_GUARD_HEADER,
  REQUEST_GUARD_VALUE,
  saveReadingResultSchema,
  workoutListResponseSchema,
  workoutRecordSchema,
} from "@life-tracker/shared";
import type { Api } from "./types";
import { setWaking } from "./wakeStatus";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
  }
}

/** Neon Free suspends an idle database; the first request after that can fail with 503 while it wakes (ADR-0021). */
const JSON_HEADERS = { "content-type": "application/json" };
const WAKE_STATUS = 503;
const DEFAULT_RETRY_DELAY_MS = 3000;

export interface ClientOptions {
  /** Wait before the single retry. Tests pass 0. */
  retryDelayMs?: number;
  onWaking?: (waking: boolean) => void;
}

const jsonBody = (method: "POST" | "PUT", body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

/** The only place the UI talks to the real API. The fetch function is a parameter so tests can mock the network edge. */
export function createClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  { retryDelayMs = DEFAULT_RETRY_DELAY_MS, onWaking = setWaking }: ClientOptions = {},
): Api {
  async function send(path: string, init: RequestInit = {}, accepted: number[] = []): Promise<Response> {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    if (method !== "GET") headers.set(REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE);
    let response = await fetchImpl(path, { ...init, method, headers });
    // AC-FND-05.4: retry once (reads only, so a write is never sent twice) while the UI shows a loading state.
    if (response.status === WAKE_STATUS && method === "GET") {
      onWaking(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        response = await fetchImpl(path, { ...init, method, headers });
      } finally {
        onWaking(false);
      }
    }
    if (!response.ok && !accepted.includes(response.status)) throw new ApiError(response.status);
    return response;
  }

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    return (await send(path, init)).json();
  }

  // 409 is an answer, not a failure: the reading needs the owner's confirmation first.
  async function save(path: string, method: "POST" | "PUT", miles: number, confirmed?: boolean) {
    const body = JSON.stringify(confirmed ? { miles, confirmed: true } : { miles });
    const response = await send(path, { method, body, headers: { "content-type": "application/json" } }, [409]);
    return saveReadingResultSchema.parse(await response.json());
  }

  return {
    async health() {
      return healthResponseSchema.parse(await request("/api/health"));
    },
    async listReadings() {
      return readingListResponseSchema.parse(await request("/api/odometer"));
    },
    async listAllReadings() {
      return readingListResponseSchema.parse(await request("/api/odometer?all=1"));
    },
    logReading: (miles, confirmed) => save("/api/odometer", "POST", miles, confirmed),
    editReading: (id, miles, confirmed) => save(`/api/odometer/${id}`, "PUT", miles, confirmed),
    async deleteReading(id) {
      await send(`/api/odometer/${id}`, { method: "DELETE" });
    },
    async listGifts() {
      return giftListResponseSchema.parse(await request("/api/gifts"));
    },
    async logGift(gift) {
      return giftSchema.parse(await (await send("/api/gifts", { method: "POST", body: JSON.stringify(gift), headers: JSON_HEADERS })).json());
    },
    async editGift(id, gift) {
      return giftSchema.parse(await (await send(`/api/gifts/${id}`, { method: "PUT", body: JSON.stringify(gift), headers: JSON_HEADERS })).json());
    },
    async deleteGift(id) {
      await send(`/api/gifts/${id}`, { method: "DELETE" });
    },

    async importReadings(rows) {
      const init = { method: "POST", body: JSON.stringify({ rows }), headers: { "content-type": "application/json" } };
      return importMileageResultSchema.parse(await (await send("/api/odometer/import", init)).json());
    },

    async listWorkouts() {
      return workoutListResponseSchema.parse(await request("/api/workouts"));
    },
    async logWorkout(workout) {
      return workoutRecordSchema.parse(await request("/api/workouts", jsonBody("POST", workout)));
    },
    async editWorkout(id, workout) {
      return workoutRecordSchema.parse(await request(`/api/workouts/${id}`, jsonBody("PUT", workout)));
    },
    async deleteWorkout(id) {
      await send(`/api/workouts/${id}`, { method: "DELETE" });
    },
  };
}
