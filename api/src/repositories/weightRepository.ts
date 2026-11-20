import { getPool } from "../db/connection.js";
import { currentUserId } from "../db/requestUser.js";

export interface StoredWeight {
  id: number;
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  pounds: number;
}

interface Row {
  id: string;
  date: string;
  pounds: string;
}

const toWeight = (row: Row): StoredWeight => ({ id: Number(row.id), date: row.date, pounds: Number(row.pounds) });

// entry_date is formatted in SQL so the driver never turns a calendar date into a time-zone-shifted Date.
const COLUMNS = "id, to_char(entry_date, 'YYYY-MM-DD') AS date, pounds";

/** SQL for weight entries. No business rules: those live in services/weightService.ts. */
export interface WeightRepository {
  /** Newest first. */
  list(limit: number): Promise<StoredWeight[]>;
  findByDate(date: string): Promise<StoredWeight | undefined>;
  /** Adds an entry. The unique date means a second entry for one day is refused with an error. */
  insert(entry: { date: string; pounds: number }): Promise<StoredWeight>;
  /** Changes the value only; the date is never touched. Undefined when there is no such entry. */
  update(id: number, pounds: number): Promise<StoredWeight | undefined>;
  /** True when an entry was removed. */
  remove(id: number): Promise<boolean>;
}

export const weightRepository: WeightRepository = {
  async list(limit) {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM weight_entries WHERE user_id = $2 ORDER BY entry_date DESC LIMIT $1`, [limit, currentUserId()]);
    return result.rows.map(toWeight);
  },

  async findByDate(date) {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM weight_entries WHERE entry_date = $1::date AND user_id = $2`, [date, currentUserId()]);
    return result.rows[0] ? toWeight(result.rows[0]) : undefined;
  },

  async insert({ date, pounds }) {
    const result = await getPool().query<Row>(`INSERT INTO weight_entries (entry_date, pounds, user_id) VALUES ($1::date, $2, $3) RETURNING ${COLUMNS}`, [date, pounds, currentUserId()]);
    return toWeight(result.rows[0]!);
  },

  async update(id, pounds) {
    const result = await getPool().query<Row>(`UPDATE weight_entries SET pounds = $2, updated_at = now() WHERE id = $1 AND user_id = $3 RETURNING ${COLUMNS}`, [id, pounds, currentUserId()]);
    return result.rows[0] ? toWeight(result.rows[0]) : undefined;
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM weight_entries WHERE id = $1 AND user_id = $2", [id, currentUserId()]);
    return (result.rowCount ?? 0) > 0;
  },
};
