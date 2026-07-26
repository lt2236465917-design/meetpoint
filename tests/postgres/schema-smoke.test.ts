import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";

import {
  connectTestDatabase,
  resetCanonicalDatabase,
} from "./database";

describe("canonical PostgreSQL schema", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectTestDatabase();
    await resetCanonicalDatabase(client);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("loads the current recommendation schema in a disposable database", async () => {
    const result = await client.query<{ name: string }>(`
      select to_regclass('public.recommendation_results')::text as name
    `);
    expect(result.rows).toEqual([{ name: "recommendation_results" }]);

    const functions = await client.query<{ name: string }>(`
      select proname as name
      from pg_proc
      where proname in ('publish_shared_result', 'confirm_alternative_result')
      order by proname
    `);
    expect(functions.rows).toEqual([
      { name: "confirm_alternative_result" },
      { name: "publish_shared_result" },
    ]);
  });
});
