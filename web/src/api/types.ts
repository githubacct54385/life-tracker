import type { HealthResponse, ReadingListResponse, SaveReadingResult } from "@life-tracker/shared";

/**
 * The one interface the UI uses to reach data (ADR-0014). `client.ts` implements it over HTTP and
 * `demo/demoApi.ts` implements it with fake data in the browser. Every feature story adds its methods
 * here, to both implementations, and to the shared contract test (`contract.test.ts`).
 */
export interface Api {
  health(): Promise<HealthResponse>;
  /** Recent odometer readings, newest first (MIL-01). */
  listReadings(): Promise<ReadingListResponse>;
  /** Every odometer reading, newest first, for the stats screen (MIL-03). */
  listAllReadings(): Promise<ReadingListResponse>;
  /** Saves a new reading, dated when it is saved. Without `confirmed`, a reading that trips a sanity check is not saved and comes back as warnings. */
  logReading(miles: number, confirmed?: boolean): Promise<SaveReadingResult>;
  /** Changes a reading's value and keeps its date. Same confirmation rule as `logReading`. */
  editReading(id: number, miles: number, confirmed?: boolean): Promise<SaveReadingResult>;
  /** Removes a reading for good. */
  deleteReading(id: number): Promise<void>;
}
