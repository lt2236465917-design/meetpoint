import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import {
  connectTestDatabase,
  resetCanonicalDatabase,
} from "./database";

const fixture = {
  planId: "20000000-0000-4000-8000-000000000100",
  runId: "20000000-0000-4000-8000-000000000200",
  proposalId: "20000000-0000-4000-8000-000000000300",
  participantIds: [
    "20000000-0000-4000-8000-000000000101",
    "20000000-0000-4000-8000-000000000102",
  ] as const,
  taskIds: [
    "20000000-0000-4000-8000-000000000201",
    "20000000-0000-4000-8000-000000000202",
  ] as const,
  quoteRowIds: [
    "20000000-0000-4000-8000-000000000401",
    "20000000-0000-4000-8000-000000000402",
  ] as const,
} as const;

async function seedAutomaticRun(client: Client): Promise<void> {
  const [p1, p2] = fixture.participantIds;
  const [t1, t2] = fixture.taskIds;
  const [q1, q2] = fixture.quoteRowIds;

  await client.query(
    `insert into public.plans (id, code, title, meeting_date, participant_limit)
     values ($1, 'PUBV2A', '发布复核', '2026-08-15', 2)`,
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
       ($1, $3, $5, $6, 'wuhan', 'p1-original', 'high_speed_rail', '2026-08-15',
        '2026-07-26T10:00:00+08:00', 'fixture', 100,
        '2026-08-15T08:00:00+08:00', '2026-08-15T10:00:00+08:00', 120, 0, true, 'G1'),
       ($2, $4, $5, $7, 'wuhan', 'p2-original', 'high_speed_rail', '2026-08-15',
        '2026-07-26T10:00:00+08:00', 'fixture', 120,
        '2026-08-15T09:00:00+08:00', '2026-08-15T12:00:00+08:00', 180, 0, true, 'G2')`,
    [q1, q2, t1, t2, fixture.runId, p1, p2],
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
}

describe("automatic recommendation publication", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetCanonicalDatabase(client);
    await seedAutomaticRun(client);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("rejects automatic publication when new evidence changes policy after materialization", async () => {
    await client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    );
    await client.query(
      `insert into public.verified_quotes
         (id, route_task_id, run_id, participant_id, city_code, quote_id,
          mode, search_date, queried_at, provider, price_cny, depart_at,
          arrive_at, duration_minutes, transfer_count, is_direct, service_name)
       values
         ('20000000-0000-4000-8000-000000000403', $1, $2, $3, 'wuhan',
          'p1-new-saving', 'high_speed_rail', '2026-08-15',
          '2026-07-26T10:05:00+08:00', 'fixture', 90,
          '2026-08-15T08:00:00+08:00', '2026-08-15T10:00:00+08:00',
          120, 0, true, 'G3')`,
      [fixture.taskIds[0], fixture.runId, fixture.participantIds[0]],
    );

    await expect(client.query(
      "select public.publish_shared_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow();

    const state = await client.query<{
      is_shared: boolean;
      status: string;
      current_shared_count: string;
    }>(
      `select result.is_shared, run.status,
              (select count(*)
               from public.recommendation_results as current_result
               where current_result.plan_id = $1
                 and current_result.is_shared
                 and current_result.superseded_at is null)::text as current_shared_count
       from public.recommendation_results as result
       join public.recommendation_runs as run on run.id = result.run_id
       where result.run_id = $2`,
      [fixture.planId, fixture.runId],
    );
    expect(state.rows).toEqual([{
      is_shared: false,
      status: "validating",
      current_shared_count: "0",
    }]);
  });

  it("rejects automatic publication when the proposal changes after materialization", async () => {
    await client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    );
    await client.query(
      `update public.recommendation_proposals
       set output_json = jsonb_set(
         output_json,
         '{schemes,0,totalFareCny}',
         '221'::jsonb
       )
       where id = $1`,
      [fixture.proposalId],
    );

    await expect(client.query(
      "select public.publish_shared_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    )).rejects.toThrow();

    const state = await client.query<{
      is_shared: boolean;
      status: string;
    }>(
      `select result.is_shared, run.status
       from public.recommendation_results as result
       join public.recommendation_runs as run on run.id = result.run_id
       where result.run_id = $1`,
      [fixture.runId],
    );
    expect(state.rows).toEqual([{ is_shared: false, status: "validating" }]);
  });

  it("publishes a policy-valid automatic result and completes its run", async () => {
    const materialized = await client.query<{ result_id: string }>(
      `select public.materialize_recommendation_result($1, $2)::text as result_id`,
      [fixture.runId, fixture.proposalId],
    );
    const published = await client.query<{ result_id: string }>(
      `select public.publish_shared_result($1, $2)::text as result_id`,
      [fixture.runId, fixture.proposalId],
    );

    expect(published.rows[0]?.result_id).toBe(materialized.rows[0]?.result_id);
    const state = await client.query<{
      is_shared: boolean;
      published: boolean;
      status: string;
      completed: boolean;
    }>(
      `select result.is_shared,
              result.published_at is not null as published,
              run.status,
              run.completed_at is not null as completed
       from public.recommendation_results as result
       join public.recommendation_runs as run on run.id = result.run_id
       where result.run_id = $1`,
      [fixture.runId],
    );
    expect(state.rows).toEqual([{
      is_shared: true,
      published: true,
      status: "completed",
      completed: true,
    }]);
  });

  it("allows only one concurrent automatic publication", async () => {
    await client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    );
    const secondClient = await connectTestDatabase();
    try {
      const attempts = await Promise.allSettled([
        client.query(
          "select public.publish_shared_result($1, $2)",
          [fixture.runId, fixture.proposalId],
        ),
        secondClient.query(
          "select public.publish_shared_result($1, $2)",
          [fixture.runId, fixture.proposalId],
        ),
      ]);

      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    } finally {
      await secondClient.end();
    }

    const state = await client.query<{
      current_shared_count: string;
      completed_run_count: string;
    }>(
      `select
         (select count(*)
          from public.recommendation_results
          where plan_id = $1
            and is_shared
            and superseded_at is null)::text as current_shared_count,
         (select count(*)
          from public.recommendation_runs
          where id = $2 and status = 'completed')::text as completed_run_count`,
      [fixture.planId, fixture.runId],
    );
    expect(state.rows).toEqual([{
      current_shared_count: "1",
      completed_run_count: "1",
    }]);
  });

  it.each(["anon", "authenticated"])(
    "denies automatic publication to the %s role",
    async (role) => {
      await client.query(
        "select public.materialize_recommendation_result($1, $2)",
        [fixture.runId, fixture.proposalId],
      );
      await client.query(`set role ${role}`);
      try {
        await expect(client.query(
          "select public.publish_shared_result($1, $2)",
          [fixture.runId, fixture.proposalId],
        )).rejects.toThrow("permission denied");
      } finally {
        await client.query("reset role");
      }
    },
  );

  it("allows service_role to publish a policy-valid automatic result", async () => {
    await client.query(
      "select public.materialize_recommendation_result($1, $2)",
      [fixture.runId, fixture.proposalId],
    );
    await client.query("set role service_role");
    try {
      const published = await client.query<{ result_id: string }>(
        `select public.publish_shared_result($1, $2)::text as result_id`,
        [fixture.runId, fixture.proposalId],
      );
      expect(published.rows[0]?.result_id).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await client.query("reset role");
    }
  });
});
