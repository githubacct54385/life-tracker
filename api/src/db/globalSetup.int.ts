// Vitest global setup for integration tests: ONE SQL Server container per test run.
import type { StartedMSSQLServerContainer } from "@testcontainers/mssqlserver";
import type { TestProject } from "vitest/node";
import { dockerAvailable, startSqlServer } from "./testDatabase.js";

let container: StartedMSSQLServerContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  if (!dockerAvailable()) {
    console.warn("\n[integration] Docker not found: database tests are SKIPPED. They run in CI. See TESTING.md.\n");
    return;
  }
  container = await startSqlServer();
  project.provide("sqlServer", {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
  });
}

export async function teardown(): Promise<void> {
  await container?.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    sqlServer: { host: string; port: number; user: string; password: string } | undefined;
  }
}
