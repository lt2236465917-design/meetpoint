import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202608010001_reliable_baseline_recommendation.sql",
);

describe("baseline recommendation persistence migration", () => {
  it("stores only canonical coordinates and complete versioned baseline facts", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    expect(sql).toContain("departure_lat double precision");
    expect(sql).toContain("departure_lng double precision");
    expect(sql).toContain("recommendation_runs_baseline_complete");
    expect(sql).toContain("2026-08-01.baseline.v1");
    expect(sql).toContain("canonical_coordinates_and_hubs");
    expect(sql).toContain("baseline_recommendation_mismatch");
    expect(sql).toContain("grant execute on function public.ensure_run_baseline");
    expect(sql).toMatch(/revoke execute on function public\.ensure_run_baseline[\s\S]*from public, anon, authenticated/);
  });

  it("does not write baseline facts into supplier-backed result or scheme tables", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
    const ensureBody = sql.slice(sql.indexOf("create function public.ensure_run_baseline"));

    expect(ensureBody).not.toContain("insert into public.recommendation_results");
    expect(ensureBody).not.toContain("recommendation_schemes");
    expect(ensureBody).not.toContain("verified_quotes");
  });
});
