// Test helper for *.int.test.ts. A throwaway SQL Server in a container; synthetic data only.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { MSSQLServerContainer, type StartedMSSQLServerContainer } from "@testcontainers/mssqlserver";
import sql from "mssql";

export interface SqlServerInfo {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** True when a Docker socket or DOCKER_HOST is configured. Used to skip locally, never in CI. */
export function dockerAvailable(): boolean {
  if (process.env.CI) return true; // in CI a missing Docker must fail loudly, not skip
  return (
    Boolean(process.env.DOCKER_HOST) ||
    ["/var/run/docker.sock", `${process.env.HOME}/.docker/run/docker.sock`].some((socket) => existsSync(socket))
  );
}

export function startSqlServer(): Promise<StartedMSSQLServerContainer> {
  return new MSSQLServerContainer("mcr.microsoft.com/mssql/server:2022-latest").acceptLicense().start();
}

export function configFor(server: SqlServerInfo, database: string, user = server.user, pass = server.password): sql.config {
  return {
    server: server.host,
    port: server.port,
    database,
    user,
    password: pass,
    options: { encrypt: false, trustServerCertificate: true },
  };
}

/** A random password that meets SQL Server's complexity rules. */
export function randomPassword(): string {
  return `Aa1!${randomBytes(12).toString("hex")}`;
}

/** Create an empty database with a unique name and return its admin config. */
export async function createFreshDatabase(server: SqlServerInfo): Promise<{ admin: sql.config; name: string }> {
  const name = `t_${randomBytes(6).toString("hex")}`;
  const master = await new sql.ConnectionPool(configFor(server, "master")).connect();
  try {
    await master.request().batch(`CREATE DATABASE [${name}]`);
  } finally {
    await master.close();
  }
  return { admin: configFor(server, name), name };
}

/**
 * Create the app login the same way docs/azure-setup.md does for lt_app:
 * a user in db_datareader and db_datawriter, nothing else.
 */
export async function createAppLogin(server: SqlServerInfo, database: string): Promise<sql.config> {
  const user = "lt_app_test";
  const pass = randomPassword();
  const master = await new sql.ConnectionPool(configFor(server, "master")).connect();
  try {
    await master.request().batch(`CREATE LOGIN ${user} WITH PASSWORD = '${pass}'`);
  } finally {
    await master.close();
  }
  const admin = await new sql.ConnectionPool(configFor(server, database)).connect();
  try {
    await admin.request().batch(`CREATE USER ${user} FOR LOGIN ${user}`);
    await admin.request().batch(`ALTER ROLE db_datareader ADD MEMBER ${user}`);
    await admin.request().batch(`ALTER ROLE db_datawriter ADD MEMBER ${user}`);
  } finally {
    await admin.close();
  }
  return configFor(server, database, user, pass);
}
