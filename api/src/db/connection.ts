import pg from "pg";

let pool: pg.Pool | undefined;
let override: string | pg.PoolConfig | undefined;

/** Point the pool somewhere else (integration tests). The app itself uses DATABASE_URL. */
export async function useConnection(connection: string | pg.PoolConfig | undefined): Promise<void> {
  await closePool();
  override = connection;
}

/**
 * Pooled connection for the API, using the least-privilege app role (DATABASE_URL).
 * Connections are opened lazily, so a database that is waking from idle only delays the
 * first query; a failed attempt does not poison the pool and the next call tries again.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connection = override ?? process.env.DATABASE_URL;
    if (!connection) throw new Error("DATABASE_URL is not set");
    const config: pg.PoolConfig = typeof connection === "string" ? { connectionString: connection } : connection;
    pool = new pg.Pool({ max: 5, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000, ...config });
    // An idle client can be dropped by the server (for example when Neon suspends). Do not crash the process.
    pool.on("error", () => {});
  }
  return pool;
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}
