import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import {
  policyV2Fixture,
  policyV2ParityQuotes,
  policyV2ParitySavingSelection,
  policyV2Quote,
  type PolicyV2QuoteFixture,
} from "../fixtures/publication-policy-v2";
import {
  connectTestDatabase,
  resetCanonicalDatabase,
} from "./database";

async function seedRun(client: Client): Promise<void> {
  const { planId, runId, participantIds, taskIds, arrivalDate } = policyV2Fixture;
  await client.query(
    `insert into public.plans (id, code, title, meeting_date, participant_limit)
     values ($1, 'POLV2A', '政策重放', $2, 2)`,
    [planId, arrivalDate],
  );
  await client.query(
    `insert into public.participants
       (id, plan_id, name, departure_city_code, departure_city_name, accepted_modes)
     values
       ($1, $3, '甲', 'beijing', '北京', array['high_speed_rail']),
       ($2, $3, '乙', 'shanghai', '上海', array['high_speed_rail'])`,
    [participantIds[0], participantIds[1], planId],
  );
  await client.query(
    `insert into public.recommendation_runs (id, plan_id, status, policy_version)
     values ($1, $2, 'validating', '2026-07-19.v2')`,
    [runId, planId],
  );
  await client.query(
    `insert into public.route_tasks
       (id, run_id, participant_id, city_code, origin_city_code, mode,
        search_date, physical_key, status)
     values
       ($1, $3, $4, 'wuhan', 'beijing', 'high_speed_rail', $6, 'p1:wuhan:rail', 'succeeded'),
       ($2, $3, $5, 'wuhan', 'shanghai', 'high_speed_rail', $6, 'p2:wuhan:rail', 'succeeded')`,
    [taskIds[0], taskIds[1], runId, participantIds[0], participantIds[1], arrivalDate],
  );
}

async function seedCityTasks(
  client: Client,
  cityCode: string,
  taskIds: readonly [string, string],
): Promise<void> {
  const { runId, participantIds, arrivalDate } = policyV2Fixture;
  await client.query(
    `insert into public.route_tasks
       (id, run_id, participant_id, city_code, origin_city_code, mode,
        search_date, physical_key, status)
     values
       ($1, $3, $4, $6, 'beijing', 'high_speed_rail', $7, $6 || ':p1:rail', 'succeeded'),
       ($2, $3, $5, $6, 'shanghai', 'high_speed_rail', $7, $6 || ':p2:rail', 'succeeded')`,
    [taskIds[0], taskIds[1], runId, participantIds[0], participantIds[1], cityCode, arrivalDate],
  );
}

async function insertQuote(
  client: Client,
  source: PolicyV2QuoteFixture,
): Promise<void> {
  const quote = policyV2Quote(source);
  await client.query(
    `insert into public.verified_quotes
       (id, route_task_id, run_id, participant_id, city_code, quote_id,
        mode, search_date, queried_at, provider, price_cny, depart_at,
        arrive_at, duration_minutes, transfer_count, is_direct, service_name)
     values
       ($1, $2, $3, $4, $5, $6, $7, $8, '2026-07-26T10:00:00+08:00',
        'fixture', $9, $10, $11, $12, $13, $14, $15)`,
    [
      quote.id,
      quote.taskId,
      policyV2Fixture.runId,
      quote.participantId,
      quote.cityCode,
      quote.quoteId,
      quote.mode,
      quote.searchDate,
      quote.priceCny,
      quote.departAt,
      quote.arriveAt,
      quote.durationMinutes,
      quote.transferCount,
      quote.isDirect,
      quote.quoteId,
    ],
  );
}

async function insertApprovedProposal(
  client: Client,
  output: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `insert into public.recommendation_proposals
       (id, run_id, version, policy_version, status, output_json,
        validation_decision, supervisor_approved_version)
     values ($1, $2, 1, '2026-07-19.v2', 'approved', $3, '{"ok":true}', 1)`,
    [policyV2Fixture.proposalId, policyV2Fixture.runId, output],
  );
}

