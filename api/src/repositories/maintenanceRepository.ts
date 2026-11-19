import type { DoneBy, ServicePlace } from "@life-tracker/shared";
import { getPool } from "../db/connection.js";

export interface StoredMaintenance {
  id: number;
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  services: string[];
  doneBy: DoneBy;
  place: ServicePlace | null;
  costCents: number | null;
  odometerMiles: number | null;
  note: string | null;
}

/** What is written for a service. The place is already an id (the service finds or adds it first). */
export interface MaintenanceFields {
  date: string;
  services: string[];
  doneBy: DoneBy;
  placeId: number | null;
  costCents: number | null;
  odometerMiles: number | null;
  note: string | null;
}

interface Row {
  id: string;
  date: string;
  services: string[];
  done_by: DoneBy;
  place_id: string | null;
  place_name: string | null;
  cost_cents: number | null;
  odometer_miles: number | null;
  note: string | null;
}

const toRecord = (row: Row): StoredMaintenance => ({
  id: Number(row.id),
  date: row.date,
  services: row.services,
  doneBy: row.done_by,
  place: row.place_id === null ? null : { id: Number(row.place_id), name: row.place_name! },
  costCents: row.cost_cents,
  odometerMiles: row.odometer_miles,
  note: row.note,
});

// service_date is formatted in SQL so the driver never turns a calendar date into a time-zone-shifted Date.
const SELECT = `SELECT r.id, to_char(r.service_date, 'YYYY-MM-DD') AS date, r.services, r.done_by, r.place_id, p.name AS place_name,
  r.cost_cents, r.odometer_miles, r.note FROM maintenance_records r LEFT JOIN service_places p ON p.id = r.place_id`;

/** SQL for the maintenance log. No business rules: those live in services/maintenanceService.ts. */
export interface MaintenanceRepository {
  /** Newest first. */
  list(): Promise<StoredMaintenance[]>;
  listPlaces(): Promise<ServicePlace[]>;
  /** The place with this name (ignoring letter case), added when there is none. */
  findOrCreatePlace(name: string): Promise<ServicePlace>;
  insert(fields: MaintenanceFields): Promise<StoredMaintenance>;
  /** Replaces every field. Undefined when there is no such service. */
  update(id: number, fields: MaintenanceFields): Promise<StoredMaintenance | undefined>;
  /** True when a service was removed. */
  remove(id: number): Promise<boolean>;
}

async function findById(id: number): Promise<StoredMaintenance | undefined> {
  const result = await getPool().query<Row>(`${SELECT} WHERE r.id = $1`, [id]);
  return result.rows[0] ? toRecord(result.rows[0]) : undefined;
}

export const maintenanceRepository: MaintenanceRepository = {
  async list() {
    const result = await getPool().query<Row>(`${SELECT} ORDER BY r.service_date DESC, r.id DESC`);
    return result.rows.map(toRecord);
  },

  async listPlaces() {
    const result = await getPool().query<{ id: string; name: string }>("SELECT id, name FROM service_places ORDER BY lower(name)");
    return result.rows.map((row) => ({ id: Number(row.id), name: row.name }));
  },

  async findOrCreatePlace(name) {
    // The no-op update makes RETURNING answer for an existing row too, in one round trip.
    const result = await getPool().query<{ id: string; name: string }>(
      "INSERT INTO service_places (name) VALUES ($1) ON CONFLICT ((lower(name))) DO UPDATE SET name = service_places.name RETURNING id, name",
      [name],
    );
    const row = result.rows[0]!;
    return { id: Number(row.id), name: row.name };
  },

  async insert({ date, services, doneBy, placeId, costCents, odometerMiles, note }) {
    const result = await getPool().query<{ id: string }>(
      `INSERT INTO maintenance_records (service_date, services, done_by, place_id, cost_cents, odometer_miles, note)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [date, services, doneBy, placeId, costCents, odometerMiles, note],
    );
    return (await findById(Number(result.rows[0]!.id)))!;
  },

  async update(id, { date, services, doneBy, placeId, costCents, odometerMiles, note }) {
    const result = await getPool().query(
      `UPDATE maintenance_records SET service_date = $2::date, services = $3, done_by = $4, place_id = $5, cost_cents = $6,
       odometer_miles = $7, note = $8, updated_at = now() WHERE id = $1`,
      [id, date, services, doneBy, placeId, costCents, odometerMiles, note],
    );
    return (result.rowCount ?? 0) > 0 ? findById(id) : undefined;
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM maintenance_records WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },

};
