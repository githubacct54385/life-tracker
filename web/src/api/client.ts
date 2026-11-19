import {
  documentListResponseSchema,
  giftListResponseSchema,
  giftSchema,
  healthResponseSchema,
  importMileageResultSchema,
  maintenanceDocumentSchema,
  maintenanceListResponseSchema,
  maintenanceRecordSchema,
  servicePlaceSchema,
  placeListResponseSchema,
  readingListResponseSchema,
  REQUEST_GUARD_HEADER,
  REQUEST_GUARD_VALUE,
  saveReadingResultSchema,
  saveWeightResultSchema,
  specialContributionListResponseSchema,
  specialContributionSchema,
  TIME_ZONE_HEADER,
  weightEntrySchema,
  weightListResponseSchema,
  workoutListResponseSchema,
  workoutRecordSchema,
} from "@life-tracker/shared";
import { loadPreferences } from "../settings/preferences";
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
  /** The owner's time zone, sent with every request so the server dates new entries in it. Defaults to the Settings value. */
  timeZone?: () => string;
}

const jsonBody = (method: "POST" | "PUT", body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

/** The only place the UI talks to the real API. The fetch function is a parameter so tests can mock the network edge. */
export function createClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  { retryDelayMs = DEFAULT_RETRY_DELAY_MS, onWaking = setWaking, timeZone = () => loadPreferences().timeZone }: ClientOptions = {},
): Api {
  async function send(path: string, init: RequestInit = {}, accepted: number[] = []): Promise<Response> {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    headers.set(TIME_ZONE_HEADER, timeZone());
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
    async listSpecialContributions() {
      return specialContributionListResponseSchema.parse(await request("/api/gifts/special"));
    },
    async logSpecialContribution(contribution) {
      return specialContributionSchema.parse(await (await send("/api/gifts/special", { method: "POST", body: JSON.stringify(contribution), headers: JSON_HEADERS })).json());
    },
    async editSpecialContribution(id, contribution) {
      return specialContributionSchema.parse(await (await send(`/api/gifts/special/${id}`, { method: "PUT", body: JSON.stringify(contribution), headers: JSON_HEADERS })).json());
    },
    async deleteSpecialContribution(id) {
      await send(`/api/gifts/special/${id}`, { method: "DELETE" });
    },

    async listWeights() {
      return weightListResponseSchema.parse(await request("/api/weight"));
    },
    // 409 is an answer, not a failure: today already has an entry and the owner must confirm the replacement.
    async logWeight(pounds, replace) {
      const body = JSON.stringify(replace ? { pounds, replace: true } : { pounds });
      const response = await send("/api/weight", { method: "POST", body, headers: JSON_HEADERS }, [409]);
      return saveWeightResultSchema.parse(await response.json());
    },
    async editWeight(id, pounds) {
      return weightEntrySchema.parse(await (await send(`/api/weight/${id}`, { method: "PUT", body: JSON.stringify({ pounds }), headers: JSON_HEADERS })).json());
    },
    async deleteWeight(id) {
      await send(`/api/weight/${id}`, { method: "DELETE" });
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
    async listMaintenance() {
      return maintenanceListResponseSchema.parse(await request("/api/maintenance"));
    },
    async listServicePlaces() {
      return placeListResponseSchema.parse(await request("/api/maintenance/places"));
    },
    async logMaintenance(service) {
      return maintenanceRecordSchema.parse(await (await send("/api/maintenance", { method: "POST", body: JSON.stringify(service), headers: JSON_HEADERS })).json());
    },
    async editMaintenance(id, service) {
      return maintenanceRecordSchema.parse(await (await send(`/api/maintenance/${id}`, { method: "PUT", body: JSON.stringify(service), headers: JSON_HEADERS })).json());
    },
    async deleteMaintenance(id) {
      await send(`/api/maintenance/${id}`, { method: "DELETE" });
    },
    async renameServicePlace(id, name) {
      const response = await send(`/api/maintenance/places/${id}`, { method: "PUT", body: JSON.stringify({ name }), headers: JSON_HEADERS }, [409]);
      return response.status === 409 ? { status: "name_taken" } : { status: "saved", place: servicePlaceSchema.parse(await response.json()) };
    },
    async deleteServicePlace(id) {
      return (await send(`/api/maintenance/places/${id}`, { method: "DELETE" }, [409])).status === 409 ? "in_use" : "deleted";
    },
    async listDocuments() {
      return documentListResponseSchema.parse(await request("/api/maintenance/documents"));
    },
    // The file is the whole body. Its type is read from its own bytes on the server, so the header is only a generic label.
    // A refusal is an answer, not a failure: the server says why and nothing was stored.
    async uploadDocument(recordId, file) {
      const init = { method: "POST", body: file, headers: { "content-type": "application/octet-stream" } };
      const response = await send(`/api/maintenance/${recordId}/documents`, init, [404, 409, 413, 415]);
      if (response.status === 201) return { status: "saved", document: maintenanceDocumentSchema.parse(await response.json()) };
      if (response.status === 409) return { status: ((await response.json().catch(() => ({}))) as { error?: string }).error === "too_much" ? "too_much" : "limit_reached" };
      const refusals = { 404: "not_found", 413: "too_large", 415: "unsupported_type" } as const;
      return { status: refusals[response.status as keyof typeof refusals] };
    },
    async deleteDocument(id) {
      await send(`/api/maintenance/documents/${id}`, { method: "DELETE" });
    },
    documentUrl: (document) => `/api/maintenance/documents/${document.id}`,
    documentDownloadUrl: (document) => `/api/maintenance/documents/${document.id}?download=1`,
  };
}
