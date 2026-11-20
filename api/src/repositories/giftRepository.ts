import type { GiftRecord, PaymentMethod, SpecialContributionRecord } from "@life-tracker/shared";
import { getPool } from "../db/connection.js";
import { currentUserId } from "../db/requestUser.js";

export type StoredGift = GiftRecord;
export interface GiftInput {
  dateGiven: string;
  forMonth: string;
  cents: number;
  method: PaymentMethod;
  description: string | null;
}

export type StoredSpecialContribution = SpecialContributionRecord;
export interface SpecialContributionInput {
  dateGiven: string;
  occasion: string;
  cents: number;
  method: PaymentMethod;
}

interface SpecialRow {
  id: string;
  date_given: string;
  occasion: string;
  cents: string;
  method: PaymentMethod;
}

const toSpecial = (row: SpecialRow): StoredSpecialContribution => ({
  id: Number(row.id),
  dateGiven: row.date_given,
  occasion: row.occasion,
  cents: Number(row.cents),
  method: row.method,
});

const SPECIAL_COLUMNS = `id, to_char(given_on, 'YYYY-MM-DD') AS date_given, occasion, round(amount * 100)::bigint AS cents, method`;

interface Row {
  id: string;
  date_given: string;
  for_month: string;
  cents: string;
  method: PaymentMethod;
  description: string | null;
}

const toGift = (row: Row): StoredGift => ({
  id: Number(row.id),
  dateGiven: row.date_given,
  forMonth: row.for_month,
  cents: Number(row.cents),
  method: row.method,
  description: row.description,
});

// Dates are formatted in SQL so the driver never turns a calendar date into a time-zone-shifted Date.
// Money is decimal(12,2) in the database and integer cents in code (ADR-0007); it is converted only here.
const COLUMNS = `id, to_char(given_on, 'YYYY-MM-DD') AS date_given, to_char(for_month, 'YYYY-MM') AS for_month,
  round(amount * 100)::bigint AS cents, method, description`;
const VALUES = "$1::date, ($2 || '-01')::date, $3::numeric / 100, $4, $5, $6";

/** SQL for regular gifts. No business rules: those live in services/giftService.ts. */
export interface GiftRepository {
  /** Every gift, newest month first, then newest date given. */
  listAll(): Promise<StoredGift[]>;
  insert(gift: GiftInput): Promise<StoredGift>;
  /** Undefined when there is no such gift. */
  update(id: number, gift: GiftInput): Promise<StoredGift | undefined>;
  /** True when a gift was removed. */
  remove(id: number): Promise<boolean>;

  /** Every special contribution, newest date given first (GIV-02). */
  listSpecial(): Promise<StoredSpecialContribution[]>;
  insertSpecial(contribution: SpecialContributionInput): Promise<StoredSpecialContribution>;
  /** Undefined when there is no such contribution. */
  updateSpecial(id: number, contribution: SpecialContributionInput): Promise<StoredSpecialContribution | undefined>;
  /** True when a contribution was removed. */
  removeSpecial(id: number): Promise<boolean>;
}

export const giftRepository: GiftRepository = {
  async listAll() {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM regular_gifts WHERE user_id = $1 ORDER BY for_month DESC, given_on DESC, id DESC`, [currentUserId()]);
    return result.rows.map(toGift);
  },

  async insert({ dateGiven, forMonth, cents, method, description }) {
    const result = await getPool().query<Row>(
      `INSERT INTO regular_gifts (given_on, for_month, amount, method, description, user_id) VALUES (${VALUES}) RETURNING ${COLUMNS}`,
      [dateGiven, forMonth, cents, method, description, currentUserId()],
    );
    return toGift(result.rows[0]!);
  },

  async update(id, { dateGiven, forMonth, cents, method, description }) {
    const result = await getPool().query<Row>(
      `UPDATE regular_gifts SET given_on = $2::date, for_month = ($3 || '-01')::date, amount = $4::numeric / 100, method = $5, description = $6, updated_at = now()
       WHERE id = $1 AND user_id = $7 RETURNING ${COLUMNS}`,
      [id, dateGiven, forMonth, cents, method, description, currentUserId()],
    );
    return result.rows[0] ? toGift(result.rows[0]) : undefined;
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM regular_gifts WHERE id = $1 AND user_id = $2", [id, currentUserId()]);
    return (result.rowCount ?? 0) > 0;
  },

  async listSpecial() {
    const result = await getPool().query<SpecialRow>(`SELECT ${SPECIAL_COLUMNS} FROM special_contributions WHERE user_id = $1 ORDER BY given_on DESC, id DESC`, [currentUserId()]);
    return result.rows.map(toSpecial);
  },

  async insertSpecial({ dateGiven, occasion, cents, method }) {
    const result = await getPool().query<SpecialRow>(
      `INSERT INTO special_contributions (given_on, occasion, amount, method, user_id) VALUES ($1::date, $2, $3::numeric / 100, $4, $5) RETURNING ${SPECIAL_COLUMNS}`,
      [dateGiven, occasion, cents, method, currentUserId()],
    );
    return toSpecial(result.rows[0]!);
  },

  async updateSpecial(id, { dateGiven, occasion, cents, method }) {
    const result = await getPool().query<SpecialRow>(
      `UPDATE special_contributions SET given_on = $2::date, occasion = $3, amount = $4::numeric / 100, method = $5, updated_at = now()
       WHERE id = $1 AND user_id = $6 RETURNING ${SPECIAL_COLUMNS}`,
      [id, dateGiven, occasion, cents, method, currentUserId()],
    );
    return result.rows[0] ? toSpecial(result.rows[0]) : undefined;
  },

  async removeSpecial(id) {
    const result = await getPool().query("DELETE FROM special_contributions WHERE id = $1 AND user_id = $2", [id, currentUserId()]);
    return (result.rowCount ?? 0) > 0;
  },
};
