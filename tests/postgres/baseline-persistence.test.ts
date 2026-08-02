import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";

import { connectTestDatabase, resetThroughMigration } from "./database";

const migration = "202608010001_reliable_baseline_recommendation.sql";

describe("reliable baseline migration behavior", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectTestDatabase();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await resetThroughMigration(client, migration);
  });

  it("persists server-supplied coordinates atomically with the participant credential", async () => {
    await client.query(`
      insert into public.plans (id, code, title, meeting_date, participant_limit)
      values ('81000000-0000-4000-8000-000000000001', 'BASE01', '基础建议', '2026-08-15', 2)
    `);

    const created = await client.query<{ participant_id: string }>(`
      select public.create_participant_with_credential(
        'BASE01', '甲', 'amap-230200', '齐齐哈尔', 47.3543, 123.9182,
        array['flight'], 'edit-hash'
      ) as participant_id
    `);
    const stored = await client.query<{ lat: number; lng: number }>(`
      select departure_lat as lat, departure_lng as lng
      from public.participants where id = $1
    `, [created.rows[0]!.participant_id]);

    expect(stored.rows[0]).toEqual({ lat: 47.3543, lng: 123.9182 });
    await expect(client.query(`
      select public.create_participant_with_credential(
        'BASE01', '乙', 'amap-460200', '三亚', null, null,
        array['flight'], 'edit-hash-2'
      )
    `)).rejects.toThrow("INVALID_DEPARTURE_COORDINATES");
  });

  it("sets one idempotent baseline, rejects mutation, and denies browser roles", async () => {
    const planId = "81000000-0000-4000-8000-000000000011";
    const runId = "81000000-0000-4000-8000-000000000012";
    await client.query(`
      insert into public.plans (id, code, title, meeting_date, participant_limit)
      values ($1, 'BASE02', '基础建议', '2026-08-15', 2)
    `, [planId]);
    await client.query(`
      insert into public.recommendation_runs (id, plan_id, status, kind)
      values ($1, $2, 'pending', 'automatic')
    `, [runId, planId]);
    await client.query(`
      insert into public.participants
        (id, plan_id, name, departure_city_code, departure_city_name,
         departure_lat, departure_lng, accepted_modes)
      values
        ('81000000-0000-4000-8000-000000000021', $1, '甲', 'beijing', '北京', 39.9042, 116.4074, array['flight']),
        ('81000000-0000-4000-8000-000000000022', $1, '乙', 'shanghai', '上海', 31.2304, 121.4737, array['flight'])
    `, [planId]);
    await client.query(`
      insert into public.route_tasks
        (id, run_id, participant_id, city_code, origin_city_code, mode, search_date, physical_key)
      values
        ('81000000-0000-4000-8000-000000000031', $1, '81000000-0000-4000-8000-000000000021', 'wuhan', 'beijing', 'flight', '2026-08-15', 'beijing:wuhan:flight:2026-08-15'),
        ('81000000-0000-4000-8000-000000000032', $1, '81000000-0000-4000-8000-000000000022', 'wuhan', 'shanghai', 'flight', '2026-08-15', 'shanghai:wuhan:flight:2026-08-15')
    `, [runId]);
    const args = [runId, "wuhan", "武汉", "2026-08-01.baseline.v1", "canonical_coordinates_and_hubs", "a".repeat(64)];

    await client.query("select public.ensure_run_baseline($1, $2, $3, $4, $5, $6)", args);
    await client.query("select public.ensure_run_baseline($1, $2, $3, $4, $5, $6)", args);
    await expect(client.query(
      "select public.ensure_run_baseline($1, 'changsha', '长沙', $2, $3, $4)",
      [runId, args[3], args[4], args[5]],
    )).rejects.toThrow("BASELINE_RECOMMENDATION_MISMATCH");

    await client.query("select public.ensure_run_task_priorities($1, $2::jsonb)", [runId, JSON.stringify([
      { participant_id: "81000000-0000-4000-8000-000000000021", city_code: "wuhan", mode: "flight", search_date: "2026-08-15", priority: 1 },
      { participant_id: "81000000-0000-4000-8000-000000000022", city_code: "wuhan", mode: "flight", search_date: "2026-08-15", priority: 0 },
    ])]);
    const ordered = await client.query<{ participant_id: string }>(`
      select participant_id from public.route_tasks where run_id = $1 order by query_priority
    `, [runId]);
    expect(ordered.rows.map((row) => row.participant_id)).toEqual([
      "81000000-0000-4000-8000-000000000022",
      "81000000-0000-4000-8000-000000000021",
    ]);

    const privileges = await client.query<{ anon: boolean; authenticated: boolean; service: boolean; priority_anon: boolean; priority_service: boolean }>(`
      select
        has_function_privilege('anon', 'public.ensure_run_baseline(uuid,text,text,text,text,text)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.ensure_run_baseline(uuid,text,text,text,text,text)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.ensure_run_baseline(uuid,text,text,text,text,text)', 'execute') as service,
        has_function_privilege('anon', 'public.ensure_run_task_priorities(uuid,jsonb)', 'execute') as priority_anon,
        has_function_privilege('service_role', 'public.ensure_run_task_priorities(uuid,jsonb)', 'execute') as priority_service
    `);
    expect(privileges.rows[0]).toEqual({
      anon: false, authenticated: false, service: true,
      priority_anon: false, priority_service: true,
    });
  });
});
