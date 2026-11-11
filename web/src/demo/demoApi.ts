import { healthResponseSchema } from "@life-tracker/shared";
import type { Api } from "../api/types";

/**
 * Stand-in for `api/client.ts`: the same interface, answered from fake data held in the browser.
 * It must never call `fetch` or any other network function (hard rule 7, AC-DEM-01.2).
 * All data here is synthetic (AC-DEM-01.3).
 */
export function createDemoApi(): Api {
  return {
    async health() {
      return healthResponseSchema.parse({ status: "ok" });
    },
  };
}
