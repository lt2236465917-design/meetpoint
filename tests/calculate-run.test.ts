import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  search: vi.fn(),
  explainRecommendation: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

vi.mock("@/lib/travel/flyai-provider", () => ({
  FlyAITravelProvider: vi.fn(function FlyAITravelProvider() {
    return {
      search: mocks.search,
    };
  }),
}));

vi.mock("@/lib/ai/recommendation-explainer", () => ({
  explainRecommendation: mocks.explainRecommendation,
}));

function selectEqSingle(data: unknown) {
  const single = vi.fn().mockResolvedValue({ data });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, single };
}

function selectEq(data: unknown) {
  const eq = vi.fn().mockResolvedValue({ data });
  const select = vi.fn(() => ({ eq }));
  return { select, eq };
}

function insertSelectSingle(data: unknown) {
  const single = vi.fn().mockResolvedValue({ data });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
}

function insertOnly() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return { insert };
}

function updateEq() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  return { update, eq };
}

describe("calculatePlanRecommendations", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.search.mockReset();
    mocks.explainRecommendation.mockReset();
  });

  it("creates a run, stores travel options and recommendations, and marks the plan completed", async () => {
    const planLookup = selectEqSingle({
      id: "plan-1",
      code: "ABC123",
      meeting_date: "2026-08-01",
      target_arrival_time: "12:00",
    });
    const participantsLookup = selectEq([
      {
        id: "participant-1",
        departure_city_code: "beijing",
        departure_city_name: "北京",
        accepted_modes: ["flight"],
      },
      {
        id: "participant-2",
        departure_city_code: "beijing",
        departure_city_name: "北京",
        accepted_modes: ["flight"],
      },
    ]);
    const manualCandidatesLookup = selectEq([
      {
        city_code: "wuhan",
        source: "manual_add",
        enabled: true,
      },
      {
        city_code: "guangzhou",
        source: "manual_exclude",
        enabled: true,
      },
    ]);
    const runInsert = insertSelectSingle({ id: "run-1" });
    const travelOptionsInsert = insertOnly();
    const recommendationsInsert = insertOnly();
    const runUpdate = updateEq();
    const planUpdate = updateEq();

    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantsLookup.select })
      .mockReturnValueOnce({ select: manualCandidatesLookup.select })
      .mockReturnValueOnce({ insert: runInsert.insert })
      .mockReturnValueOnce({ insert: travelOptionsInsert.insert })
      .mockReturnValueOnce({ insert: recommendationsInsert.insert })
      .mockReturnValueOnce({ update: runUpdate.update })
      .mockReturnValueOnce({ update: planUpdate.update });

    mocks.search.mockImplementation((input) =>
      Promise.resolve([
        {
          participantId: input.participantId,
          candidateCityCode: input.destinationCityCode,
          mode: input.acceptedModes[0],
          source: "real",
          provider: "flyai",
          queriedAt: "2026-07-12T08:30:00.000Z",
          priceCny: 500,
          departAt: "2026-08-01T08:00:00+08:00",
          arriveAt: "2026-08-01T11:00:00+08:00",
          durationMinutes: 180,
          waitMinutes: 60,
          isDirect: true,
          hasTransfer: false,
          transferCount: 0,
          serviceName: null,
          bookingUrl: null,
          failureReason: null,
        },
      ]),
    );
    mocks.explainRecommendation.mockImplementation((recommendation) =>
      Promise.resolve({
        short_reason: `${recommendation.cityName}比较均衡。`,
        risk_badges: recommendation.estimatePenalty > 0 ? ["含估算"] : [],
        share_summary: `${recommendation.cityName}适合这次见面。`,
        detail_explanation: "请在购票前重新核对实时价格。",
      }),
    );

    const { calculatePlanRecommendations } = await import(
      "@/lib/recommendation/calculate-run"
    );
    const result = await calculatePlanRecommendations({ code: "ABC123" });

    expect(result).toEqual({ runId: "run-1", candidateCount: 12 });
    expect(planLookup.eq).toHaveBeenCalledWith("code", "ABC123");
    expect(runInsert.insert).toHaveBeenCalledWith({
      plan_id: "plan-1",
      status: "running",
    });
    expect(mocks.search).toHaveBeenCalledTimes(result.candidateCount);
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: "participant-1",
        originCityCode: "beijing",
        destinationCityCode: "beijing",
        meetingDate: "2026-08-01",
        targetArrivalTime: "12:00",
        acceptedModes: ["flight"],
      }),
    );
    expect(travelOptionsInsert.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          run_id: "run-1",
          participant_id: "participant-1",
          candidate_city_code: "beijing",
          price_cny: 500,
          queried_at: "2026-07-12T08:30:00.000Z",
        }),
      ]),
    );
    expect(recommendationsInsert.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          run_id: "run-1",
          city_code: "beijing",
          total_price_cny: 1000,
          avg_price_cny: 500,
          labels: expect.arrayContaining(["cheapest", "balanced", "fastest"]),
          explanation: "北京比较均衡。",
          risk_summary: "",
        }),
      ]),
    );
    expect(mocks.explainRecommendation).toHaveBeenCalledTimes(
      result.candidateCount,
    );
    expect(runUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    expect(runUpdate.eq).toHaveBeenCalledWith("id", "run-1");
    expect(planUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    expect(planUpdate.eq).toHaveBeenCalledWith("id", "plan-1");
  });

  it("rejects calculation when fewer than two participants have joined", async () => {
    const planLookup = selectEqSingle({
      id: "plan-1",
      code: "ABC123",
      meeting_date: "2026-08-01",
      target_arrival_time: "12:00",
    });
    const participantsLookup = selectEq([
      {
        id: "participant-1",
        departure_city_code: "beijing",
        departure_city_name: "北京",
        accepted_modes: ["flight"],
      },
    ]);

    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantsLookup.select });

    const { calculatePlanRecommendations } = await import(
      "@/lib/recommendation/calculate-run"
    );

    await expect(
      calculatePlanRecommendations({ code: "ABC123" }),
    ).rejects.toThrow("NOT_ENOUGH_PARTICIPANTS");
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
