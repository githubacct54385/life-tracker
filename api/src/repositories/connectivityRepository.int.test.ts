import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { useConnection } from "../db/connection.js";
import { configFor } from "../db/testDatabase.js";
import { ping } from "./connectivityRepository.js";

const server = inject("sqlServer");

describe.skipIf(!server)("connectivityRepository", () => {
  beforeAll(async () => {
    await useConnection(configFor(server!, "master"));
  });
  afterAll(async () => {
    await useConnection(undefined);
  });

  it("[AC-FND-03.4] ping reaches a throwaway SQL Server through the pooled connection", async () => {
    expect(await ping()).toBe(true);
  });
});
