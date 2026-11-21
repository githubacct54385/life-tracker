import { getPool } from "../db/connection.js";

export type PersonRole = "admin" | "user";
export type PersonStatus = "active" | "removed";

export interface Person {
  id: number;
  role: PersonRole;
  status: PersonStatus;
}

interface Row {
  id: string;
  role: PersonRole;
  status: PersonStatus;
}

const toPerson = (row: Row): Person => ({ id: Number(row.id), role: row.role, status: row.status });

/** SQL for the people who use the app (SET-04, ADR-0026). Emails are stored lower-case and never leave the database layer in logs. */
export interface UserRepository {
  /** The person with this email (already lower-case), or undefined. */
  findByEmail(email: string): Promise<Person | undefined>;
  /**
   * Adds the owner as an admin the first time they are seen. Safe to repeat or to run twice at the same moment. (Before every row
   * had to have a person, this also claimed the rows saved before people existed; migration 0012 now does that once and for all.)
   */
  createOwner(email: string): Promise<Person>;
}

export const userRepository: UserRepository = {
  async findByEmail(email) {
    const result = await getPool().query<Row>("SELECT id, role, status FROM users WHERE email = $1", [email]);
    return result.rows[0] ? toPerson(result.rows[0]) : undefined;
  },

  async createOwner(email) {
    const inserted = await getPool().query<Row>("INSERT INTO users (email, role) VALUES ($1, 'admin') ON CONFLICT (email) DO NOTHING RETURNING id, role, status", [email]);
    const row = inserted.rows[0] ?? (await getPool().query<Row>("SELECT id, role, status FROM users WHERE email = $1", [email])).rows[0]!;
    return toPerson(row);
  },
};
