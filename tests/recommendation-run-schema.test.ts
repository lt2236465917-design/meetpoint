import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const activeGuard = "recommendation_runs_one_active_per_plan";

describe("active recommendation run database guard", () => {
  it("replaces the historical running-only index with the active-state guard", async () => {
    const [schema, legacyMigration, multiAgentMigration] = await Promise.all([
      readFile("supabase/schema.sql", "utf8"),
      readFile("supabase/migrations/202607140001_add_running_recommendation_run_guard.sql", "utf8"),
      readFile(
        "supabase/migrations/202607150001_multi_agent_recommendation.sql",
        "utf8",
      ),
    ]);

    for (const sql of [schema.toLowerCase(), multiAgentMigration.toLowerCase()]) {
      expect(sql).toContain(activeGuard);
      expect(sql).toContain("on recommendation_runs (plan_id)");
      expect(sql).toContain("'awaiting_host_confirmation'");
    }

    expect(legacyMigration.toLowerCase()).toContain(
      "recommendation_runs_one_running_per_plan",
    );
    expect(multiAgentMigration.toLowerCase()).toContain(
      "drop index if exists recommendation_runs_one_running_per_plan",
    );
    expect(schema.toLowerCase()).not.toContain(
      "recommendation_runs_one_running_per_plan",
    );
  });
});
