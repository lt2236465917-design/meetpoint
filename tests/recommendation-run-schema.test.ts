import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const guard = "create unique index if not exists recommendation_runs_one_running_per_plan";
const predicate = "where status = 'running'";

describe("running recommendation run database guard", () => {
  it("declares the partial unique index in schema and migration", async () => {
    const [schema, migration] = await Promise.all([
      readFile("supabase/schema.sql", "utf8"),
      readFile("supabase/migrations/202607140001_add_running_recommendation_run_guard.sql", "utf8"),
    ]);

    for (const sql of [schema.toLowerCase(), migration.toLowerCase()]) {
      expect(sql).toContain(guard);
      expect(sql).toContain("on recommendation_runs (plan_id)");
      expect(sql).toContain(predicate);
    }
  });
});
