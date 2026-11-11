// In-memory stand-in for the gift repository, for service and handler unit tests. Synthetic data only.
import type { GiftInput, GiftRepository, StoredGift } from "../repositories/giftRepository.js";

export function fakeGiftRepo(seed: GiftInput[] = []): GiftRepository & { rows: StoredGift[] } {
  let nextId = 1;
  const rows: StoredGift[] = seed.map((g) => ({ id: nextId++, ...g }));
  const order = (a: StoredGift, b: StoredGift) =>
    a.forMonth !== b.forMonth ? (a.forMonth < b.forMonth ? 1 : -1) : a.dateGiven !== b.dateGiven ? (a.dateGiven < b.dateGiven ? 1 : -1) : b.id - a.id;
  return {
    rows,
    async listAll() {
      return [...rows].sort(order);
    },
    async insert(gift) {
      const row = { id: nextId++, ...gift };
      rows.push(row);
      return row;
    },
    async update(id, gift) {
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return undefined;
      rows[index] = { id, ...gift };
      return rows[index];
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}
