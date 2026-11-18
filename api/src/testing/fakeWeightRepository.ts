// In-memory stand-in for the weight repository, for service and handler unit tests. Synthetic data only.
import type { StoredWeight, WeightRepository } from "../repositories/weightRepository.js";

export function fakeWeightRepo(seed: Array<Omit<StoredWeight, "id">> = []): WeightRepository & { rows: StoredWeight[] } {
  let nextId = 1;
  const rows: StoredWeight[] = seed.map((w) => ({ id: nextId++, ...w }));
  return {
    rows,
    async list(limit) {
      return [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
    },
    async findByDate(date) {
      const row = rows.find((r) => r.date === date);
      return row && { ...row };
    },
    async insert(entry) {
      if (rows.some((r) => r.date === entry.date)) throw new Error("duplicate date");
      const row = { id: nextId++, ...entry };
      rows.push(row);
      return { ...row };
    },
    async update(id, pounds) {
      const row = rows.find((r) => r.id === id);
      if (row) row.pounds = pounds;
      return row && { ...row };
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}
