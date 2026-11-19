// In-memory stand-in for the maintenance repository, for service and handler unit tests. Synthetic data only.
import type { ServicePlace } from "@life-tracker/shared";
import type { MaintenanceFields, MaintenanceRepository, StoredMaintenance } from "../repositories/maintenanceRepository.js";

export function fakeMaintenanceRepo(): MaintenanceRepository & { rows: StoredMaintenance[]; places: ServicePlace[] } {
  let nextId = 1;
  let nextPlaceId = 1;
  const rows: StoredMaintenance[] = [];
  const places: ServicePlace[] = [];
  const placeById = (id: number | null) => (id === null ? null : (places.find((p) => p.id === id) ?? null));
  const make = (id: number, f: MaintenanceFields): StoredMaintenance => ({
    id,
    date: f.date,
    services: f.services,
    doneBy: f.doneBy,
    place: placeById(f.placeId),
    costCents: f.costCents,
    odometerMiles: f.odometerMiles,
    note: f.note,
  });
  return {
    rows,
    places,
    async list() {
      return [...rows].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
    },
    async listPlaces() {
      return [...places].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    },
    async renamePlace(id, name) {
      const place = places.find((p) => p.id === id);
      if (!place) return { status: "not_found" };
      if (places.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) return { status: "name_taken" };
      place.name = name;
      return { status: "renamed", place: { ...place } };
    },
    async deletePlace(id) {
      const index = places.findIndex((p) => p.id === id);
      if (index < 0) return "not_found";
      if (rows.some((r) => r.place?.id === id)) return "in_use";
      places.splice(index, 1);
      return "deleted";
    },
    async findOrCreatePlace(name) {
      const found = places.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (found) return { ...found };
      const place = { id: nextPlaceId++, name };
      places.push(place);
      return { ...place };
    },
    async insert(fields) {
      const row = make(nextId++, fields);
      rows.push(row);
      return { ...row };
    },
    async update(id, fields) {
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return undefined;
      rows[index] = make(id, fields);
      return { ...rows[index]! };
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}
