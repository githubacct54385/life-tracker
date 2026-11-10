// Test helper for *.int.test.ts. A throwaway Postgres in a container; synthetic data only.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";

export interface PostgresInfo {
  host: string;
  port: number;
  user: string;
  password: string;
}

const GRANTS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/setup/app-role-grants.sql");

/** True when a Docker socket or DOCKER_HOST is configured. Used to skip locally, never in CI. */
export function dockerAvailable(): boolean {
  if (process.env.CI) return true; // in CI a missing Docker must fail loudly, not skip
  return (
    Boolean(process.env.DOCKER_HOST) ||
    ["/var/run/docker.sock", `${process.env.HOME}/.docker/run/docker.sock`].some((socket) => existsSync(socket))
  );
}

export function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer("postgres:17-alpine").start();
}

export function configFor(server: PostgresInfo, database: string, user = server.user, password = server.password): pg.ClientConfig {
  return { host: server.host, port: server.port, database, user, password };
}

/** Run statements with a short-lived connection. */
export async function run<T extends pg.QueryResultRow = pg.QueryResultRow>(config: pg.ClientConfig, text: string): Promise<T[]> {
  const client = new pg.Client(config);
  await client.connect();
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

/** Create an empty database with a unique name and return its admin config. */
export async function createFreshDatabase(server: PostgresInfo): Promise<{ admin: pg.ClientConfig; name: string }> {
  const name = `t_${randomBytes(6).toString("hex")}`;
  await run(configFor(server, "postgres"), `CREATE DATABASE ${name}`);
  return { admin: configFor(server, name), name };
}

/**
 * Create the app role exactly the way db/setup/app-role.sql does: a plain login role plus the grants in
 * db/setup/app-role-grants.sql. That file is run as written, with only the role name swapped, so the test proves
 * the script that production uses. Role names are cluster-wide in Postgres, hence the random suffix.
 */
export async function createAppRole(server: PostgresInfo, database: string): Promise<pg.ClientConfig> {
  const role = `lt_app_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(16).toString("hex");
  const admin = configFor(server, database);
  await run(admin, `CREATE ROLE ${role} WITH LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  const grants = (await readFile(GRANTS_FILE, "utf8")).replaceAll("lt_app", role);
  await run(admin, grants);
  return configFor(server, database, role, password);
}
