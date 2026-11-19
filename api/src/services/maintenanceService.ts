// Business rules for the car maintenance log (MIL-05). Nothing here touches SQL.
//  * A service cannot be dated in the future (the owner's time zone decides what today is, ADR-0007).
//  * A shop is found by name, ignoring letter case, or added once. A service done at home has no place.
//  * A service never touches the odometer readings: its mileage is just a number kept with it.
import { calendarDateIn, isValidTimeZone, type SaveMaintenanceRequest, type ServicePlace } from "@life-tracker/shared";
import { maintenanceRepository, type MaintenanceFields, type MaintenanceRepository, type StoredMaintenance } from "../repositories/maintenanceRepository.js";
import { DEFAULT_OWNER_TIME_ZONE } from "./odometerService.js";

export type MaintenanceOutcome = { status: "saved"; record: StoredMaintenance } | { status: "future_date" } | { status: "not_found" };

export type PlaceOutcome = { status: "saved"; place: ServicePlace } | { status: "not_found" } | { status: "name_taken" };

export interface MaintenanceService {
  list(): Promise<StoredMaintenance[]>;
  places(): Promise<ServicePlace[]>;
  /** Renames a place (MIL-06). The services keep pointing at it. */
  renamePlace(id: number, name: string): Promise<PlaceOutcome>;
  /** Deletes a place only when no service uses it (MIL-06). */
  deletePlace(id: number): Promise<"deleted" | "not_found" | "in_use">;
  log(input: SaveMaintenanceRequest, timeZone?: string): Promise<MaintenanceOutcome>;
  /** Replaces every field of a service. */
  edit(id: number, input: SaveMaintenanceRequest, timeZone?: string): Promise<MaintenanceOutcome>;
  /** Removes a service for good. False when it does not exist. */
  remove(id: number): Promise<boolean>;
}

export interface MaintenanceServiceOptions {
  now?: () => Date;
  timeZone?: string;
}

const blankToNull = (text: string | undefined) => (text === undefined || text.trim() === "" ? null : text.trim());

export function createMaintenanceService(repo: MaintenanceRepository, options: MaintenanceServiceOptions = {}): MaintenanceService {
  const now = options.now ?? (() => new Date());
  const defaultZone = options.timeZone ?? DEFAULT_OWNER_TIME_ZONE;

  async function toFields(input: SaveMaintenanceRequest): Promise<MaintenanceFields> {
    const place = input.doneBy === "shop" && input.placeName ? await repo.findOrCreatePlace(input.placeName.trim()) : undefined;
    return {
      date: input.date,
      services: input.services.map((s) => s.trim()),
      doneBy: input.doneBy,
      placeId: place?.id ?? null,
      costCents: input.costCents ?? null,
      odometerMiles: input.odometerMiles ?? null,
      note: blankToNull(input.note),
    };
  }

  const isFuture = (date: string, requestZone: string | undefined) => date > calendarDateIn(isValidTimeZone(requestZone) ? requestZone : defaultZone, now());

  return {
    list: () => repo.list(),
    places: () => repo.listPlaces(),

    async renamePlace(id, name) {
      const result = await repo.renamePlace(id, name.trim());
      return result.status === "renamed" ? { status: "saved", place: result.place } : result;
    },

    deletePlace: (id) => repo.deletePlace(id),

    async log(input, requestZone) {
      if (isFuture(input.date, requestZone)) return { status: "future_date" };
      return { status: "saved", record: await repo.insert(await toFields(input)) };
    },

    async edit(id, input, requestZone) {
      if (isFuture(input.date, requestZone)) return { status: "future_date" };
      const record = await repo.update(id, await toFields(input));
      return record ? { status: "saved", record } : { status: "not_found" };
    },

    remove: (id) => repo.remove(id),
  };
}

export const maintenanceService = createMaintenanceService(maintenanceRepository);
