import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import {
  applyMigration,
  connectTestDatabase,
  resetThroughMigration,
} from "./database";

const PRE_BATCH_B_MIGRATION = "202607210001_publication_safety_and_run_recovery.sql";
const BATCH_B_MIGRATION = "202607260001_atomic_materialization_and_policy_replay.sql";

const fixture = {
  planId: "30000000-0000-4000-8000-000000000100",
  runId: "30000000-0000-4000-8000-000000000200",
  proposalId: "30000000-0000-4000-8000-000000000300",
  resultId: "30000000-0000-4000-8000-000000000400",
} as const;

async function seedResultOnlyDraft(client: Client): Promise<void> {
  await client.query(
    `insert into public.plans (id, code, title, meeting_date, participant_limit)
     values ($1, 'CLNV2A', '迁移清理', '2026-08-15', 2)`,
    [fixture.planId],
  );
  await client.query(
    `insert into public.recommendation_runs
       (id, plan_id, status, policy_version, stale_after,
        advance_lease_token, advance_lease_expires_at)
     values ($1, $2, 'validating', '2026-07-19.v2', now() + interval '1 hour',
             '30000000-0000-4000-8000-000000000500', now() + interval '5 minutes')`,
    [fixture.runId, fixture.planId],
  );
  await client.query(
    `insert into public.recommendation_proposals
       (id, run_id, version, policy_version, status, output_json,
        validation_decision, supervisor_approved_version)
     values ($1, $2, 1, '2026-07-19.v2', 'approved', $3, '{"ok":true}', 1)`,
    [fixture.proposalId, fixture.runId, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [],
      comparisonEvidence: { eligibleCityCodes: [], orderedCityCodes: [] },
      explanationZh: "迁移前不完整草稿。",
    }],
  );
  await client.query(
    `insert into public.recommendation_results
       (id, plan_id, run_id, proposal_id, city_code, explanation_zh, is_shared)
     values ($1, $2, $3, $4, 'wuhan', '迁移前不完整草稿。', false)`,
    [fixture.resultId, fixture.planId, fixture.runId, fixture.proposalId],
  );
}

const policyFixture = {
  planId: "31000000-0000-4000-8000-000000000100",
  runId: "31000000-0000-4000-8000-000000000200",
  proposalId: "31000000-0000-4000-8000-000000000300",
  resultId: "31000000-0000-4000-8000-000000000400",
  participantIds: [
    "31000000-0000-4000-8000-000000000101",
    "31000000-0000-4000-8000-000000000102",
  ] as const,
  taskIds: [
    "31000000-0000-4000-8000-000000000201",
    "31000000-0000-4000-8000-000000000202",
  ] as const,
  quoteRowIds: [
    "31000000-0000-4000-8000-000000000501",
    "31000000-0000-4000-8000-000000000502",
  ] as const,
  schemeIds: [
    "31000000-0000-4000-8000-000000000601",
    "31000000-0000-4000-8000-000000000602",
  ] as const,
} as const;