describe("PostgreSQL recommendation policy v2 replay", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetCanonicalDatabase(client);
    await seedRun(client);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("keeps a direct quote when a cheaper and faster transfer exists", async () => {
    for (const quote of policyV2ParityQuotes) await insertQuote(client, quote);

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_saving_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual(policyV2ParitySavingSelection.map((selection) => ({
      participant_id: selection.participantId,
      quote_id: selection.quoteId,
    })));
  });

  it("admits transfers when a participant has no direct quote", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000411",
      participantId: p1,
      taskId: t1,
      quoteId: "transfer",
      transferCount: 1,
      isDirect: false,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000412",
      participantId: p2,
      taskId: t2,
      quoteId: "fixed",
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_saving_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "transfer" },
      { participant_id: p2, quote_id: "fixed" },
    ]);
  });

  it("keeps repeated physical quote IDs participant-owned", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000413",
      participantId: p1,
      taskId: t1,
      quoteId: "shared-physical-id",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000414",
      participantId: p2,
      taskId: t2,
      quoteId: "shared-physical-id",
    });

    const result = await client.query<{
      participant_id: string;
      quote_id: string;
      verified_quote_id: string;
    }>(
      `select participant_id::text, quote_id, verified_quote_id::text
       from private.recommendation_policy_saving_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      {
        participant_id: p1,
        quote_id: "shared-physical-id",
        verified_quote_id: "00000000-0000-4000-8000-000000000413",
      },
      {
        participant_id: p2,
        quote_id: "shared-physical-id",
        verified_quote_id: "00000000-0000-4000-8000-000000000414",
      },
    ]);
  });

  it.each([
    {
      name: "fare",
      loser: { quoteId: "loser", priceCny: 101 },
      winner: { quoteId: "winner", priceCny: 100 },
    },
    {
      name: "transfer count",
      loser: { quoteId: "loser", isDirect: false, transferCount: 2 },
      winner: { quoteId: "winner", isDirect: false, transferCount: 1 },
    },
    {
      name: "duration",
      loser: { quoteId: "loser", durationMinutes: 121 },
      winner: { quoteId: "winner", durationMinutes: 120 },
    },
    {
      name: "C-collated quote ID",
      loser: { quoteId: "z-quote" },
      winner: { quoteId: "a-quote" },
    },
  ])("uses $name as the next saving tie-break", async ({ loser, winner }) => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000421",
      participantId: p1,
      taskId: t1,
      ...loser,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000422",
      participantId: p1,
      taskId: t1,
      ...winner,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000423",
      participantId: p2,
      taskId: t2,
      quoteId: "fixed",
    });

    const result = await client.query<{ quote_id: string }>(
      `select quote_id
       from private.recommendation_policy_saving_v2($1)
       where participant_id = $2`,
      [policyV2Fixture.runId, p1],
    );

    expect(result.rows).toEqual([{ quote_id: winner.quoteId }]);
  });

  it("rejects a quote bound to another participant's route task", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const [, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000431",
      participantId: p1,
      taskId: t2,
      quoteId: "cross-owned",
    });

    await expect(client.query(
      "select * from private.recommendation_policy_saving_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation evidence mismatch");
  });

  it("rejects a quote bound to another run's route task", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const otherPlanId = "00000000-0000-4000-8000-000000000110";
    const otherRunId = "00000000-0000-4000-8000-000000000210";
    const otherTaskId = "00000000-0000-4000-8000-000000000310";
    await client.query(
      `insert into public.plans (id, code, title, meeting_date, participant_limit)
       values ($1, 'POLV2B', '另一计划', $2, 2)`,
      [otherPlanId, policyV2Fixture.arrivalDate],
    );
    await client.query(
      `insert into public.recommendation_runs (id, plan_id, status, policy_version)
       values ($1, $2, 'validating', '2026-07-19.v2')`,
      [otherRunId, otherPlanId],
    );
    await client.query(
      `insert into public.route_tasks
         (id, run_id, participant_id, city_code, origin_city_code, mode,
          search_date, physical_key, status)
       values
         ($1, $2, $3, 'wuhan', 'beijing', 'high_speed_rail', $4,
          'other-run:p1:wuhan:rail', 'succeeded')`,
      [otherTaskId, otherRunId, p1, policyV2Fixture.arrivalDate],
    );
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000432",
      participantId: p1,
      taskId: otherTaskId,
      quoteId: "cross-run",
    });

    await expect(client.query(
      "select * from private.recommendation_policy_saving_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation evidence mismatch");
  });

  it("rejects a quote whose city disagrees with its route task", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const [t1] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000433",
      participantId: p1,
      taskId: t1,
      quoteId: "wrong-city",
      cityCode: "changsha",
    });

    await expect(client.query(
      "select * from private.recommendation_policy_saving_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation evidence mismatch");
  });

  it("rejects a quote whose mode disagrees with its route task", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const [t1] = policyV2Fixture.taskIds;
    await client.query(
      `update public.participants
       set accepted_modes = array['high_speed_rail', 'normal_train']
       where id = $1`,
      [p1],
    );
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000434",
      participantId: p1,
      taskId: t1,
      quoteId: "wrong-mode",
      mode: "normal_train",
    });

    await expect(client.query(
      "select * from private.recommendation_policy_saving_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation evidence mismatch");
  });

  it("rejects a mode the participant did not accept", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const [t1] = policyV2Fixture.taskIds;
    await client.query(
      "update public.route_tasks set mode = 'normal_train' where id = $1",
      [t1],
    );
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000437",
      participantId: p1,
      taskId: t1,
      quoteId: "unaccepted-mode",
      mode: "normal_train",
    });

    await expect(client.query(
      "select * from private.recommendation_policy_saving_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation evidence mismatch");
  });

  it("rejects a quote whose search date disagrees with its route task", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const [t1] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000435",
      participantId: p1,
      taskId: t1,
      quoteId: "wrong-search-date",
      searchDate: "2026-08-14",
    });

    await expect(client.query(
      "select * from private.recommendation_policy_saving_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation evidence mismatch");
  });

  it("rejects a quote arriving outside the Shanghai meeting date", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const [t1] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000436",
      participantId: p1,
      taskId: t1,
      quoteId: "wrong-arrival-date",
      arriveAt: "2026-08-16T00:01:00+08:00",
    });

    await expect(client.query(
      "select * from private.recommendation_policy_saving_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation evidence mismatch");
  });

  it("ranks a lower saving-total city first", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    const changshaTasks = [
      "00000000-0000-4000-8000-000000000321",
      "00000000-0000-4000-8000-000000000322",
    ] as const;
    await seedCityTasks(client, "changsha", changshaTasks);

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000541", participantId: p1, taskId: t1, quoteId: "wuhan-p1", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000542", participantId: p2, taskId: t2, quoteId: "wuhan-p2", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000543", participantId: p1, taskId: changshaTasks[0], quoteId: "changsha-p1", cityCode: "changsha", priceCny: 101 },
      { id: "00000000-0000-4000-8000-000000000544", participantId: p2, taskId: changshaTasks[1], quoteId: "changsha-p2", cityCode: "changsha", priceCny: 100 },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    const result = await client.query<{ city_code: string }>(
      `select city_code
       from private.recommendation_policy_projection($1)
       order by rank_position`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { city_code: "wuhan" },
      { city_code: "changsha" },
    ]);
  });

  it("ranks a city with more direct saving routes next", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const directTasks = [
      "00000000-0000-4000-8000-000000000323",
      "00000000-0000-4000-8000-000000000324",
    ] as const;
    const transferTasks = [
      "00000000-0000-4000-8000-000000000325",
      "00000000-0000-4000-8000-000000000326",
    ] as const;
    await seedCityTasks(client, "a-direct", directTasks);
    await seedCityTasks(client, "z-transfer", transferTasks);

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000545", participantId: p1, taskId: directTasks[0], quoteId: "direct-p1", cityCode: "a-direct", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000546", participantId: p2, taskId: directTasks[1], quoteId: "direct-p2", cityCode: "a-direct", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000547", participantId: p1, taskId: transferTasks[0], quoteId: "transfer-p1", cityCode: "z-transfer", priceCny: 100, isDirect: false, transferCount: 1 },
      { id: "00000000-0000-4000-8000-000000000548", participantId: p2, taskId: transferTasks[1], quoteId: "transfer-p2", cityCode: "z-transfer", priceCny: 100 },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    const result = await client.query<{ city_code: string }>(
      `select city_code
       from private.recommendation_policy_projection($1)
       order by rank_position`,
      [policyV2Fixture.runId],
    );

    expect(result.rows.map((row) => row.city_code)).toEqual([
      "a-direct",
      "z-transfer",
    ]);
  });

  it("ranks a fairer saving-fare split next", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const fairTasks = [
      "00000000-0000-4000-8000-000000000327",
      "00000000-0000-4000-8000-000000000328",
    ] as const;
    const unfairTasks = [
      "00000000-0000-4000-8000-000000000329",
      "00000000-0000-4000-8000-000000000330",
    ] as const;
    await seedCityTasks(client, "a-fair", fairTasks);
    await seedCityTasks(client, "z-unfair", unfairTasks);

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000549", participantId: p1, taskId: fairTasks[0], quoteId: "fair-p1", cityCode: "a-fair", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000550", participantId: p2, taskId: fairTasks[1], quoteId: "fair-p2", cityCode: "a-fair", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000551", participantId: p1, taskId: unfairTasks[0], quoteId: "unfair-p1", cityCode: "z-unfair", priceCny: 80 },
      { id: "00000000-0000-4000-8000-000000000552", participantId: p2, taskId: unfairTasks[1], quoteId: "unfair-p2", cityCode: "z-unfair", priceCny: 120 },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    const result = await client.query<{ city_code: string }>(
      `select city_code
       from private.recommendation_policy_projection($1)
       order by rank_position`,
      [policyV2Fixture.runId],
    );

    expect(result.rows.map((row) => row.city_code)).toEqual([
      "a-fair",
      "z-unfair",
    ]);
  });

  it("ranks a shorter saving team duration next", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const shortTasks = [
      "00000000-0000-4000-8000-000000000331",
      "00000000-0000-4000-8000-000000000332",
    ] as const;
    const longTasks = [
      "00000000-0000-4000-8000-000000000333",
      "00000000-0000-4000-8000-000000000334",
    ] as const;
    await seedCityTasks(client, "a-short", shortTasks);
    await seedCityTasks(client, "z-long", longTasks);

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000553", participantId: p1, taskId: shortTasks[0], quoteId: "short-p1", cityCode: "a-short", durationMinutes: 100 },
      { id: "00000000-0000-4000-8000-000000000554", participantId: p2, taskId: shortTasks[1], quoteId: "short-p2", cityCode: "a-short", durationMinutes: 100 },
      { id: "00000000-0000-4000-8000-000000000555", participantId: p1, taskId: longTasks[0], quoteId: "long-p1", cityCode: "z-long", durationMinutes: 101 },
      { id: "00000000-0000-4000-8000-000000000556", participantId: p2, taskId: longTasks[1], quoteId: "long-p2", cityCode: "z-long", durationMinutes: 100 },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    const result = await client.query<{ city_code: string }>(
      `select city_code
       from private.recommendation_policy_projection($1)
       order by rank_position`,
      [policyV2Fixture.runId],
    );

    expect(result.rows.map((row) => row.city_code)).toEqual([
      "a-short",
      "z-long",
    ]);
  });

  it("uses C-collated city code as the final ranking key", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const aTasks = [
      "00000000-0000-4000-8000-000000000335",
      "00000000-0000-4000-8000-000000000336",
    ] as const;
    const zTasks = [
      "00000000-0000-4000-8000-000000000337",
      "00000000-0000-4000-8000-000000000338",
    ] as const;
    await seedCityTasks(client, "a-code", aTasks);
    await seedCityTasks(client, "z-code", zTasks);

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000557", participantId: p1, taskId: aTasks[0], quoteId: "a-p1", cityCode: "a-code" },
      { id: "00000000-0000-4000-8000-000000000558", participantId: p2, taskId: aTasks[1], quoteId: "a-p2", cityCode: "a-code" },
      { id: "00000000-0000-4000-8000-000000000559", participantId: p1, taskId: zTasks[0], quoteId: "z-p1", cityCode: "z-code" },
      { id: "00000000-0000-4000-8000-000000000560", participantId: p2, taskId: zTasks[1], quoteId: "z-p2", cityCode: "z-code" },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    const result = await client.query<{ city_code: string }>(
      `select city_code
       from private.recommendation_policy_projection($1)
       order by rank_position`,
      [policyV2Fixture.runId],
    );

    expect(result.rows.map((row) => row.city_code)).toEqual([
      "a-code",
      "z-code",
    ]);
  });

  it("rejects an automatic proposal whose city is not the ranked winner", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000561",
      participantId: p1,
      taskId: t1,
      quoteId: "automatic-p1",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000562",
      participantId: p2,
      taskId: t2,
      quoteId: "automatic-p2",
    });
    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "changsha",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "automatic-p1", [p2]: "automatic-p2" },
          totalFareCny: 200,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "automatic-p1", [p2]: "automatic-p2" },
          totalFareCny: 200,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["wuhan"],
        orderedCityCodes: ["wuhan"],
      },
      explanationZh: "按真实路线选择。",
    });

    await expect(client.query(
      "select * from private.assert_recommendation_proposal($1, $2)",
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    )).rejects.toThrow("proposal does not match recommendation policy");
  });

  it("accepts the exact unique C-sorted eligible city codes", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    const secondTasks = [
      "00000000-0000-4000-8000-000000000339",
      "00000000-0000-4000-8000-000000000340",
    ] as const;
    await seedCityTasks(client, "a-second", secondTasks);

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000563", participantId: p1, taskId: t1, quoteId: "winner-p1" },
      { id: "00000000-0000-4000-8000-000000000564", participantId: p2, taskId: t2, quoteId: "winner-p2" },
      { id: "00000000-0000-4000-8000-000000000565", participantId: p1, taskId: secondTasks[0], quoteId: "second-p1", cityCode: "a-second", priceCny: 101 },
      { id: "00000000-0000-4000-8000-000000000566", participantId: p2, taskId: secondTasks[1], quoteId: "second-p2", cityCode: "a-second", priceCny: 101 },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "winner-p1", [p2]: "winner-p2" },
          totalFareCny: 200,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "winner-p1", [p2]: "winner-p2" },
          totalFareCny: 200,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["a-second", "wuhan"],
        orderedCityCodes: ["wuhan", "a-second"],
      },
      explanationZh: "按真实路线选择。",
    });

    const result = await client.query<{ city_code: string }>(
      "select city_code from private.assert_recommendation_proposal($1, $2)",
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    );

    expect(result.rows).toEqual([{ city_code: "wuhan" }]);
  });

  it("rejects ordered city codes that do not match the five-key ranking", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    const secondTasks = [
      "00000000-0000-4000-8000-000000000339",
      "00000000-0000-4000-8000-000000000340",
    ] as const;
    await seedCityTasks(client, "a-second", secondTasks);

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000563", participantId: p1, taskId: t1, quoteId: "winner-p1" },
      { id: "00000000-0000-4000-8000-000000000564", participantId: p2, taskId: t2, quoteId: "winner-p2" },
      { id: "00000000-0000-4000-8000-000000000565", participantId: p1, taskId: secondTasks[0], quoteId: "second-p1", cityCode: "a-second", priceCny: 101 },
      { id: "00000000-0000-4000-8000-000000000566", participantId: p2, taskId: secondTasks[1], quoteId: "second-p2", cityCode: "a-second", priceCny: 101 },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "winner-p1", [p2]: "winner-p2" },
          totalFareCny: 200,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "winner-p1", [p2]: "winner-p2" },
          totalFareCny: 200,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["a-second", "wuhan"],
        orderedCityCodes: ["a-second", "wuhan"],
      },
      explanationZh: "按真实路线选择。",
    });

    await expect(client.query(
      "select * from private.assert_recommendation_proposal($1, $2)",
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    )).rejects.toThrow("proposal does not match recommendation policy");
  });

  it("returns exact saving and fast mappings with database-derived aggregates", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    const quoteIds = {
      savingP1: "00000000-0000-4000-8000-000000000567",
      savingP2: "00000000-0000-4000-8000-000000000568",
      fastP1: "00000000-0000-4000-8000-000000000569",
      fastP2: "00000000-0000-4000-8000-000000000570",
    } as const;

    for (const quote of [
      { id: quoteIds.savingP1, participantId: p1, taskId: t1, quoteId: "saving-p1", priceCny: 100, durationMinutes: 200, arriveAt: "2026-08-15T11:00:00+08:00" },
      { id: quoteIds.savingP2, participantId: p2, taskId: t2, quoteId: "saving-p2", priceCny: 100, durationMinutes: 200, arriveAt: "2026-08-15T12:00:00+08:00" },
      { id: quoteIds.fastP1, participantId: p1, taskId: t1, quoteId: "fast-p1", priceCny: 130, durationMinutes: 50, arriveAt: "2026-08-15T10:00:00+08:00" },
      { id: quoteIds.fastP2, participantId: p2, taskId: t2, quoteId: "fast-p2", priceCny: 130, durationMinutes: 50, arriveAt: "2026-08-15T10:30:00+08:00" },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "saving-p1", [p2]: "saving-p2" },
          totalFareCny: 200,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "fast-p1", [p2]: "fast-p2" },
          totalFareCny: 260,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["wuhan"],
        orderedCityCodes: ["wuhan"],
      },
      explanationZh: "按真实路线选择。",
    });

    const result = await client.query<{
      saving_total_fare: number;
      saving_total_duration: number;
      saving_quote_ids: Record<string, string>;
      saving_verified_quote_ids: Record<string, string>;
      fast_total_fare: number;
      fast_total_duration: number;
      fast_quote_ids: Record<string, string>;
      fast_verified_quote_ids: Record<string, string>;
    }>(
      `select saving_total_fare, saving_total_duration,
              saving_quote_ids, saving_verified_quote_ids,
              fast_total_fare, fast_total_duration,
              fast_quote_ids, fast_verified_quote_ids
       from private.assert_recommendation_proposal($1, $2)`,
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    );

    expect(result.rows).toEqual([{
      saving_total_fare: 200,
      saving_total_duration: 400,
      saving_quote_ids: { [p1]: "saving-p1", [p2]: "saving-p2" },
      saving_verified_quote_ids: { [p1]: quoteIds.savingP1, [p2]: quoteIds.savingP2 },
      fast_total_fare: 260,
      fast_total_duration: 100,
      fast_quote_ids: { [p1]: "fast-p1", [p2]: "fast-p2" },
      fast_verified_quote_ids: { [p1]: quoteIds.fastP1, [p2]: quoteIds.fastP2 },
    }]);
  });

  it("rejects a proposal with a noncanonical physical quote mapping", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000571",
      participantId: p1,
      taskId: t1,
      quoteId: "canonical-p1",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000572",
      participantId: p2,
      taskId: t2,
      quoteId: "canonical-p2",
    });
    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "canonical-p2", [p2]: "canonical-p1" },
          totalFareCny: 200,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "canonical-p1", [p2]: "canonical-p2" },
          totalFareCny: 200,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["wuhan"],
        orderedCityCodes: ["wuhan"],
      },
      explanationZh: "按真实路线选择。",
    });

    await expect(client.query(
      "select * from private.assert_recommendation_proposal($1, $2)",
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    )).rejects.toThrow("proposal does not match recommendation policy");
  });

  it("rejects proposal fare totals that differ from policy replay", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000573",
      participantId: p1,
      taskId: t1,
      quoteId: "total-p1",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000574",
      participantId: p2,
      taskId: t2,
      quoteId: "total-p2",
    });
    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "total-p1", [p2]: "total-p2" },
          totalFareCny: 201,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "total-p1", [p2]: "total-p2" },
          totalFareCny: 200,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["wuhan"],
        orderedCityCodes: ["wuhan"],
      },
      explanationZh: "按真实路线选择。",
    });

    await expect(client.query(
      "select * from private.assert_recommendation_proposal($1, $2)",
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    )).rejects.toThrow("proposal does not match recommendation policy");
  });

  it("accepts an alternative requested city that is not the automatic winner", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    const alternativeTasks = [
      "00000000-0000-4000-8000-000000000341",
      "00000000-0000-4000-8000-000000000342",
    ] as const;
    await seedCityTasks(client, "changsha", alternativeTasks);
    await client.query(
      `update public.recommendation_runs
       set kind = 'alternative', requested_city_code = 'changsha',
           requested_by_participant_id = $2
       where id = $1`,
      [policyV2Fixture.runId, p1],
    );

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000575", participantId: p1, taskId: t1, quoteId: "winner-p1", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000576", participantId: p2, taskId: t2, quoteId: "winner-p2", priceCny: 100 },
      { id: "00000000-0000-4000-8000-000000000577", participantId: p1, taskId: alternativeTasks[0], quoteId: "alternative-p1", cityCode: "changsha", priceCny: 101 },
      { id: "00000000-0000-4000-8000-000000000578", participantId: p2, taskId: alternativeTasks[1], quoteId: "alternative-p2", cityCode: "changsha", priceCny: 101 },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "changsha",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "alternative-p1", [p2]: "alternative-p2" },
          totalFareCny: 202,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "alternative-p1", [p2]: "alternative-p2" },
          totalFareCny: 202,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["changsha", "wuhan"],
        orderedCityCodes: ["wuhan", "changsha"],
      },
      explanationZh: "按真实路线选择。",
    });

    const result = await client.query<{ city_code: string }>(
      "select city_code from private.assert_recommendation_proposal($1, $2)",
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    );

    expect(result.rows).toEqual([{ city_code: "changsha" }]);
  });

  it("rejects an alternative proposal for a city other than the requested city", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    const alternativeTasks = [
      "00000000-0000-4000-8000-000000000343",
      "00000000-0000-4000-8000-000000000344",
    ] as const;
    await seedCityTasks(client, "changsha", alternativeTasks);
    await client.query(
      `update public.recommendation_runs
       set kind = 'alternative', requested_city_code = 'changsha',
           requested_by_participant_id = $2
       where id = $1`,
      [policyV2Fixture.runId, p1],
    );

    for (const quote of [
      { id: "00000000-0000-4000-8000-000000000579", participantId: p1, taskId: t1, quoteId: "wuhan-p1" },
      { id: "00000000-0000-4000-8000-000000000580", participantId: p2, taskId: t2, quoteId: "wuhan-p2" },
      { id: "00000000-0000-4000-8000-000000000581", participantId: p1, taskId: alternativeTasks[0], quoteId: "changsha-p1", cityCode: "changsha" },
      { id: "00000000-0000-4000-8000-000000000582", participantId: p2, taskId: alternativeTasks[1], quoteId: "changsha-p2", cityCode: "changsha" },
    ] satisfies PolicyV2QuoteFixture[]) await insertQuote(client, quote);

    await insertApprovedProposal(client, {
      status: "proposal",
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving",
          quoteIdsByParticipant: { [p1]: "wuhan-p1", [p2]: "wuhan-p2" },
          totalFareCny: 200,
        },
        {
          kind: "fast",
          quoteIdsByParticipant: { [p1]: "wuhan-p1", [p2]: "wuhan-p2" },
          totalFareCny: 200,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["changsha", "wuhan"],
        orderedCityCodes: ["changsha", "wuhan"],
      },
      explanationZh: "按真实路线选择。",
    });

    await expect(client.query(
      "select * from private.assert_recommendation_proposal($1, $2)",
      [policyV2Fixture.runId, policyV2Fixture.proposalId],
    )).rejects.toThrow("proposal does not match recommendation policy");
  });

  it("fails closed for an unknown recommendation policy version", async () => {
    await client.query(
      `update public.recommendation_runs
       set policy_version = '2099-01-01.v1'
       where id = $1`,
      [policyV2Fixture.runId],
    );

    await expect(client.query(
      "select * from private.recommendation_policy_projection($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("unsupported recommendation policy");
  });

  it("selects the fastest team combination at exactly 130 percent of saving", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000441",
      participantId: p1,
      taskId: t1,
      quoteId: "p1-saving",
      priceCny: 100,
      durationMinutes: 200,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000442",
      participantId: p1,
      taskId: t1,
      quoteId: "p1-fast",
      priceCny: 130,
      durationMinutes: 50,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000443",
      participantId: p2,
      taskId: t2,
      quoteId: "p2-saving",
      priceCny: 100,
      durationMinutes: 200,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000444",
      participantId: p2,
      taskId: t2,
      quoteId: "p2-fast",
      priceCny: 130,
      durationMinutes: 50,
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "p1-fast" },
      { participant_id: p2, quote_id: "p2-fast" },
    ]);
  });

  it("rejects a fast combination above 130 percent of saving", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000451",
      participantId: p1,
      taskId: t1,
      quoteId: "p1-saving",
      priceCny: 100,
      durationMinutes: 200,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000452",
      participantId: p1,
      taskId: t1,
      quoteId: "p1-too-expensive",
      priceCny: 161,
      durationMinutes: 50,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000453",
      participantId: p2,
      taskId: t2,
      quoteId: "p2-saving",
      priceCny: 100,
      durationMinutes: 200,
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "p1-saving" },
      { participant_id: p2, quote_id: "p2-saving" },
    ]);
  });

  it("minimizes total duration before later fast tie-breaks", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000461",
      participantId: p1,
      taskId: t1,
      quoteId: "p1-saving",
      priceCny: 100,
      durationMinutes: 200,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000462",
      participantId: p1,
      taskId: t1,
      quoteId: "p1-short",
      priceCny: 120,
      durationMinutes: 60,
      arriveAt: "2026-08-15T12:00:00+08:00",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000463",
      participantId: p2,
      taskId: t2,
      quoteId: "p2-saving",
      priceCny: 100,
      durationMinutes: 200,
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "p1-short" },
      { participant_id: p2, quote_id: "p2-saving" },
    ]);
  });

  it("compares latest arrival as an instant across UTC offsets", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000471",
      participantId: p1,
      taskId: t1,
      quoteId: "a-later",
      arriveAt: "2026-08-15T10:30:00+08:00",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000472",
      participantId: p1,
      taskId: t1,
      quoteId: "z-earlier",
      arriveAt: "2026-08-15T03:00:00+01:00",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000473",
      participantId: p2,
      taskId: t2,
      quoteId: "fixed",
      arriveAt: "2026-08-15T09:00:00+08:00",
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "z-earlier" },
      { participant_id: p2, quote_id: "fixed" },
    ]);
  });

  it("minimizes team transfers after duration and arrival", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000481",
      participantId: p1,
      taskId: t1,
      quoteId: "a-more-transfers",
      isDirect: false,
      transferCount: 2,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000482",
      participantId: p1,
      taskId: t1,
      quoteId: "z-fewer-transfers",
      isDirect: false,
      transferCount: 1,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000483",
      participantId: p2,
      taskId: t2,
      quoteId: "fixed",
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "z-fewer-transfers" },
      { participant_id: p2, quote_id: "fixed" },
    ]);
  });

  it("minimizes team fare after transfers", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000491",
      participantId: p1,
      taskId: t1,
      quoteId: "a-higher-fare",
      priceCny: 110,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000492",
      participantId: p1,
      taskId: t1,
      quoteId: "z-lower-fare",
      priceCny: 100,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000493",
      participantId: p2,
      taskId: t2,
      quoteId: "fixed",
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "z-lower-fare" },
      { participant_id: p2, quote_id: "fixed" },
    ]);
  });

  it("uses the participant-ordered C-collated quote tuple last", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000501",
      participantId: p1,
      taskId: t1,
      quoteId: "z-quote",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000502",
      participantId: p1,
      taskId: t1,
      quoteId: "A-quote",
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000503",
      participantId: p2,
      taskId: t2,
      quoteId: "fixed",
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "A-quote" },
      { participant_id: p2, quote_id: "fixed" },
    ]);
  });

  it("applies direct-first before searching fast combinations", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000511",
      participantId: p1,
      taskId: t1,
      quoteId: "direct",
      priceCny: 200,
      durationMinutes: 200,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000512",
      participantId: p1,
      taskId: t1,
      quoteId: "transfer",
      priceCny: 50,
      durationMinutes: 50,
      isDirect: false,
      transferCount: 1,
    });
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000513",
      participantId: p2,
      taskId: t2,
      quoteId: "fixed",
      priceCny: 100,
      durationMinutes: 100,
    });

    const result = await client.query<{ participant_id: string; quote_id: string }>(
      `select participant_id::text, quote_id
       from private.recommendation_policy_fast_v2($1)
       order by participant_id`,
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([
      { participant_id: p1, quote_id: "direct" },
      { participant_id: p2, quote_id: "fixed" },
    ]);
  });

  it("returns no partial fast selection without full participant coverage", async () => {
    const [p1] = policyV2Fixture.participantIds;
    const [t1] = policyV2Fixture.taskIds;
    await insertQuote(client, {
      id: "00000000-0000-4000-8000-000000000521",
      participantId: p1,
      taskId: t1,
      quoteId: "only-participant",
    });

    const result = await client.query(
      "select * from private.recommendation_policy_fast_v2($1)",
      [policyV2Fixture.runId],
    );

    expect(result.rows).toEqual([]);
  });

  it("rejects more than 50000 retained fast states", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await client.query(
      `insert into public.verified_quotes
         (id, route_task_id, run_id, participant_id, city_code, quote_id,
          mode, search_date, queried_at, provider, price_cny, depart_at,
          arrive_at, duration_minutes, transfer_count, is_direct, service_name)
       select
         md5(prefix || series.index::text)::uuid,
         task_id,
         $1,
         participant_id,
         'wuhan',
         prefix || series.index::text,
         'high_speed_rail',
         $6,
         '2026-07-26T10:00:00+08:00',
         'fixture',
         base_price + series.index * price_step,
         '2026-08-15T08:00:00+08:00',
         '2026-08-15T10:00:00+08:00',
         120,
         0,
         true,
         prefix || series.index::text
       from (values
         ($2::uuid, $4::uuid, 'state-p1-', 1000000, 1),
         ($3::uuid, $5::uuid, 'state-p2-', 1000000, 256)
       ) as source(participant_id, task_id, prefix, base_price, price_step)
       cross join generate_series(0, 255) as series(index)`,
      [policyV2Fixture.runId, p1, p2, t1, t2, policyV2Fixture.arrivalDate],
    );

    await expect(client.query(
      "select * from private.recommendation_policy_fast_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation policy state budget exceeded");
  });

  it("rejects more than 200000 examined fast transitions", async () => {
    const [p1, p2] = policyV2Fixture.participantIds;
    const [t1, t2] = policyV2Fixture.taskIds;
    await client.query(
      `insert into public.verified_quotes
         (id, route_task_id, run_id, participant_id, city_code, quote_id,
          mode, search_date, queried_at, provider, price_cny, depart_at,
          arrive_at, duration_minutes, transfer_count, is_direct, service_name)
       select
         md5(prefix || series.index::text)::uuid,
         task_id,
         $1,
         participant_id,
         'wuhan',
         prefix || series.index::text,
         'high_speed_rail',
         $6,
         '2026-07-26T10:00:00+08:00',
         'fixture',
         base_price + series.index * price_step,
         '2026-08-15T08:00:00+08:00',
         '2026-08-15T10:00:00+08:00',
         120,
         0,
         true,
         prefix || series.index::text
       from (values
         ($2::uuid, $4::uuid, 'transition-p1-', 1000000, 1),
         ($3::uuid, $5::uuid, 'transition-p2-', 1000000, 0)
       ) as source(participant_id, task_id, prefix, base_price, price_step)
       cross join generate_series(0, 500) as series(index)`,
      [policyV2Fixture.runId, p1, p2, t1, t2, policyV2Fixture.arrivalDate],
    );

    await expect(client.query(
      "select * from private.recommendation_policy_fast_v2($1)",
      [policyV2Fixture.runId],
    )).rejects.toThrow("recommendation policy transition budget exceeded");
  });
});
