// Vitest global setup for integration tests: ONE Postgres container per test run.
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { dockerAvailable, startPostgres } from "./testDatabase.js";

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  if (!dockerAvailable()) {
    console.warn("\n[integration] Docker not found: database tests are SKIPPED. They run in CI. See TESTING.md.\n");
    return;
  }
  container = await startPostgres();
  project.provide("postgres", {
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
    postgres: { host: string; port: number; user: string; password: string } | undefined;
  }
}
