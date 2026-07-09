import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  explainRecommendation: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({
    from: mocks.from,
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

function selectEqOrderLimitSingle(data: unknown) {
  const single = vi.fn().mockResolvedValue({ data });
  const limit = vi.fn(() => ({ single }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, order, limit, single };
}

function selectEq(data: unknown) {
  const eq = vi.fn().mockResolvedValue({ data });
  const select = vi.fn(() => ({ eq }));
  return { select, eq };
}

function updateEq() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  return { update, eq };
}

describe("POST /api/plans/[code]/explain", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.explainRecommendation.mockReset();
  });

  it("generates explanations for the latest run and stores them on recommendation rows", async () => {
    const planLookup = selectEqSingle({ id: "plan-1" });
    const runLookup = selectEqOrderLimitSingle({ id: "run-1" });
    const recommendationsLookup = selectEq([
      {
        id: "recommendation-1",
        city_code: "wuhan",
        city_name: "武汉",
        total_price_cny: 800,
        avg_price_cny: 400,
        total_duration_minutes: 360,
        fairness_gap: 30,
        waiting_penalty: 0,
        transfer_penalty: 10,
        estimate_penalty: 20,
        missing_penalty: 0,
        score_cheapest: 800,
        score_balanced: 860,
        score_fastest: 390,
        labels: ["balanced"],
      },
    ]);
    const recommendationUpdate = updateEq();

    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: runLookup.select })
      .mockReturnValueOnce({ select: recommendationsLookup.select })
      .mockReturnValueOnce({ update: recommendationUpdate.update });

    mocks.explainRecommendation.mockResolvedValue({
      short_reason: "武汉在价格和时间之间较均衡。",
      risk_badges: ["含估算", "含中转"],
      share_summary: "武汉适合这次见面。",
      detail_explanation: "请在购票前重新核对实时价格。",
    });

    const { POST } = await import("@/app/api/plans/[code]/explain/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/explain", {
        method: "POST",
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, count: 1 });
    expect(planLookup.eq).toHaveBeenCalledWith("code", "ABC123");
    expect(runLookup.eq).toHaveBeenCalledWith("plan_id", "plan-1");
    expect(recommendationsLookup.eq).toHaveBeenCalledWith("run_id", "run-1");
    expect(mocks.explainRecommendation).toHaveBeenCalledWith({
      cityCode: "wuhan",
      cityName: "武汉",
      totalPriceCny: 800,
      avgPriceCny: 400,
      totalDurationMinutes: 360,
      fairnessGap: 30,
      waitingPenalty: 0,
      transferPenalty: 10,
      estimatePenalty: 20,
      missingPenalty: 0,
      scoreCheapest: 800,
      scoreBalanced: 860,
      scoreFastest: 390,
      labels: ["balanced"],
    });
    expect(recommendationUpdate.update).toHaveBeenCalledWith({
      explanation: "武汉在价格和时间之间较均衡。",
      risk_summary: "含估算、含中转",
    });
    expect(recommendationUpdate.eq).toHaveBeenCalledWith(
      "id",
      "recommendation-1",
    );
  });

  it("returns a not found error when the plan code does not exist", async () => {
    const planLookup = selectEqSingle(null);
    mocks.from.mockReturnValueOnce({ select: planLookup.select });

    const { POST } = await import("@/app/api/plans/[code]/explain/route");
    const response = await POST(
      new Request("http://localhost/api/plans/MISSING/explain", {
        method: "POST",
      }),
      { params: Promise.resolve({ code: "MISSING" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "PLAN_NOT_FOUND" });
    expect(mocks.explainRecommendation).not.toHaveBeenCalled();
  });
});
