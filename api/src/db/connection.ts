import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

let pool: pg.Pool | undefined;
let override: string | pg.PoolConfig | undefined;
const requestPools = new AsyncLocalStorage<pg.Pool>();

/** Point the pool somewhere else (integration tests). The app itself uses DATABASE_URL. */
export async function useConnection(connection: string | pg.PoolConfig | undefined): Promise<void> {
  await closePool();
  override = connection;
}

function newPool(connection: string | pg.PoolConfig, max: number): pg.Pool {
  const config: pg.PoolConfig = typeof connection === "string" ? { connectionString: connection } : connection;
  const created = new pg.Pool({ max, connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000, ...config });
  // An idle client can be dropped by the server (for example when Neon suspends). Do not crash the process.
  created.on("error", () => {});
  return created;
}

/**
 * Pooled connection for the API, using the least-privilege app role (DATABASE_URL).
 * Connections are opened lazily, so a database that is waking from idle only delays the
 * first query; a failed attempt does not poison the pool and the next call tries again.
 * Inside `withRequestPool` the pool of that request is used instead.
 */
export function getPool(): pg.Pool {
  const forRequest = requestPools.getStore();
  if (forRequest) return forRequest;
  if (!pool) {
    const connection = override ?? process.env.DATABASE_URL;
    if (!connection) throw new Error("DATABASE_URL is not set");
    pool = newPool(connection, 5);
  }
  return pool;
}

/**
 * Cloudflare Workers cannot reuse a network connection across requests, so the Worker gives every request its own
 * small pool (read from the Worker's `DATABASE_URL` secret) and closes it afterwards. Nothing about the URL is logged.
 * Without a URL the function simply runs and `getPool` falls back to its normal behaviour (and fails closed if unset).
 */
export async function withRequestPool<T>(
  connectionString: string | undefined,
  run: () => Promise<T>,
  closeLater: (done: Promise<unknown>) => void = () => {},
): Promise<T> {
  if (!connectionString?.trim() || override) return run();
  const requestPool = newPool(connectionString, 2);
  try {
    return await requestPools.run(requestPool, run);
  } finally {
    closeLater(requestPool.end().catch(() => {}));
  }
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}
