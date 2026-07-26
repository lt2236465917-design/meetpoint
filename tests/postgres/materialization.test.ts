import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import {
  connectTestDatabase,
  resetCanonicalDatabase,
} from "./database";

const fixture = {
  planId: "10000000-0000-4000-8000-000000000100",
  runId: "10000000-0000-4000-8000-000000000200",
  proposalId: "10000000-0000-4000-8000-000000000300",
  participantIds: [
    "10000000-0000-4000-8000-000000000101",
    "10000000-0000-4000-8000-000000000102",
  ] as const,
  taskIds: [
    "10000000-0000-4000-8000-000000000201",
    "10000000-0000-4000-8000-000000000202",
  ] as const,
  quoteRowIds: [
    "10000000-0000-4000-8000-000000000401",
    "10000000-0000-4000-8000-000000000402",
  ] as const,
} as const;

async function seedApprovedRun(client: Client): Promise<void> {
  const [p1, p2] = fixture.participantIds;
  const [t1, t2] = fixture.taskIds;
  const [q1, q2] = fixture.quoteRowIds;
  const sharedQuoteId = "shared-physical-quote";

  await client.query(
    `insert into public.plans (id, code, title, meeting_date, participant_limit)
     values ($1, 'MATV2A', '原子物化', '2026-08-15', 2)`,
    [fixture.planId],
  );
  await client.query(
    `insert into public.participants
       (id, plan_id, name, departure_city_code, departure_city_name, accepted_modes)
     values
       ($1, $3, '甲', 'beijing', '北京', array['high_speed_rail']),
       ($2, $3, '乙', 'shanghai', '上海', array['high_speed_rail'])`,
    [p1, p2, fixture.planId],
  );
  await client.query(
    `insert into public.recommendation_runs (id, plan_id, status, policy_version)
     values ($1, $2, 'validating', '2026-07-19.v2')`,
    [fixture.runId, fixture.planId],
  );
  await client.query(
    `insert into public.route_tasks
       (id, run_id, participant_id, city_code, origin_city_code, mode,
        search_date, physical_key, status)
     values
       ($1, $3, $4, 'wuhan', 'beijing', 'high_speed_rail', '2026-08-15', 'p1:wuhan:rail', 'succeeded'),
       ($2, $3, $5, 'wuhan', 'shanghai', 'high_speed_rail', '2026-08-15', 'p2:wuhan:rail', 'succeeded')`,
    [t1, t2, fixture.runId, p1, p2],
  );
  await client.query(
    `insert into public.verified_quotes
       (id, route_task_id, run_id, participant_id, city_code, quote_id,
        mode, search_date, queried_at, provider, price_cny, depart_at,
        arrive_at, duration_minutes, transfer_count, is_direct, service_name)
     values
       ($1, $3, $5, $6, 'wuhan', $8, 'high_speed_rail', '2026-08-15',
        '2026-07-26T10:00:00+08:00', 'fixture', 100,
        '2026-08-15T08:00:00+08:00', '2026-08-15T10:00:00+08:00', 120, 0, true, 'G1'),
       ($2, $4, $5, $7, 'wuhan', $8, 'high_speed_rail', '2026-08-15',
        '2026-07-26T10:00:00+08:00', 'fixture', 120,
        '2026-08-15T09:00:00+08:00', '2026-08-15T12:00:00+08:00', 180, 1, true, 'G2')`,
    [q1, q2, t1, t2, fixture.runId, p1, p2, sharedQuoteId],
  );
  await client.query(
    `insert into public.recommendation_proposals
       (id, run_id, version, policy_version, status, output_json,
        validation_decision, supervisor_approved_version)
     values ($1, $2, 1, '2026-07-19.v2', 'approved', $3, '{"ok":true}', 1)`,
    [fixture.proposalId, fixture.runId, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: sharedQuoteId, [p2]: sharedQuoteId },
          totalFareCny: 220,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: sharedQuoteId, [p2]: sharedQuoteId },
          totalFareCny: 220,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["wuhan"],
        orderedCityCodes: ["wuhan"],
      },
      explanationZh: "按真实路线选择。",
    }],
  );
}