async function seedPolicyDraft(
  client: Client,
  options: { oneScheme?: boolean; policyInvalid?: boolean } = {},
): Promise<void> {
  const [p1, p2] = policyFixture.participantIds;
  const [t1, t2] = policyFixture.taskIds;
  const [q1, q2] = policyFixture.quoteRowIds;
  const [savingSchemeId, fastSchemeId] = policyFixture.schemeIds;

  await client.query(
    `insert into public.plans (id, code, title, meeting_date, participant_limit)
     values ($1, 'CLNV2B', '策略草稿', '2026-08-15', 2)`,
    [policyFixture.planId],
  );
  await client.query(
    `insert into public.participants
       (id, plan_id, name, departure_city_code, departure_city_name, accepted_modes)
     values
       ($1, $3, '甲', 'beijing', '北京', array['high_speed_rail']),
       ($2, $3, '乙', 'shanghai', '上海', array['high_speed_rail'])`,
    [p1, p2, policyFixture.planId],
  );
  await client.query(
    `insert into public.recommendation_runs
       (id, plan_id, status, policy_version, stale_after)
     values ($1, $2, 'validating', '2026-07-19.v2', now() + interval '1 hour')`,
    [policyFixture.runId, policyFixture.planId],
  );
  await client.query(
    `insert into public.route_tasks
       (id, run_id, participant_id, city_code, origin_city_code, mode,
        search_date, physical_key, status)
     values
       ($1, $3, $4, 'wuhan', 'beijing', 'high_speed_rail', '2026-08-15', 'p1:wuhan:rail', 'succeeded'),
       ($2, $3, $5, 'wuhan', 'shanghai', 'high_speed_rail', '2026-08-15', 'p2:wuhan:rail', 'succeeded')`,
    [t1, t2, policyFixture.runId, p1, p2],
  );
  await client.query(
    `insert into public.verified_quotes
       (id, route_task_id, run_id, participant_id, city_code, quote_id,
        mode, search_date, queried_at, provider, price_cny, depart_at,
        arrive_at, duration_minutes, transfer_count, is_direct, service_name)
     values
       ($1, $3, $5, $6, 'wuhan', 'p1-original', 'high_speed_rail', '2026-08-15',
        '2026-07-26T10:00:00+08:00', 'fixture', 100,
        '2026-08-15T08:00:00+08:00', '2026-08-15T10:00:00+08:00', 120, 0, true, 'G1'),
       ($2, $4, $5, $7, 'wuhan', 'p2-original', 'high_speed_rail', '2026-08-15',
        '2026-07-26T10:00:00+08:00', 'fixture', 120,
        '2026-08-15T09:00:00+08:00', '2026-08-15T12:00:00+08:00', 180, 0, true, 'G2')`,
    [q1, q2, t1, t2, policyFixture.runId, p1, p2],
  );
  if (options.policyInvalid) {
    await client.query(
      `insert into public.verified_quotes
         (id, route_task_id, run_id, participant_id, city_code, quote_id,
          mode, search_date, queried_at, provider, price_cny, depart_at,
          arrive_at, duration_minutes, transfer_count, is_direct, service_name)
       values
         ('31000000-0000-4000-8000-000000000503', $1, $2, $3, 'wuhan',
          'p1-better', 'high_speed_rail', '2026-08-15',
          '2026-07-26T10:05:00+08:00', 'fixture', 50,
          '2026-08-15T08:00:00+08:00', '2026-08-15T10:00:00+08:00',
          120, 0, true, 'G3')`,
      [t1, policyFixture.runId, p1],
    );
  }
  await client.query(
    `insert into public.recommendation_proposals
       (id, run_id, version, policy_version, status, output_json,
        validation_decision, supervisor_approved_version)
     values ($1, $2, 1, '2026-07-19.v2', 'approved', $3, '{"ok":true}', 1)`,
    [policyFixture.proposalId, policyFixture.runId, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "p1-original", [p2]: "p2-original" },
          totalFareCny: 220,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "p1-original", [p2]: "p2-original" },
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
  await client.query(
    `insert into public.recommendation_results
       (id, plan_id, run_id, proposal_id, city_code, explanation_zh, is_shared)
     values ($1, $2, $3, $4, 'wuhan', '按真实路线选择。', false)`,
    [
      policyFixture.resultId,
      policyFixture.planId,
      policyFixture.runId,
      policyFixture.proposalId,
    ],
  );
  await client.query(
    `insert into public.recommendation_schemes
       (id, result_id, kind, total_fare_cny, total_duration_minutes,
        latest_arrival_at, team_transfer_count)
     values
       ($1, $3, 'saving', 220, 300, '2026-08-15T12:00:00+08:00', 0),
       ($2, $3, 'fast', 220, 300, '2026-08-15T12:00:00+08:00', 0)`,
    [savingSchemeId, fastSchemeId, policyFixture.resultId],
  );
  await client.query(
    `insert into public.recommendation_scheme_routes
       (scheme_id, participant_id, verified_quote_id)
     values ($1, $3, $5), ($1, $4, $6)
       , ($2, $3, $5), ($2, $4, $6)`,
    [savingSchemeId, fastSchemeId, p1, p2, q1, q2],
  );
  if (options.oneScheme) {
    await client.query(
      "delete from public.recommendation_schemes where id = $1",
      [fastSchemeId],
    );
  }
}

