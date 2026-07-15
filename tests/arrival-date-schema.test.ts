import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("arrival-date schema migration", () => {
  it("drops target arrival time while retaining meeting_date as the arrival date", async () => {
    const [migration, schema] = await Promise.all([
      readFile("supabase/migrations/202607150002_remove_target_arrival_time.sql", "utf8"),
      readFile("supabase/schema.sql", "utf8"),
    ]);

    expect(migration.toLowerCase()).toContain("drop column if exists target_arrival_time");
    expect(schema).toContain("meeting_date date not null, -- Planned arrival date");
    expect(schema).not.toContain("target_arrival_time");
  });
});
