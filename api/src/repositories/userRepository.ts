import { getPool } from "../db/connection.js";
import { PERSON_TABLES } from "../db/personTables.js";

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
   * Adds the owner as an admin the first time they are seen, and gives them every row that has no person yet (the data saved
   * before people existed). It runs as one transaction and is safe to repeat or to run twice at the same moment.
   */
  createOwner(email: string): Promise<Person>;
}

export const userRepository: UserRepository = {
  async findByEmail(email) {
    const result = await getPool().query<Row>("SELECT id, role, status FROM users WHERE email = $1", [email]);
    return result.rows[0] ? toPerson(result.rows[0]) : undefined;
  },

  async createOwner(email) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<Row>("INSERT INTO users (email, role) VALUES ($1, 'admin') ON CONFLICT (email) DO NOTHING RETURNING id, role, status", [email]);
      let row = inserted.rows[0];
      if (row) {
        // The table names come from a fixed list in code, never from a request.
        for (const table of PERSON_TABLES) await client.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [row.id]);
      } else {
        row = (await client.query<Row>("SELECT id, role, status FROM users WHERE email = $1", [email])).rows[0]!;
      }
      await client.query("COMMIT");
      return toPerson(row);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  },
};