async function seedSharedHistory(client: Client): Promise<void> {
  const planId = "32000000-0000-4000-8000-000000000100";
  const oldRunId = "32000000-0000-4000-8000-000000000201";
  const currentRunId = "32000000-0000-4000-8000-000000000202";
  const oldProposalId = "32000000-0000-4000-8000-000000000301";
  const currentProposalId = "32000000-0000-4000-8000-000000000302";
  const oldResultId = "32000000-0000-4000-8000-000000000401";
  const currentResultId = "32000000-0000-4000-8000-000000000402";

  await client.query(
    `insert into public.plans (id, code, title, meeting_date, participant_limit, status)
     values ($1, 'CLNV2C', '共享历史', '2026-08-15', 2, 'completed')`,
    [planId],
  );
  await client.query(
    `insert into public.recommendation_runs
       (id, plan_id, status, policy_version, completed_at)
     values
       ($1, $3, 'completed', '2026-07-19.v2', '2026-07-20T10:00:00+08:00'),
       ($2, $3, 'completed', '2026-07-19.v2', '2026-07-21T10:00:00+08:00')`,
    [oldRunId, currentRunId, planId],
  );
  await client.query(
    `insert into public.recommendation_proposals
       (id, run_id, version, policy_version, status, output_json,
        validation_decision, supervisor_approved_version)
     values
       ($1, $3, 1, '2026-07-19.v2', 'approved', '{}', '{"ok":true}', 1),
       ($2, $4, 1, '2026-07-19.v2', 'approved', '{}', '{"ok":true}', 1)`,
    [oldProposalId, currentProposalId, oldRunId, currentRunId],
  );
  await client.query(
    `insert into public.recommendation_results
       (id, plan_id, run_id, proposal_id, city_code, explanation_zh,
        is_shared, published_at, superseded_at, superseded_by_result_id)
     values
       ($1, $3, $4, $6, 'wuhan', '旧共享结果。', true,
        '2026-07-20T10:00:00+08:00', '2026-07-21T10:00:00+08:00', null),
       ($2, $3, $5, $7, 'changsha', '当前共享结果。', true,
        '2026-07-21T10:00:00+08:00', null, null)`,
    [
      oldResultId,
      currentResultId,
      planId,
      oldRunId,
      currentRunId,
      oldProposalId,
      currentProposalId,
    ],
  );
  await client.query(
    "update public.recommendation_results set superseded_by_result_id = $1 where id = $2",
    [currentResultId, oldResultId],
  );
}

async function sharedHistorySnapshot(client: Client): Promise<unknown> {
  const snapshot = await client.query(
    `select
       (select jsonb_agg(to_jsonb(result) order by result.id)
        from public.recommendation_results as result) as results,
       (select jsonb_agg(to_jsonb(run) order by run.id)
        from public.recommendation_runs as run) as runs`,
  );
  return snapshot.rows[0];
}

async function callAsRole(
  client: Client,
  role: "anon" | "authenticated" | "service_role",
  sql: string,
): Promise<string | null> {
  await client.query(`set role ${role}`);
  try {
    await client.query(sql);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await client.query("reset role");
  }
}

