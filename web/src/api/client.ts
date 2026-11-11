import { healthResponseSchema, REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE } from "@life-tracker/shared";
import type { Api } from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
  }
}

/** The only place the UI talks to the real API. The fetch function is a parameter so tests can mock the network edge. */
export function createClient(fetchImpl: FetchLike = (input, init) => fetch(input, init)): Api {
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    if (method !== "GET") headers.set(REQUEST_GUARD_HEADER, REQUEST_GUARD_VALUE);
    const response = await fetchImpl(path, { ...init, method, headers });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }

  return {
    async health() {
      return healthResponseSchema.parse(await request("/api/health"));
    },
  };
}
