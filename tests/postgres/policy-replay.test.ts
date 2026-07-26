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
