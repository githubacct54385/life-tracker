import { createHash } from "node:crypto";

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface AppliedMigration {
  name: string;
  checksum: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

const NAME_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Line endings must not change the checksum (Windows vs macOS vs CI). */
export function normalizeSql(sql: string): string {
  return sql.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function checksum(sql: string): string {
  return createHash("sha256").update(normalizeSql(sql)).digest("hex");
}

/**
 * Decide which migrations still need to run. Pure: no database, no disk.
 * Throws MigrationError (nothing should run) when the history and the files disagree.
 */
export function planMigrations(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[] {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

  const numbers = new Set<string>();
  for (const file of sorted) {
    const match = NAME_PATTERN.exec(file.name);
    if (!match) {
      throw new MigrationError(`Bad migration file name: ${file.name} (expected NNNN_description.sql)`);
    }
    const number = match[1] as string;
    if (numbers.has(number)) {
      throw new MigrationError(`Two migration files share the number ${number}`);
    }
    numbers.add(number);
  }

  const byName = new Map(sorted.map((file) => [file.name, file]));
  for (const done of applied) {
    const file = byName.get(done.name);
    if (!file) {
      throw new MigrationError(`Applied migration ${done.name} is missing from the repo`);
    }
    if (checksum(file.sql) !== done.checksum) {
      throw new MigrationError(
        `Migration ${done.name} was already applied but its file has changed. Add a new migration instead.`,
      );
    }
  }

  const appliedNames = new Set(applied.map((done) => done.name));
  const pending = sorted.filter((file) => !appliedNames.has(file.name));
  const lastApplied = applied.map((done) => done.name).sort().at(-1);
  const outOfOrder = pending.find((file) => lastApplied !== undefined && file.name < lastApplied);
  if (outOfOrder) {
    throw new MigrationError(`Migration ${outOfOrder.name} is older than an applied migration (${lastApplied})`);
  }
  return pending;
}
