import type { GiftListResponse, GiftRecord, HealthResponse, ImportMileageResult, ImportRow, ReadingListResponse, SaveGiftRequest, SaveReadingResult } from "@life-tracker/shared";

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
  /** Regular gifts, newest month first (GIV-01). */
  listGifts(): Promise<GiftListResponse>;
  /** Saves a gift as entered: the month it is for can differ from the date given. */
  logGift(gift: SaveGiftRequest): Promise<GiftRecord>;
  /** Replaces every field of a gift. */
  editGift(id: number, gift: SaveGiftRequest): Promise<GiftRecord>;
  /** Removes a gift for good. */
  deleteGift(id: number): Promise<void>;
  /** Adds readings parsed from the owner's spreadsheet (MIL-04). Rows already stored are skipped, so importing twice adds nothing. */
  importReadings(rows: ImportRow[]): Promise<ImportMileageResult>;
}
