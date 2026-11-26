import type { AddGroceryRequest, DocumentListResponse, EditGroceryRequest, GroceryItem, GroceryListResponse, MaintenanceDocument, MaintenanceListResponse, MaintenanceRecord, PlaceListResponse, SaveMaintenanceRequest, ServicePlace, GiftListResponse, GiftRecord, HealthResponse, ImportMileageResult, ImportRow, ReadingListResponse, SaveGiftRequest, SaveReadingResult, SaveSpecialContributionRequest, SaveWorkoutRequest, SpecialContributionListResponse, SpecialContributionRecord, SaveWeightResult, WeightEntryRecord, WeightListResponse, WorkoutGoal, WorkoutListResponse, WorkoutRecord } from "@life-tracker/shared";

/** What happens to an uploaded document (MIL-07). The server decides; nothing is stored unless the status is "saved". */
export type UploadDocumentResult = { status: "saved"; document: MaintenanceDocument } | { status: "too_large" | "unsupported_type" | "limit_reached" | "too_much" | "not_found" };

/** What happens to an added grocery item. "list_full" means the list holds its limit of items and nothing was added (GRO-01). */
export type AddGroceryResult = { status: "added" | "already_added"; item: GroceryItem } | { status: "list_full" };

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
  /** Special contributions, newest first. Separate from regular gifts (GIV-02). */
  listSpecialContributions(): Promise<SpecialContributionListResponse>;
  /** Saves a special contribution: it has an occasion instead of a "for" month. */
  logSpecialContribution(contribution: SaveSpecialContributionRequest): Promise<SpecialContributionRecord>;
  /** Replaces every field of a special contribution. */
  editSpecialContribution(id: number, contribution: SaveSpecialContributionRequest): Promise<SpecialContributionRecord>;
  /** Removes a special contribution for good. */
  deleteSpecialContribution(id: number): Promise<void>;
  /** Adds readings parsed from the owner's spreadsheet (MIL-04). Rows already stored are skipped, so importing twice adds nothing. */
  importReadings(rows: ImportRow[]): Promise<ImportMileageResult>;
  /** Weight entries, newest first (HLT-01). Stored in pounds. */
  listWeights(): Promise<WeightListResponse>;
  /** Saves today's weight in pounds. When today already has one, it is not saved unless `replace` is true (AC-HLT-01.3). */
  logWeight(pounds: number, replace?: boolean): Promise<SaveWeightResult>;
  /** Changes an entry's value and keeps its date. */
  editWeight(id: number, pounds: number): Promise<WeightEntryRecord>;
  /** Removes an entry for good. */
  deleteWeight(id: number): Promise<void>;
  /** Recent workouts, newest first (HLT-02). */
  listWorkouts(): Promise<WorkoutListResponse>;
  /** Saves a manual workout, dated when it is saved. There is no date to send. */
  logWorkout(workout: SaveWorkoutRequest): Promise<WorkoutRecord>;
  /** Changes a workout's type, duration and note. Its date and source stay. */
  editWorkout(id: number, workout: SaveWorkoutRequest): Promise<WorkoutRecord>;
  /** Removes a workout for good. */
  deleteWorkout(id: number): Promise<void>;
  /** The weekly workout goal, or `perWeek: null` before one is set (HLT-05). */
  getWorkoutGoal(): Promise<WorkoutGoal>;
  /** Sets the weekly workout goal, a whole number from 1 to 14. */
  saveWorkoutGoal(perWeek: number): Promise<WorkoutGoal>;
  /** The person's grocery list, in the order it was written (GRO-01). */
  listGroceries(): Promise<GroceryListResponse>;
  /** Adds an item. The caller chooses its id (a UUID), so sending the same request twice makes one item. Without a section the server guesses one from the name. */
  addGrocery(item: AddGroceryRequest): Promise<AddGroceryResult>;
  /** Replaces every field of an item except its id: this is how an item is marked found, renamed or moved to another section. */
  editGrocery(id: string, item: EditGroceryRequest): Promise<GroceryItem>;
  /** Removes one item. */
  deleteGrocery(id: string): Promise<void>;
  /** Finish trip and clear list: deletes every item for good. Nothing is kept (AC-GRO-01.5). */
  clearGroceries(): Promise<void>;
  /** Car services, newest first (MIL-05). */
  listMaintenance(): Promise<MaintenanceListResponse>;
  /** The shops used before, for the drop-down. */
  listServicePlaces(): Promise<PlaceListResponse>;
  /** Saves a service. The place is sent by name: an existing one (ignoring letter case) is reused, a new one is added. */
  logMaintenance(service: SaveMaintenanceRequest): Promise<MaintenanceRecord>;
  /** Replaces every field of a service. */
  editMaintenance(id: number, service: SaveMaintenanceRequest): Promise<MaintenanceRecord>;
  /** Removes a service for good. */
  deleteMaintenance(id: number): Promise<void>;
  /** Renames a place; its services keep pointing at it. A name another place has (ignoring letter case) is refused (MIL-06). */
  renameServicePlace(id: number, name: string): Promise<{ status: "saved"; place: ServicePlace } | { status: "name_taken" }>;
  /** Deletes a place only when no service uses it (MIL-06). */
  deleteServicePlace(id: number): Promise<"deleted" | "in_use">;
  /** Every document attached to a service, oldest first (MIL-07). There are no file names: they are never kept. */
  listDocuments(): Promise<DocumentListResponse>;
  /** Attaches a photo or PDF to a service. The server checks the type from the file's own bytes, the 100 MB limit, the 10 per service and the 250 MB total per service. */
  uploadDocument(recordId: number, file: Blob): Promise<UploadDocumentResult>;
  /** Removes a document and its stored file for good. */
  deleteDocument(id: number): Promise<void>;
  /** Where to show or open a document. Undefined when the browser cannot open it (a PDF in the demo). */
  documentUrl(document: MaintenanceDocument): string | undefined;
  /** Where to save a copy of a document to the phone, under a made-up name (MIL-07). Undefined when the browser cannot (a PDF in the demo). */
  documentDownloadUrl(document: MaintenanceDocument): string | undefined;
}
