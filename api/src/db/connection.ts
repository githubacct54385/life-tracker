import sql from "mssql";

let pool: Promise<sql.ConnectionPool> | undefined;
let override: string | sql.config | undefined;

/** Point the pool somewhere else (integration tests). The app itself uses SQL_CONNECTION. */
export async function useConnection(connection: string | sql.config | undefined): Promise<void> {
  await closePool();
  override = connection;
}

/** Pooled connection for the API, using the least-privilege app login (SQL_CONNECTION). */
export function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    const connection = override ?? process.env.SQL_CONNECTION;
    if (!connection) return Promise.reject(new Error("SQL_CONNECTION is not set"));
    pool = new sql.ConnectionPool(connection as sql.config).connect().catch((error: unknown) => {
      pool = undefined; // allow a retry, e.g. while the database wakes from auto-pause
      throw error;
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) await (await current).close();
}

export { sql };
