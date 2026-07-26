import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607210001_publication_safety_and_run_recovery.sql";
const schemaPath = "supabase/schema.sql";
const atomicMaterializationMigrationPath =
  "supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql";
const initialMigrationPath =
  "supabase/migrations/202607080001_initial_schema.sql";

const businessTables = [
  "plans",
  "participants",
  "candidate_cities",
  "recommendation_runs",
  "travel_options",
  "city_recommendations",
  "ai_explanations",
  "plan_credentials",
  "participant_credentials",
  "route_tasks",
  "verified_quotes",
  "agent_events",
  "recommendation_proposals",
  "recommendation_results",
  "recommendation_schemes",
  "recommendation_scheme_routes",
] as const;

const broadPublicReadPolicies = [
  ["public read plan by code", "plans"],
  ["public read participants", "participants"],
  ["public read candidate cities", "candidate_cities"],
  ["public read runs", "recommendation_runs"],
  ["public read travel options", "travel_options"],
  ["public read city recommendations", "city_recommendations"],
  ["public read shared recommendation results", "recommendation_results"],
  ["public read shared recommendation schemes", "recommendation_schemes"],
  [
    "public read shared recommendation scheme routes",
    "recommendation_scheme_routes",
  ],
] as const;

const serviceOnlyFunctions = [
  "create_plan_with_host_credential(text, text, date, integer, text)",
  "create_participant_with_credential(text, text, text, text, text[], text)",
  "create_recommendation_run_matrix(uuid, uuid, date, jsonb, jsonb, text, text, uuid)",
  "save_route_task_outcome(uuid, jsonb, jsonb)",
  "publish_shared_result(uuid, uuid)",
  "confirm_alternative_result(uuid, uuid, text)",
] as const;

const realtimeTables = [
  "participants",
  "candidate_cities",
  "recommendation_runs",
  "city_recommendations",
] as const;

function normalizeSql(sql: string) {
  return sql
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

describe("Supabase public read boundary", () => {
  it("drops every broad public-read policy in the hardening migration", async () => {
    const migration = normalizeSql(await readFile(migrationPath, "utf8"));

    for (const [policy, table] of broadPublicReadPolicies) {
      expect(migration).toContain(
        `drop policy if exists "${policy}" on public.${table};`,
      );
    }
  });

  it("revokes direct access to every business table from all browser roles", async () => {
    for (const path of [migrationPath, schemaPath]) {
      const sql = normalizeSql(await readFile(path, "utf8"));

      for (const table of businessTables) {
        expect(sql).toContain(
          `revoke all on table public.${table} from public, anon, authenticated;`,
        );
      }
    }
  });

  it("keeps row-level security enabled on every business table", async () => {
    for (const path of [migrationPath, schemaPath]) {
      const sql = normalizeSql(await readFile(path, "utf8"));

      for (const table of businessTables) {
        expect(sql).toMatch(
          new RegExp(
            `alter table (?:public\\.)?${table} enable row level security;`,
          ),
        );
      }
    }
  });

  it("keeps every service-only RPC revoked from browser roles and granted to service_role", async () => {
    for (const path of [migrationPath, schemaPath]) {
      const sql = normalizeSql(await readFile(path, "utf8"));

      for (const signature of serviceOnlyFunctions) {
        expect(sql).toContain(
          `revoke execute on function ${signature} from public, anon, authenticated;`,
        );
        expect(sql).toContain(
          `grant execute on function ${signature} to service_role;`,
        );
      }
    }
  });

  it("keeps Batch B policy helpers and materialization outside browser authority", async () => {
    for (const path of [atomicMaterializationMigrationPath, schemaPath]) {
      const sql = normalizeSql(await readFile(path, "utf8"));

      expect(sql).toContain(
        "revoke all on schema private from public, anon, authenticated;",
      );
      expect(sql).toContain("grant usage on schema private to service_role;");
      for (const signature of [
        "private.recommendation_policy_projection(uuid)",
        "private.assert_recommendation_proposal(uuid, uuid)",
        "private.assert_materialized_recommendation_result(uuid, uuid, uuid)",
        "public.materialize_recommendation_result(uuid, uuid)",
      ]) {
        expect(sql).toContain(
          `revoke all on function ${signature} from public, anon, authenticated;`,
        );
        expect(sql).toContain(
          `grant execute on function ${signature} to service_role;`,
        );
      }
    }
  });

  it("guardedly removes all unused Realtime publication members", async () => {
    const migration = normalizeSql(await readFile(migrationPath, "utf8"));

    expect(migration).toContain("from pg_catalog.pg_publication_tables");
    expect(migration).toContain("pubname = 'supabase_realtime'");
    expect(migration).toContain("schemaname = 'public'");
    expect(migration).toContain(
      "alter publication supabase_realtime drop table public.%i",
    );
    for (const table of realtimeTables) {
      expect(migration).toContain(`'${table}'`);
    }
  });

  it("leaves the canonical fresh-install schema without broad reads or Realtime additions", async () => {
    const schema = normalizeSql(await readFile(schemaPath, "utf8"));

    expect(schema).not.toContain('create policy "public read');
    for (const table of realtimeTables) {
      expect(schema).not.toContain(
        `alter publication supabase_realtime add table ${table}`,
      );
      expect(schema).not.toContain(
        `alter publication supabase_realtime add table public.${table}`,
      );
    }
  });

  it("does not add an anonymous SQL view or RPC replacement", async () => {
    for (const path of [migrationPath, schemaPath]) {
      const sql = normalizeSql(await readFile(path, "utf8"));

      expect(sql).not.toMatch(/create (?:or replace )?view /);
      expect(sql).not.toMatch(
        /grant (?:select|all|execute)[\s\S]*? to (?:anon|authenticated)(?:,|;)/,
      );
    }
  });

  it("does not modify the historical initial migration", async () => {
    const initialMigration = await readFile(initialMigrationPath);
    const sha256 = createHash("sha256").update(initialMigration).digest("hex");

    expect(sha256).toBe(
      "1bbba74a32a95d681ad5b54bf94352cbb4867a8235e47b2f5e5397e3c6e9b5d3",
    );
  });
});
