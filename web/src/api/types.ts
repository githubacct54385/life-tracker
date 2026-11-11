import type { HealthResponse } from "@life-tracker/shared";

/**
 * The one interface the UI uses to reach data (ADR-0014). `client.ts` implements it over HTTP and
 * `demo/demoApi.ts` implements it with fake data in the browser. Every feature story adds its methods
 * here, to both implementations, and to the shared contract test (`contract.test.ts`).
 */
export interface Api {
  health(): Promise<HealthResponse>;
}
