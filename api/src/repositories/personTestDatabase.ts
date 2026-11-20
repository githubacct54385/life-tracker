// Test support only (used by *.int.test.ts, never by production code): people for the throwaway database.
// Tests that save rows directly (to set up a case) save them for a person, as the app now does.
import { getPool } from "../db/connection.js";
import { withRequestUser } from "../db/requestUser.js";

/** The test owner's person row, added when missing. Same address the synthetic test tokens carry. */
export async function testOwnerId(email = "owner@example.test"): Promise<number> {
  const result = await getPool().query<{ id: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'admin') ON CONFLICT (email) DO UPDATE SET email = users.email RETURNING id",
    [email],
  );
  return Number(result.rows[0]!.id);
}

/** Another person, for tests that prove one person cannot reach another's data. */
export async function addTestPerson(email: string): Promise<number> {
  const result = await getPool().query<{ id: string }>("INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = users.email RETURNING id", [email]);
  return Number(result.rows[0]!.id);
}

/** A repository whose every call runs for one person, so a test can call it directly without building a request. */
export function asPerson<T extends object>(repository: T, personId: () => number): T {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => withRequestUser(personId(), async () => (value as (...a: unknown[]) => unknown).apply(target, args));
    },
  });
}

/** Run a statement straight on the test database (as the app role), to set up or check rows. */
export const testQuery = (text: string, values: unknown[] = []) => getPool().query(text, values);

export { PERSON_TABLES } from "../db/personTables.js";
