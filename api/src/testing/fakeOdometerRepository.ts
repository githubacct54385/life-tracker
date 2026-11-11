// In-memory stand-in for the odometer repository, for service and handler unit tests. Synthetic data only.
import type { OdometerRepository, StoredReading } from "../repositories/odometerRepository.js";

export function fakeRepo(seed: Array<{ date: string; miles: number }> = []): OdometerRepository & { rows: StoredReading[] } {
  let nextId = 1;
  const rows: StoredReading[] = seed.map((r) => ({ id: nextId++, ...r }));
  const newestFirst = () => [...rows].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  return {
    rows,
    async listAll() {
      return newestFirst();
    },
    async insert(reading) {
      const row = { id: nextId++, ...reading };
      rows.push(row);
      return row;
    },
    async updateMiles(id, miles) {
      const row = rows.find((r) => r.id === id);
      if (row) row.miles = miles;
      return row && { ...row };
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}
