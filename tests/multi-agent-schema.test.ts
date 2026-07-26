import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607150001_multi_agent_recommendation.sql";
const hardeningMigrationPath =
  "supabase/migrations/202607210001_publication_safety_and_run_recovery.sql";
const atomicMaterializationMigrationPath =
  "supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql";

describe("multi-agent migration", () => {
  it("stores normalized evidence and recommendation records", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    for (const fragment of [
      "create table plan_credentials",
      "create table participant_credentials",
      "create table route_tasks",
      "create table verified_quotes",
      "provider_quote_id",
      "create table agent_events",
      "create table recommendation_proposals",
      "create table recommendation_results",
      "create table recommendation_schemes",
      "check (kind in ('saving', 'fast'))",
      "create table recommendation_scheme_routes",
      "unique (run_id, participant_id, quote_id)",
      "unique (result_id, kind)",
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it("keeps participant tasks distinct when a supplier lookup is shared", async () => {
    for (const path of [migrationPath, "supabase/schema.sql"]) {
      const sql = (await readFile(path, "utf8")).toLowerCase();

      expect(sql).toContain("unique (run_id, participant_id, physical_key)");
      expect(sql).not.toContain("unique (run_id, physical_key)");
    }
  });

  it("isolates credentials and migrates legacy incomplete runs", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    expect(sql).toContain("insert into participant_credentials");
    expect(sql).toContain("drop column edit_token_hash");
    expect(sql).toContain("migrated_legacy_incomplete_run");
    expect(sql).toMatch(/status\s+in\s*\([\s\S]*?'incomplete'/);
    expect(sql).toContain("revoke all on table plan_credentials");
    expect(sql).toContain("revoke all on table participant_credentials");
  });

  it("drops the legacy run status check before migrating incomplete runs", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
    const dropConstraintAt = sql.indexOf(
      "drop constraint recommendation_runs_status_check",
    );
    const migrateLegacyRunsAt = sql.indexOf("update recommendation_runs");
    const addConstraintAt = sql.indexOf(
      "add constraint recommendation_runs_status_check",
    );

    expect(dropConstraintAt).toBeGreaterThan(-1);
    expect(migrateLegacyRunsAt).toBeGreaterThan(dropConstraintAt);
    expect(addConstraintAt).toBeGreaterThan(migrateLegacyRunsAt);
  });

  it("omits the legacy running-only index from the canonical schema", async () => {
    const schema = (await readFile("supabase/schema.sql", "utf8")).toLowerCase();

    expect(schema).not.toContain("recommendation_runs_one_running_per_plan");
    expect(schema).not.toContain("where status = 'running'");
    expect(schema).toContain("recommendation_runs_one_active_per_plan");
  });

  it("makes publication atomic and server-only", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    for (const fragment of [
      "create function publish_shared_result",
      "create function confirm_alternative_result",
      "security invoker",
      "for update",
      "grant execute on function publish_shared_result",
      "grant execute on function confirm_alternative_result",
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).toMatch(
      /revoke execute on function publish_shared_result[\s\S]*?from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /revoke execute on function confirm_alternative_result[\s\S]*?from public, anon, authenticated/,
    );
  });

  it("makes run matrix and task outcome writes atomic and server-only", async () => {
    for (const path of [migrationPath, "supabase/schema.sql"]) {
      const sql = (await readFile(path, "utf8")).toLowerCase();
      for (const name of ["create_recommendation_run_matrix", "save_route_task_outcome"]) {
        expect(sql).toContain(`create function ${name}`);
        expect(sql).toMatch(new RegExp(
          `create function ${name}[\\s\\S]*?security invoker[\\s\\S]*?set search_path = ''`,
        ));
        expect(sql).toMatch(new RegExp(
          `revoke execute on function ${name}[\\s\\S]*?from public, anon, authenticated`,
        ));
        expect(sql).toContain(`grant execute on function ${name}`);
      }
      expect(sql).toContain("jsonb_to_recordset");
      expect(sql).toContain("route task must be running");
    }

    for (const path of [hardeningMigrationPath, "supabase/schema.sql"]) {
      const sql = (await readFile(path, "utf8")).toLowerCase();
      expect(sql).toContain("create function terminalize_route_task_recovery");
      expect(sql).toMatch(
        /create function terminalize_route_task_recovery[\s\S]*?security invoker[\s\S]*?set search_path = ''/,
      );
    }
  });

  it("exposes atomic result materialization only to the service role", async () => {
    for (const path of [atomicMaterializationMigrationPath, "supabase/schema.sql"]) {
      const sql = (await readFile(path, "utf8")).toLowerCase();

      expect(sql).toMatch(
        /create or replace function public\.materialize_recommendation_result[\s\S]*?security invoker[\s\S]*?set search_path = ''/,
      );
      expect(sql).toMatch(
        /revoke all on function public\.materialize_recommendation_result\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/,
      );
      expect(sql).toMatch(
        /grant execute on function public\.materialize_recommendation_result\(uuid, uuid\)[\s\S]*?to service_role/,
      );
      expect(sql).toContain("private.assert_materialized_recommendation_result");
    }
  });

  it("preserves service-only authority in the hardening migration and canonical schema", async () => {
    for (const path of [hardeningMigrationPath, "supabase/schema.sql"]) {
      const sql = (await readFile(path, "utf8")).toLowerCase();

      for (const name of [
        "create_recommendation_run_matrix",
        "save_route_task_outcome",
        "terminalize_route_task_recovery",
        "publish_shared_result",
        "confirm_alternative_result",
      ]) {
        expect(sql).toMatch(
          new RegExp(
            `revoke execute on function ${name}[\\s\\S]*?from public, anon, authenticated`,
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `grant execute on function ${name}[\\s\\S]*?to service_role`,
          ),
        );
      }

      expect(sql).not.toMatch(
        /grant\s+(?:select|all)[\s\S]*?to\s+(?:anon|authenticated)/,
      );
    }
  });

  it("binds an alternative matrix to one requested city and participant without exposing it as a shared candidate", async () => {
    for (const path of [migrationPath, "supabase/schema.sql"]) {
      const sql = (await readFile(path, "utf8")).toLowerCase();
      const start = sql.indexOf("create function create_recommendation_run_matrix");
      const end = sql.indexOf("create function save_route_task_outcome");
      const createMatrix = sql.slice(start, end);

      expect(createMatrix).toContain("p_kind text default 'automatic'");
      expect(createMatrix).toContain("p_requested_city_code text default null");
      expect(createMatrix).toContain("p_requested_by_participant_id uuid default null");
      expect(createMatrix).toContain("jsonb_array_length(p_candidates) <> 1");
      expect(createMatrix).toContain("p_candidates -> 0 ->> 'city_code' is distinct from p_requested_city_code");
      expect(createMatrix).toContain("where p_kind = 'automatic'");
    }
  });

  it("prevents automatic replacement and reserves superseding for host confirmation", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    expect(sql).toContain("recommendation_results_one_shared_per_plan");
    expect(sql).toContain("where is_shared and superseded_at is null");
    expect(sql).toMatch(
      /publish_shared_result[\s\S]*?v_run\.kind\s*<>\s*'automatic'/,
    );
    expect(sql).toMatch(
      /publish_shared_result[\s\S]*?shared result already exists/,
    );
    expect(sql).toMatch(
      /confirm_alternative_result[\s\S]*?v_run\.kind\s*<>\s*'alternative'/,
    );
    expect(sql).toMatch(
      /confirm_alternative_result[\s\S]*?plan_credentials[\s\S]*?host_token_hash/,
    );
  });

  it("publishes the exact approved proposal quote selection", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    expect(sql).toMatch(
      /publish_shared_result[\s\S]*?output_json[\s\S]*?quoteidsbyparticipant/,
    );
    expect(sql).toMatch(
      /confirm_alternative_result[\s\S]*?output_json[\s\S]*?quoteidsbyparticipant/,
    );
  });

  it("rejects participant routes using an unaccepted transport mode", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
    const publishAt = sql.indexOf("create function publish_shared_result");
    const confirmAt = sql.indexOf("create function confirm_alternative_result");
    const revokeAt = sql.indexOf(
      "revoke execute on function publish_shared_result",
    );
    const publishFunction = sql.slice(publishAt, confirmAt);
    const confirmFunction = sql.slice(confirmAt, revokeAt);

    expect(publishFunction).toContain(
      "quote.mode = any (participant.accepted_modes)",
    );
    expect(confirmFunction).toContain(
      "quote.mode = any (participant.accepted_modes)",
    );
  });
});
