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

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RUN_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const createRunInput = {
  planId: "plan-1",
  arrivalDate: "2026-08-15",
  candidates: [{ cityCode: "wuhan", cityName: "武汉", source: "system" as const }],
  tasks: [{
    participantId: "p1",
    cityCode: "wuhan",
    originCityCode: "beijing",
    mode: "flight" as const,
    searchDate: "2026-08-14",
    arrivalDate: "2026-08-15",
    physicalKey: "beijing:wuhan:flight:2026-08-14",
  }],
};

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
        participants: [{ departure_city_name: "北京" }],
      },
      error: null,
    });
  });

  it("selects the persisted meeting_date and maps it to task arrivalDate", async () => {
    const task = await new SupabaseRecommendationRepository().getRouteTask("task-1");

    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("plans!inner(meeting_date)"));
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("participants!inner(departure_city_name)"));
    expect(mocks.select).not.toHaveBeenCalledWith(expect.stringContaining("arrival_date"));
    expect(task).toEqual(expect.objectContaining({
      arrivalDate: "2026-08-15",
      originCityName: "北京",
    }));
  });

  it("creates the entire run matrix through one atomic RPC", async () => {
    mocks.rpc.mockImplementation(async (_name, params) => ({
      data: {
        disposition: "created",
        runId: params.p_run_id,
        status: "pending",
        taskIds: params.p_tasks.map((task: { id: string }) => task.id),
      },
      error: null,
    }));
    const result = await new SupabaseRecommendationRepository().createRunMatrix(createRunInput);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_recommendation_run_matrix",
      expect.objectContaining({ p_plan_id: "plan-1" }),
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result).toMatchObject({ disposition: "created", status: "pending" });
    expect(result.taskIds).toHaveLength(1);
  });

  it("returns an existing compatible active run unchanged", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        disposition: "resume_existing",
        runId: RUN_ID,
        status: "collecting",
        taskIds: [],
      },
      error: null,
    });

    await expect(new SupabaseRecommendationRepository().createRunMatrix(createRunInput))
      .resolves.toMatchObject({
        disposition: "resume_existing",
        runId: RUN_ID,
        status: "collecting",
        taskIds: [],
      });
  });

  it("throws a typed rejection for a valid rejected outcome", async () => {
    mocks.rpc.mockResolvedValue({
      data: { disposition: "rejected", code: "SHARED_RESULT_EXISTS" },
      error: null,
    });

    await expect(new SupabaseRecommendationRepository().createRunMatrix(createRunInput))
      .rejects.toMatchObject({
        name: "RunCreationError",
        code: "SHARED_RESULT_EXISTS",
      });
  });

  it.each([
    { disposition: "resume_existing", runId: RUN_ID, status: "collecting", taskIds: [TASK_ID] },
    { disposition: "resume_existing", runId: RUN_ID, status: "completed", taskIds: [] },
    { disposition: "rejected", code: "UNKNOWN_CODE" },
  ])("rejects malformed run creation RPC data: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(new SupabaseRecommendationRepository().createRunMatrix(createRunInput))
      .rejects.toThrow("invalid RPC result");
  });

  it("rejects a created status other than pending", async () => {
    mocks.rpc.mockImplementation(async (_name, params) => ({
      data: {
        disposition: "created",
        runId: params.p_run_id,
        status: "collecting",
        taskIds: params.p_tasks.map((task: { id: string }) => task.id),
      },
      error: null,
    }));

    await expect(new SupabaseRecommendationRepository().createRunMatrix(createRunInput))
      .rejects.toThrow("invalid RPC result");
  });

  it("rejects a created run ID that differs from the requested ID", async () => {
    mocks.rpc.mockImplementation(async (_name, params) => ({
      data: {
        disposition: "created",
        runId: OTHER_RUN_ID,
        status: "pending",
        taskIds: params.p_tasks.map((task: { id: string }) => task.id),
      },
      error: null,
    }));

    await expect(new SupabaseRecommendationRepository().createRunMatrix(createRunInput))
      .rejects.toThrow("invalid RPC result");
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

  it.each([
    ["2026-08-01T00:15:00.000Z", "2026-08-01T00:15:00.000Z"],
    [null, null],
  ])("loads a string or null stale deadline", async (storedValue, expectedValue) => {
    const runMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: RUN_ID,
        plan_id: "plan-1",
        status: "collecting",
        trace_id: OTHER_RUN_ID,
        retry_after: null,
        stale_after: storedValue,
        error_summary: null,
        policy_version: "2026-07-19.v2",
        kind: "automatic",
        plans: [{ meeting_date: "2026-08-15" }],
      },
      error: null,
    });
    const runEq = vi.fn().mockReturnValue({ maybeSingle: runMaybeSingle });
    const runSelect = vi.fn().mockReturnValue({ eq: runEq });
    const participantOrder = vi.fn().mockResolvedValue({ data: [{ id: "p1" }], error: null });
    const participantEq = vi.fn().mockReturnValue({ order: participantOrder });
    const participantSelect = vi.fn().mockReturnValue({ eq: participantEq });
    mocks.from.mockImplementation((table: string) => table === "recommendation_runs"
      ? { select: runSelect }
      : { select: participantSelect });

    await expect(new SupabaseRecommendationRepository().getRun(RUN_ID))
      .resolves.toMatchObject({ staleAfter: expectedValue });
    expect(runSelect).toHaveBeenCalledWith(expect.stringContaining("stale_after"));
  });

  it("rejects a non-string, non-null stale deadline", async () => {
    const runMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: RUN_ID,
        plan_id: "plan-1",
        status: "collecting",
        trace_id: OTHER_RUN_ID,
        retry_after: null,
        stale_after: 123,
        error_summary: null,
        policy_version: "2026-07-19.v2",
        kind: "automatic",
        plans: [{ meeting_date: "2026-08-15" }],
      },
      error: null,
    });
    const runEq = vi.fn().mockReturnValue({ maybeSingle: runMaybeSingle });
    const runSelect = vi.fn().mockReturnValue({ eq: runEq });
    mocks.from.mockReturnValue({ select: runSelect });

    await expect(new SupabaseRecommendationRepository().getRun(RUN_ID))
      .rejects.toThrow("Invalid recommendation run record");
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

  it("terminalizes exhausted route recovery through one atomic RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(new SupabaseRecommendationRepository().markTaskRecoveryExhausted(
      TASK_ID,
      "PROVIDER_TIMEOUT",
      "2026-08-01T00:15:00.000Z",
    )).resolves.toBe(true);

    expect(mocks.rpc).toHaveBeenCalledWith("terminalize_route_task_recovery", {
      p_task_id: TASK_ID,
      p_error_code: "PROVIDER_TIMEOUT",
      p_stale_after: "2026-08-01T00:15:00.000Z",
    });
  });

  it("rejects malformed exhausted-task RPC data", async () => {
    mocks.rpc.mockResolvedValue({ data: "true", error: null });

    await expect(new SupabaseRecommendationRepository().markTaskRecoveryExhausted(
      TASK_ID,
      "PROVIDER_TIMEOUT",
      "2026-08-01T00:15:00.000Z",
    )).rejects.toThrow("invalid RPC result");
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

  it("uses a pending-only CAS review update so a concurrent reviewer cannot overwrite a decision", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { status: "pending", supervisor_approved_version: null },
      error: null,
    });
    const selectAfter = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    });
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const statusEq = vi.fn().mockReturnValue({ select });
    const versionEq = vi.fn().mockReturnValue({ eq: statusEq });
    const runEq = vi.fn().mockReturnValue({ eq: versionEq });
    const update = vi.fn(() => ({ eq: runEq }));
    mocks.from.mockReturnValue({ update, select: selectAfter });

    await expect(new SupabaseRecommendationRepository().reviewProposal({
      runId: "run-1",
      version: 1,
      approved: true,
      codes: [],
    })).rejects.toThrow("Supervisor review");

    expect(runEq).toHaveBeenCalledWith("run_id", "run-1");
    expect(versionEq).toHaveBeenCalledWith("version", 1);
    expect(statusEq).toHaveBeenCalledWith("status", "pending");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("retries a transient Supervisor review transport error before succeeding", async () => {
    const select = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "upstream timeout" } })
      .mockResolvedValueOnce({ data: [{ id: "proposal-1" }], error: null });
    const statusEq = vi.fn().mockReturnValue({ select });
    const versionEq = vi.fn().mockReturnValue({ eq: statusEq });
    const runEq = vi.fn().mockReturnValue({ eq: versionEq });
    const update = vi.fn(() => ({ eq: runEq }));
    mocks.from.mockReturnValue({ update });

    await expect(new SupabaseRecommendationRepository().reviewProposal({
      runId: "run-1",
      version: 2,
      approved: true,
      codes: [],
    })).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledTimes(2);
  });

  it("treats an already-applied Supervisor approval as a successful idempotent review", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { status: "approved", supervisor_approved_version: 2 },
      error: null,
    });
    const selectAfter = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    });
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const statusEq = vi.fn().mockReturnValue({ select });
    const versionEq = vi.fn().mockReturnValue({ eq: statusEq });
    const runEq = vi.fn().mockReturnValue({ eq: versionEq });
    const update = vi.fn(() => ({ eq: runEq }));
    mocks.from.mockReturnValue({ update, select: selectAfter });

    await expect(new SupabaseRecommendationRepository().reviewProposal({
      runId: "run-1",
      version: 2,
      approved: true,
      codes: [],
    })).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("materializes the participant-owned quote when participants share a quoteId", async () => {
    const resultInsert = vi.fn().mockResolvedValue({ error: null });
    const schemeInsert = vi.fn().mockResolvedValue({ error: null });
    const routeInsert = vi.fn().mockResolvedValue({ error: null });
    const existingMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const proposalEq = vi.fn().mockReturnValue({ maybeSingle: existingMaybeSingle });
    const runEq = vi.fn().mockReturnValue({ eq: proposalEq });
    const resultSelect = vi.fn().mockReturnValue({ eq: runEq });
    mocks.from.mockImplementation((table: string) => {
      if (table === "recommendation_results") return { select: resultSelect, insert: resultInsert };
      if (table === "recommendation_schemes") return { insert: schemeInsert };
      if (table === "recommendation_scheme_routes") return { insert: routeInsert };
      throw new Error(`Unexpected table: ${table}`);
    });

    const sharedQuoteId = `flyai:${"a".repeat(64)}`;
    const quote = (participantId: string, id: string) => ({
      id,
      quoteId: sharedQuoteId,
      providerQuoteId: "provider-item-1",
      participantId,
      cityCode: "wuhan",
      mode: "high_speed_rail" as const,
      searchDate: "2026-08-20",
      queriedAt: "2026-07-20T10:00:00+08:00",
      priceCny: 100,
      departAt: "2026-08-20T08:00:00+08:00",
      arriveAt: "2026-08-20T12:00:00+08:00",
      durationMinutes: 240,
      transferCount: 0,
      isDirect: true,
      serviceName: "G1",
    });

    await new SupabaseRecommendationRepository().materializeApprovedProposal({
      run: {
        id: "11111111-1111-4111-8111-111111111111",
        planId: "22222222-2222-4222-8222-222222222222",
        status: "validating",
        traceId: "33333333-3333-4333-8333-333333333333",
        retryAfter: null,
        staleAfter: "2026-07-20T10:15:00+08:00",
        errorCode: null,
        policyVersion: "2026-07-19.v2",
        kind: "automatic",
        arrivalDate: "2026-08-20",
        participantIds: ["p1", "p2"],
      },
      proposal: {
        id: "44444444-4444-4444-8444-444444444444",
        version: 1,
        output: {
          status: "proposal",
          cityCode: "wuhan",
          schemes: [
            {
              kind: "saving",
              quoteIdsByParticipant: { p1: sharedQuoteId, p2: sharedQuoteId },
              totalFareCny: 200,
            },
            {
              kind: "fast",
              quoteIdsByParticipant: { p1: sharedQuoteId, p2: sharedQuoteId },
              totalFareCny: 200,
            },
          ],
          comparisonEvidence: {
            eligibleCityCodes: ["wuhan"],
            orderedCityCodes: ["wuhan"],
          },
          explanationZh: "这座城市按真实票价和统一规则为全员选出，每一程都有据可查。",
        },
      },
      quotes: [quote("p1", "quote-row-p1"), quote("p2", "quote-row-p2")],
    });

    const insertedRoutes = routeInsert.mock.calls[0]?.[0] as Array<{
      participant_id: string;
      verified_quote_id: string;
    }>;
    expect(insertedRoutes).toHaveLength(4);
    expect(insertedRoutes.filter((route) =>
      route.participant_id === "p1" && route.verified_quote_id === "quote-row-p1"))
      .toHaveLength(2);
    expect(insertedRoutes.filter((route) =>
      route.participant_id === "p2" && route.verified_quote_id === "quote-row-p2"))
      .toHaveLength(2);
  });

  it("accepts the UUID returned by the atomic publication RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: "11111111-1111-4111-8111-111111111111",
      error: null,
    });

    await expect(new SupabaseRecommendationRepository().publishSharedResult(
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    )).resolves.toBeUndefined();
  });
});
