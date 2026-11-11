import type { GiftRecord, PaymentMethod } from "@life-tracker/shared";
import { getPool } from "../db/connection.js";

export type StoredGift = GiftRecord;
export interface GiftInput {
  dateGiven: string;
  forMonth: string;
  cents: number;
  method: PaymentMethod;
}

interface Row {
  id: string;
  date_given: string;
  for_month: string;
  cents: string;
  method: PaymentMethod;
}

const toGift = (row: Row): StoredGift => ({
  id: Number(row.id),
  dateGiven: row.date_given,
  forMonth: row.for_month,
  cents: Number(row.cents),
  method: row.method,
});

// Dates are formatted in SQL so the driver never turns a calendar date into a time-zone-shifted Date.
// Money is decimal(12,2) in the database and integer cents in code (ADR-0007); it is converted only here.
const COLUMNS = `id, to_char(given_on, 'YYYY-MM-DD') AS date_given, to_char(for_month, 'YYYY-MM') AS for_month,
  round(amount * 100)::bigint AS cents, method`;
const VALUES = "$1::date, ($2 || '-01')::date, $3::numeric / 100, $4";

/** SQL for regular gifts. No business rules: those live in services/giftService.ts. */
export interface GiftRepository {
  /** Every gift, newest month first, then newest date given. */
  listAll(): Promise<StoredGift[]>;
  insert(gift: GiftInput): Promise<StoredGift>;
  /** Undefined when there is no such gift. */
  update(id: number, gift: GiftInput): Promise<StoredGift | undefined>;
  /** True when a gift was removed. */
  remove(id: number): Promise<boolean>;
}

export const giftRepository: GiftRepository = {
  async listAll() {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM regular_gifts ORDER BY for_month DESC, given_on DESC, id DESC`);
    return result.rows.map(toGift);
  },

  async insert({ dateGiven, forMonth, cents, method }) {
    const result = await getPool().query<Row>(
      `INSERT INTO regular_gifts (given_on, for_month, amount, method) VALUES (${VALUES}) RETURNING ${COLUMNS}`,
      [dateGiven, forMonth, cents, method],
    );
    return toGift(result.rows[0]!);
  },

  async update(id, { dateGiven, forMonth, cents, method }) {
    const result = await getPool().query<Row>(
      `UPDATE regular_gifts SET given_on = $2::date, for_month = ($3 || '-01')::date, amount = $4::numeric / 100, method = $5, updated_at = now()
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, dateGiven, forMonth, cents, method],
    );
    return result.rows[0] ? toGift(result.rows[0]) : undefined;
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM regular_gifts WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
