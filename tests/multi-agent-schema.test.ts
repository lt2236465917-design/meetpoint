import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202607150001_multi_agent_recommendation.sql";

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
