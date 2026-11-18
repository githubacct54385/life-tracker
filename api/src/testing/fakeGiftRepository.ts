// In-memory stand-in for the gift repository, for service and handler unit tests. Synthetic data only.
import type { GiftInput, GiftRepository, SpecialContributionInput, StoredGift, StoredSpecialContribution } from "../repositories/giftRepository.js";

export function fakeGiftRepo(seed: GiftInput[] = [], specialSeed: SpecialContributionInput[] = []): GiftRepository & { rows: StoredGift[]; specialRows: StoredSpecialContribution[] } {
  let nextId = 1;
  const rows: StoredGift[] = seed.map((g) => ({ id: nextId++, ...g }));
  let nextSpecialId = 1;
  const specialRows: StoredSpecialContribution[] = specialSeed.map((c) => ({ id: nextSpecialId++, ...c }));
  const order = (a: StoredGift, b: StoredGift) =>
    a.forMonth !== b.forMonth ? (a.forMonth < b.forMonth ? 1 : -1) : a.dateGiven !== b.dateGiven ? (a.dateGiven < b.dateGiven ? 1 : -1) : b.id - a.id;
  return {
    rows,
    specialRows,
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
    async listSpecial() {
      return [...specialRows].sort((a, b) => (a.dateGiven === b.dateGiven ? b.id - a.id : a.dateGiven < b.dateGiven ? 1 : -1));
    },
    async insertSpecial(contribution) {
      const row = { id: nextSpecialId++, ...contribution };
      specialRows.push(row);
      return row;
    },
    async updateSpecial(id, contribution) {
      const index = specialRows.findIndex((r) => r.id === id);
      if (index < 0) return undefined;
      specialRows[index] = { id, ...contribution };
      return specialRows[index];
    },
    async removeSpecial(id) {
      const index = specialRows.findIndex((r) => r.id === id);
      if (index >= 0) specialRows.splice(index, 1);
      return index >= 0;
    },
  };
}
