import { type EditGroceryRequest, type GroceryItem, type GrocerySection } from "@life-tracker/shared";
import { getPool } from "../db/connection.js";
import { currentUserId } from "../db/requestUser.js";

export interface NewGroceryItem {
  id: string;
  name: string;
  quantity: string;
  note: string;
  section: GrocerySection;
}

interface Row {
  id: string;
  name: string;
  quantity: string;
  note: string;
  section: GrocerySection;
  found: boolean;
}

const COLUMNS = "id, name, quantity, note, section, found";
const toItem = (row: Row): GroceryItem => ({ id: row.id, name: row.name, quantity: row.quantity, note: row.note, section: row.section, found: row.found });

/** SQL for the grocery list. No business rules: those live in services/groceryService.ts. Every query is for the request's person. */
export interface GroceryRepository {
  /** The person's items, oldest first. */
  list(limit: number): Promise<GroceryItem[]>;
  /** Adds an item. An id this person already used is left alone and that item is returned, so a repeated request makes one item. */
  add(item: NewGroceryItem): Promise<{ item: GroceryItem; created: boolean }>;
  count(): Promise<number>;
  /** Replaces every field except the id. Undefined when there is no such item for this person. */
  edit(id: string, edit: EditGroceryRequest): Promise<GroceryItem | undefined>;
  /** True when an item was removed. */
  remove(id: string): Promise<boolean>;
  /** Removes the person's whole list. Returns how many items it held. */
  clear(): Promise<number>;
}

export const groceryRepository: GroceryRepository = {
  async list(limit) {
    const result = await getPool().query<Row>(`SELECT ${COLUMNS} FROM grocery_items WHERE user_id = $1 ORDER BY created_at, id LIMIT $2`, [currentUserId(), limit]);
    return result.rows.map(toItem);
  },

  async add({ id, name, quantity, note, section }) {
    const userId = currentUserId();
    const inserted = await getPool().query<Row>(
      `INSERT INTO grocery_items (id, user_id, name, quantity, note, section) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, id) DO NOTHING RETURNING ${COLUMNS}`,
      [id, userId, name, quantity, note, section],
    );
    if (inserted.rows[0]) return { item: toItem(inserted.rows[0]), created: true };
    const existing = await getPool().query<Row>(`SELECT ${COLUMNS} FROM grocery_items WHERE id = $1 AND user_id = $2`, [id, userId]);
    return { item: toItem(existing.rows[0]!), created: false };
  },

  async count() {
    const result = await getPool().query<{ count: string }>("SELECT count(*) AS count FROM grocery_items WHERE user_id = $1", [currentUserId()]);
    return Number(result.rows[0]!.count);
  },

  async edit(id, { name, quantity, note, section, found }) {
    const result = await getPool().query<Row>(
      `UPDATE grocery_items SET name = $3, quantity = $4, note = $5, section = $6, found = $7 WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
      [id, currentUserId(), name, quantity, note, section, found],
    );
    return result.rows[0] ? toItem(result.rows[0]) : undefined;
  },

  async remove(id) {
    const result = await getPool().query("DELETE FROM grocery_items WHERE id = $1 AND user_id = $2", [id, currentUserId()]);
    return (result.rowCount ?? 0) > 0;
  },

  async clear() {
    const result = await getPool().query("DELETE FROM grocery_items WHERE user_id = $1", [currentUserId()]);
    return result.rowCount ?? 0;
  },
};