describe("Batch B forward migration cleanup", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetThroughMigration(client, PRE_BATCH_B_MIGRATION);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("deletes a result-only draft and terminalizes its nonterminal run", async () => {
    await seedResultOnlyDraft(client);
    await applyMigration(client, BATCH_B_MIGRATION);

    const state = await client.query<{
      result_count: string;
      status: string;
      error_summary: string | null;
      stale_after: string | null;
      advance_lease_token: string | null;
      advance_lease_expires_at: string | null;
    }>(
      `select
         (select count(*) from public.recommendation_results where id = $1)::text as result_count,
         status,
         error_summary,
         stale_after::text,
         advance_lease_token::text,
         advance_lease_expires_at::text
       from public.recommendation_runs
       where id = $2`,
      [fixture.resultId, fixture.runId],
    );
    expect(state.rows).toEqual([{
      result_count: "0",
      status: "failed",
      error_summary: "PUBLICATION_GUARD_REJECTED",
      stale_after: null,
      advance_lease_token: null,
      advance_lease_expires_at: null,
    }]);
  });

  it("deletes a one-scheme draft instead of accepting a partial tree", async () => {
    await seedPolicyDraft(client, { oneScheme: true });
    await applyMigration(client, BATCH_B_MIGRATION);

    const state = await client.query<{ result_count: string; status: string; error_summary: string }>(
      `select
         (select count(*) from public.recommendation_results where id = $1)::text as result_count,
         status,
         error_summary
       from public.recommendation_runs
       where id = $2`,
      [policyFixture.resultId, policyFixture.runId],
    );
    expect(state.rows).toEqual([{
      result_count: "0",
      status: "failed",
      error_summary: "PUBLICATION_GUARD_REJECTED",
    }]);
  });

  it("deletes a complete unshared tree that no longer matches policy replay", async () => {
    await seedPolicyDraft(client, { policyInvalid: true });
    await applyMigration(client, BATCH_B_MIGRATION);

    const state = await client.query<{ result_count: string; status: string; error_summary: string }>(
      `select
         (select count(*) from public.recommendation_results where id = $1)::text as result_count,
         status,
         error_summary
       from public.recommendation_runs
       where id = $2`,
      [policyFixture.resultId, policyFixture.runId],
    );
    expect(state.rows).toEqual([{
      result_count: "0",
      status: "failed",
      error_summary: "PUBLICATION_GUARD_REJECTED",
    }]);
  });

  it("preserves a complete policy-valid unshared draft", async () => {
    await seedPolicyDraft(client);
    await applyMigration(client, BATCH_B_MIGRATION);

    const state = await client.query<{
      result_count: string;
      scheme_count: string;
      route_count: string;
      status: string;
      error_summary: string | null;
    }>(
      `select
         (select count(*) from public.recommendation_results where id = $1)::text as result_count,
         (select count(*) from public.recommendation_schemes where result_id = $1)::text as scheme_count,
         (select count(*)
          from public.recommendation_scheme_routes as route
          join public.recommendation_schemes as scheme on scheme.id = route.scheme_id
          where scheme.result_id = $1)::text as route_count,
         status,
         error_summary
       from public.recommendation_runs
       where id = $2`,
      [policyFixture.resultId, policyFixture.runId],
    );
    expect(state.rows).toEqual([{
      result_count: "1",
      scheme_count: "2",
      route_count: "4",
      status: "validating",
      error_summary: null,
    }]);
  });

  it("leaves current and superseded shared history byte-for-byte unchanged", async () => {
    await seedSharedHistory(client);
    const before = await sharedHistorySnapshot(client);

    await applyMigration(client, BATCH_B_MIGRATION);

    expect(await sharedHistorySnapshot(client)).toEqual(before);
  });

  it("denies public roles while service_role executes the three server RPC boundaries", async () => {
    await applyMigration(client, BATCH_B_MIGRATION);
    const runId = "33000000-0000-4000-8000-000000000200";
    const proposalId = "33000000-0000-4000-8000-000000000300";
    const publicCalls = [
      `select public.materialize_recommendation_result('${runId}', '${proposalId}')`,
      `select public.publish_shared_result('${runId}', '${proposalId}')`,
      `select public.confirm_alternative_result('${runId}', '${proposalId}', 'host-hash')`,
    ];

    for (const role of ["anon", "authenticated"] as const) {
      for (const sql of publicCalls) {
        await expect(callAsRole(client, role, sql)).resolves.toMatch(/permission denied/i);
      }
      await expect(callAsRole(
        client,
        role,
        `select * from private.recommendation_policy_projection('${runId}')`,
      )).resolves.toMatch(/permission denied/i);
    }

    for (const sql of publicCalls) {
      await expect(callAsRole(client, "service_role", sql)).resolves.toMatch(/run not found/i);
    }
  });
});
