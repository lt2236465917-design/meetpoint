import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Supabase migration chain", () => {
  it("starts with a reproducible baseline before incremental migrations", async () => {
    const migrations = (await readdir("supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    expect(migrations[0]).toBe("202607080001_initial_schema.sql");

    const baseline = (
      await readFile(`supabase/migrations/${migrations[0]}`, "utf8")
    ).toLowerCase();

    for (const table of [
      "plans",
      "participants",
      "candidate_cities",
      "recommendation_runs",
      "travel_options",
      "city_recommendations",
      "ai_explanations",
    ]) {
      expect(baseline).toContain(`create table if not exists ${table}`);
    }
  });

  it("moves the legacy host credential before removing its plan column", async () => {
    const migration = (
      await readFile(
        "supabase/migrations/202607150001_multi_agent_recommendation.sql",
        "utf8",
      )
    ).toLowerCase();

    expect(migration).toMatch(
      /insert into plan_credentials[\s\S]*?select[\s\S]*?management_token_hash[\s\S]*?from plans/,
    );
    expect(migration).toContain("drop column management_token_hash");
  });
});
