// In-memory stand-in for the grocery repository, for service and handler unit tests. Synthetic data only.
import type { GroceryItem } from "@life-tracker/shared";
import type { GroceryRepository } from "../repositories/groceryRepository.js";

export function fakeGroceryRepo(): GroceryRepository & { rows: GroceryItem[] } {
  const rows: GroceryItem[] = [];
  return {
    rows,
    async list(limit) {
      return rows.slice(0, limit).map((row) => ({ ...row }));
    },
    async add(item) {
      const existing = rows.find((row) => row.id === item.id);
      if (existing) return { item: { ...existing }, created: false };
      const row: GroceryItem = { ...item, found: false };
      rows.push(row);
      return { item: { ...row }, created: true };
    },
    async count() {
      return rows.length;
    },
    async edit(id, edit) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, edit);
      return row && { ...row };
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
    async clear() {
      return rows.splice(0).length;
    },
  };
}
