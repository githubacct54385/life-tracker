import { MAX_MAINTENANCE_COST_CENTS, MAX_MAINTENANCE_NOTE_LENGTH, MAX_MAINTENANCE_ODOMETER, MAX_PLACE_NAME_LENGTH, MAX_SERVICE_NAME_LENGTH, MAX_SERVICES_PER_RECORD, type MaintenanceRecord, type SaveMaintenanceRequest } from "@life-tracker/shared";

/** What the owner typed for a cost -> whole cents. Blank means no cost. Zero is allowed (for example work under warranty). */
export function parseCost(text: string): { valid: boolean; cents?: number } {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (cleaned === "") return { valid: true };
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return { valid: false };
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= MAX_MAINTENANCE_COST_CENTS ? { valid: true, cents } : { valid: false };
}

/** What the owner typed for the odometer -> whole miles. Blank means none. */
export function parseOdometer(text: string): { valid: boolean; miles?: number } {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "") return { valid: true };
  if (!/^\d{1,7}$/.test(cleaned)) return { valid: false };
  const miles = Number(cleaned);
  return miles <= MAX_MAINTENANCE_ODOMETER ? { valid: true, miles } : { valid: false };
}

export interface ServiceForm {
  /** The fixed types that are ticked. */
  ticked: string[];
  /** Types the owner typed. */
  custom: string[];
  doneBy: "shop" | "home";
  /** "" = no place named, NEW_PLACE = the owner is typing one, otherwise the name of a place used before. */
  placeChoice: string;
  newPlace: string;
  cost: string;
  date: string;
  odometer: string;
  note: string;
}

export const NEW_PLACE = "__new__";

/** Every type of the service, ticked ones first in the order of the fixed list, then the owner's own. */
export const allServices = (form: ServiceForm, fixed: readonly string[]): string[] => [...fixed.filter((t) => form.ticked.includes(t)), ...form.custom];

/** Turns the form into a request, or says what is wrong. `today` is the owner's current date. */
export function toRequest(form: ServiceForm, fixed: readonly string[], today: string): { request?: SaveMaintenanceRequest; problem?: string } {
  const services = allServices(form, fixed);
  if (services.length === 0) return { problem: "Choose at least one service." };
  if (services.length > MAX_SERVICES_PER_RECORD) return { problem: `Choose at most ${MAX_SERVICES_PER_RECORD} services.` };
  const cost = parseCost(form.cost);
  if (!cost.valid) return { problem: "Enter the cost in dollars, like 89.99." };
  const odometer = parseOdometer(form.odometer);
  if (!odometer.valid) return { problem: "Enter whole miles for the odometer." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return { problem: "Choose the date of the service." };
  if (form.date > today) return { problem: "A service cannot be dated in the future." };
  if (form.note.length > MAX_MAINTENANCE_NOTE_LENGTH) return { problem: `The note can be up to ${MAX_MAINTENANCE_NOTE_LENGTH} characters.` };
  const placeName = form.doneBy === "shop" ? (form.placeChoice === NEW_PLACE ? form.newPlace.trim() : form.placeChoice) : "";
  if (form.doneBy === "shop" && form.placeChoice === NEW_PLACE && placeName === "") return { problem: "Type the name of the place." };
  if (placeName.length > MAX_PLACE_NAME_LENGTH) return { problem: `The place name can be up to ${MAX_PLACE_NAME_LENGTH} characters.` };
  return {
    request: {
      date: form.date,
      services,
      doneBy: form.doneBy,
      ...(placeName ? { placeName } : {}),
      ...(cost.cents !== undefined ? { costCents: cost.cents } : {}),
      ...(odometer.miles !== undefined ? { odometerMiles: odometer.miles } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    },
  };
}

/** A custom type as the owner typed it: trimmed, 1 to 40 characters, not already in the list (ignoring letter case). */
export function addableService(text: string, existing: readonly string[]): string | undefined {
  const name = text.trim();
  if (name === "" || name.length > MAX_SERVICE_NAME_LENGTH) return undefined;
  return existing.some((e) => e.toLowerCase() === name.toLowerCase()) ? undefined : name;
}

/** A saved service as form values, for editing. */
export function formFromRecord(record: MaintenanceRecord, fixed: readonly string[]): ServiceForm {
  return {
    ticked: record.services.filter((s) => fixed.includes(s)),
    custom: record.services.filter((s) => !fixed.includes(s)),
    doneBy: record.doneBy,
    placeChoice: record.place?.name ?? "",
    newPlace: "",
    cost: record.costCents === null ? "" : (record.costCents / 100).toFixed(2),
    date: record.date,
    odometer: record.odometerMiles === null ? "" : String(record.odometerMiles),
    note: record.note ?? "",
  };
}