describe("atomic recommendation result materialization", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetCanonicalDatabase(client);
    await seedApprovedRun(client);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("derives and inserts the complete participant-owned result tree", async () => {
    const materialized = await client.query<{ result_id: string }>(
      `select public.materialize_recommendation_result($1, $2)::text as result_id`,
      [fixture.runId, fixture.proposalId],
    );
    expect(materialized.rows[0]?.result_id).toMatch(/^[0-9a-f-]{36}$/);

    const schemes = await client.query<{
      kind: string;
      total_fare_cny: number;
      total_duration_minutes: number;
      latest_arrival_matches: boolean;
      team_transfer_count: number;
    }>(
      `select kind, total_fare_cny, total_duration_minutes,
              latest_arrival_at = '2026-08-15T12:00:00+08:00'::timestamptz
                as latest_arrival_matches,
              team_transfer_count
       from public.recommendation_schemes
       order by kind`,
    );
    expect(schemes.rows).toEqual([
      {
        kind: "fast",
        total_fare_cny: 220,
        total_duration_minutes: 300,
        latest_arrival_matches: true,
        team_transfer_count: 1,
      },
      {
        kind: "saving",
        total_fare_cny: 220,
        total_duration_minutes: 300,
        latest_arrival_matches: true,
        team_transfer_count: 1,
      },
    ]);

    const routes = await client.query<{
      kind: string;
      participant_id: string;
      verified_quote_id: string;
    }>(
      `select scheme.kind, route.participant_id::text, route.verified_quote_id::text
       from public.recommendation_scheme_routes as route
       join public.recommendation_schemes as scheme on scheme.id = route.scheme_id
       order by scheme.kind, route.participant_id`,
    );
    expect(routes.rows).toEqual([
      { kind: "fast", participant_id: fixture.participantIds[0], verified_quote_id: fixture.quoteRowIds[0] },
      { kind: "fast", participant_id: fixture.participantIds[1], verified_quote_id: fixture.quoteRowIds[1] },
      { kind: "saving", participant_id: fixture.participantIds[0], verified_quote_id: fixture.quoteRowIds[0] },
      { kind: "saving", participant_id: fixture.participantIds[1], verified_quote_id: fixture.quoteRowIds[1] },
    ]);
  });

  it("rolls back the entire tree when scheme insertion fails", async () => {
    await client.query(`
      create function public.raise_test_scheme_failure()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'test scheme failure';
      end;
      $$;
      create trigger recommendation_scheme_test_failure
      before insert on public.recommendation_schemes
      for each row execute function public.raise_test_scheme_failure();
    `);

    await expect(client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow("test scheme failure");

    const counts = await client.query<{
      results: string;
      schemes: string;
      routes: string;
    }>(`
      select
        (select count(*) from public.recommendation_results)::text as results,
        (select count(*) from public.recommendation_schemes)::text as schemes,
        (select count(*) from public.recommendation_scheme_routes)::text as routes
    `);
    expect(counts.rows).toEqual([{ results: "0", schemes: "0", routes: "0" }]);
  });

  it("rolls back the entire tree when route insertion fails", async () => {
    await client.query(`
      create function public.raise_test_route_failure()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'test route failure';
      end;
      $$;
      create trigger recommendation_route_test_failure
      before insert on public.recommendation_scheme_routes
      for each row execute function public.raise_test_route_failure();
    `);

    await expect(client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow("test route failure");

    const counts = await client.query<{
      results: string;
      schemes: string;
      routes: string;
    }>(`
      select
        (select count(*) from public.recommendation_results)::text as results,
        (select count(*) from public.recommendation_schemes)::text as schemes,
        (select count(*) from public.recommendation_scheme_routes)::text as routes
    `);
    expect(counts.rows).toEqual([{ results: "0", schemes: "0", routes: "0" }]);
  });

  it("returns the same result UUID without duplicates after a complete commit", async () => {
    const first = await client.query<{ result_id: string }>(
      "select public.materialize_recommendation_result($1, $2)::text as result_id",
      [fixture.runId, fixture.proposalId],
    );
    const second = await client.query<{ result_id: string }>(
      "select public.materialize_recommendation_result($1, $2)::text as result_id",
      [fixture.runId, fixture.proposalId],
    );

    expect(second.rows[0]?.result_id).toBe(first.rows[0]?.result_id);
    const counts = await client.query<{
      results: string;
      schemes: string;
      routes: string;
    }>(`
      select
        (select count(*) from public.recommendation_results)::text as results,
        (select count(*) from public.recommendation_schemes)::text as schemes,
        (select count(*) from public.recommendation_scheme_routes)::text as routes
    `);
    expect(counts.rows).toEqual([{ results: "1", schemes: "2", routes: "4" }]);
  });

  it("rejects an existing result-only draft as incomplete", async () => {
    await client.query(
      `insert into public.recommendation_results
         (id, plan_id, run_id, proposal_id, city_code, explanation_zh, is_shared)
       values
         ('10000000-0000-4000-8000-000000000500', $1, $2, $3,
          'wuhan', '按真实路线选择。', false)`,
      [fixture.planId, fixture.runId, fixture.proposalId],
    );

    await expect(client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow("existing result tree is incomplete or mismatched");

    const counts = await client.query<{ results: string; schemes: string }>(`
      select
        (select count(*) from public.recommendation_results)::text as results,
        (select count(*) from public.recommendation_schemes)::text as schemes
    `);
    expect(counts.rows).toEqual([{ results: "1", schemes: "0" }]);
  });

  it("rejects a run that is not validating", async () => {
    await client.query(
      "update public.recommendation_runs set status = 'calculating' where id = $1",
      [fixture.runId],
    );

    await expect(client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow("run is not valid for materialization");
  });

  it("rejects a proposal without exact Supervisor approval", async () => {
    await client.query(
      `update public.recommendation_proposals
       set status = 'pending', supervisor_approved_version = null
       where id = $1`,
      [fixture.proposalId],
    );

    await expect(client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow("proposal is not approved for this run and policy");
  });

  it("creates no rows when policy replay rejects the proposal", async () => {
    await client.query(
      `update public.recommendation_proposals
       set output_json = jsonb_set(output_json, '{schemes,0,totalFareCny}', '221'::jsonb)
       where id = $1`,
      [fixture.proposalId],
    );

    await expect(client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow("proposal does not match recommendation policy");

    const counts = await client.query<{
      results: string;
      schemes: string;
      routes: string;
    }>(`
      select
        (select count(*) from public.recommendation_results)::text as results,
        (select count(*) from public.recommendation_schemes)::text as schemes,
        (select count(*) from public.recommendation_scheme_routes)::text as routes
    `);
    expect(counts.rows).toEqual([{ results: "0", schemes: "0", routes: "0" }]);
  });

  it("rejects an existing complete-looking tree with mismatched aggregates", async () => {
    await client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    );
    await client.query(
      `update public.recommendation_schemes
       set total_duration_minutes = total_duration_minutes + 1
       where kind = 'saving'`,
    );

    await expect(client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow("existing result tree is incomplete or mismatched");
  });

  it.each(["anon", "authenticated"])(
    "denies materialization to the %s role",
    async (role) => {
      await client.query(`set role ${role}`);
      try {
        await expect(client.query(
          "select public.materialize_recommendation_result($1, $2)",
          [fixture.runId, fixture.proposalId],
        )).rejects.toThrow("permission denied");
      } finally {
        await client.query("reset role");
      }
    },
  );
});
