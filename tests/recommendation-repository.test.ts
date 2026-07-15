import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { SupabaseRecommendationRepository } from "@/lib/recommendation/repository";

describe("SupabaseRecommendationRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "task-1",
        run_id: "run-1",
        participant_id: "p1",
        city_code: "wuhan",
        origin_city_code: "beijing",
        mode: "flight",
        search_date: "2026-08-14",
        physical_key: "beijing:wuhan:flight:2026-08-14",
        status: "pending",
        attempt_count: 0,
        retry_after: null,
        error_code: null,
        recommendation_runs: [{ plans: [{ meeting_date: "2026-08-15" }] }],
      },
      error: null,
    });
  });

  it("selects the persisted meeting_date and maps it to task arrivalDate", async () => {
    const task = await new SupabaseRecommendationRepository().getRouteTask("task-1");

    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("plans!inner(meeting_date)"));
    expect(mocks.select).not.toHaveBeenCalledWith(expect.stringContaining("arrival_date"));
    expect(task).toEqual(expect.objectContaining({ arrivalDate: "2026-08-15" }));
  });

  it("creates the entire run matrix through one atomic RPC", async () => {
    mocks.rpc.mockImplementation(async (_name, params) => ({
      data: {
        runId: params.p_run_id,
        taskIds: params.p_tasks.map((task: { id: string }) => task.id),
      },
      error: null,
    }));
    const result = await new SupabaseRecommendationRepository().createRunMatrix({
      planId: "plan-1",
      arrivalDate: "2026-08-15",
      candidates: [{ cityCode: "wuhan", cityName: "武汉", source: "system" }],
      tasks: [{
        participantId: "p1",
        cityCode: "wuhan",
        originCityCode: "beijing",
        mode: "flight",
        searchDate: "2026-08-14",
        arrivalDate: "2026-08-15",
        physicalKey: "beijing:wuhan:flight:2026-08-14",
      }],
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_recommendation_run_matrix",
      expect.objectContaining({ p_plan_id: "plan-1" }),
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.taskIds).toHaveLength(1);
  });

  it("surfaces atomic run matrix RPC failures", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "matrix failed" } });
    await expect(new SupabaseRecommendationRepository().createRunMatrix({
      planId: "plan-1",
      arrivalDate: "2026-08-15",
      candidates: [{ cityCode: "wuhan", cityName: "武汉", source: "system" }],
      tasks: [],
    })).rejects.toThrow("matrix failed");
  });

  it("saves a deduplicated outcome through one atomic RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const quote = {
      id: "quote-row-1",
      quoteId: `flyai:${"a".repeat(64)}`,
      providerQuoteId: null,
      participantId: "p1",
      cityCode: "wuhan",
      mode: "flight" as const,
      searchDate: "2026-08-14",
      queriedAt: "2026-07-15T10:00:00+08:00",
      priceCny: 500,
      departAt: "2026-08-14T10:00:00+08:00",
      arriveAt: "2026-08-15T00:30:00+08:00",
      durationMinutes: 870,
      transferCount: 0,
      isDirect: true,
      serviceName: "MU1234",
    };

    await new SupabaseRecommendationRepository().saveTaskOutcome("task-1", {
      status: "success",
      quotes: [quote, { ...quote }],
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_route_task_outcome",
      expect.objectContaining({
        p_task_id: "task-1",
        p_outcome: expect.any(Object),
        p_quotes: expect.any(Array),
      }),
    );
    const params = mocks.rpc.mock.calls[0]?.[1];
    expect(params.p_quotes).toHaveLength(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects failed or zero-row atomic outcome writes", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(new SupabaseRecommendationRepository().saveTaskOutcome(
      "task-1",
      { status: "empty" },
    )).rejects.toThrow("outcome");

    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "route task must be running" },
    });
    await expect(new SupabaseRecommendationRepository().saveTaskOutcome(
      "task-1",
      { status: "empty" },
    )).rejects.toThrow("route task must be running");
  });

  it("requires exactly one run status row and supports expected-status CAS", async () => {
    const statusSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const secondEq = vi.fn(() => ({ select: statusSelect }));
    const firstEq = vi.fn(() => ({ eq: secondEq, select: statusSelect }));
    const update = vi.fn(() => ({ eq: firstEq }));
    mocks.from.mockReturnValue({ update });

    await expect(new SupabaseRecommendationRepository().updateRunStatus(
      "run-1",
      "collecting",
      null,
      "pending",
    )).rejects.toThrow("exactly one");
    expect(secondEq).toHaveBeenCalledWith("status", "pending");
  });
});
