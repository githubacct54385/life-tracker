// In-memory stand-in for the workout repository, for service and handler unit tests. Synthetic data only.
import type { StoredWorkout, WorkoutRepository } from "../repositories/workoutRepository.js";

export function fakeWorkoutRepo(seed: Array<Omit<StoredWorkout, "id">> = []): WorkoutRepository & { rows: StoredWorkout[] } {
  let nextId = 1;
  const rows: StoredWorkout[] = seed.map((w) => ({ id: nextId++, ...w }));
  const newestFirst = () => [...rows].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  return {
    rows,
    async list(limit) {
      return newestFirst().slice(0, limit);
    },
    async insert(workout) {
      const row = { id: nextId++, ...workout };
      rows.push(row);
      return { ...row };
    },
    async update(id, fields) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, fields);
      return row && { ...row };
    },
    async remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}
