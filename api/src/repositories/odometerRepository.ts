import { getPool } from "../db/connection.js";

export interface StoredReading {
  id: number;
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  miles: number;
}

interface Row {
  id: string;
  date: string;
  miles: number;
}

const toReading = (row: Row): StoredReading => ({ id: Number(row.id), date: row.date, miles: row.miles });

// reading_date is formatted in SQL so the driver never turns a calendar date into a time-zone-shifted Date.
const COLUMNS = "id, to_char(reading_date, 'YYYY-MM-DD') AS date, miles";

/** SQL for odometer readings. No business rules: those live in services/odometerService.ts. */
export interface OdometerRepository {
  /** Every reading, newest first. One reading a week keeps this small for years. */
  listAll(): Promise<StoredReading[]>;
  insert(reading: { date: string; miles: number }): Promise<StoredReading>;
  /** Changes the value only; the date is never touched. Undefined when there is no such reading. */
  updateMiles(id: number, miles: number): Promise<StoredReading | undefined>;
  /** True when a reading was removed. */
  remove(id: number): Promise<boolean>;
}

export const odometerRepository: OdometerRepository = {
  async listAll() {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM odometer_readings ORDER BY reading_date DESC, id DESC`);
    return result.rows.map(toReading);
  },

  async insert({ date, miles }) {
    const result = await getPool().query<Row>(
      `INSERT INTO odometer_readings (reading_date, miles) VALUES ($1::date, $2) RETURNING ${COLUMNS}`,
      [date, miles],
    );
    return toReading(result.rows[0]!);
  },

  async updateMiles(id, miles) {
    const result = await getPool().query<Row>(
      `UPDATE odometer_readings SET miles = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, miles],
    );
    return result.rows[0] ? toReading(result.rows[0]) : undefined;
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM odometer_readings WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
