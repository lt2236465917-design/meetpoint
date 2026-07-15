import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectTravelOptions: vi.fn(),
  explainRecommendation: vi.fn(),
}));

vi.mock("@/lib/recommendation/travel-search", () => ({
  collectTravelOptions: mocks.collectTravelOptions,
}));

vi.mock("@/lib/ai/recommendation-explainer", () => ({
  explainRecommendation: mocks.explainRecommendation,
}));

describe("fallback calculation lock", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.collectTravelOptions.mockReset();
    mocks.explainRecommendation.mockReset();
    mocks.explainRecommendation.mockResolvedValue({
      short_reason: "使用确定性说明。",
      risk_badges: [],
      share_summary: "使用确定性说明。",
      detail_explanation: "使用确定性说明。",
    });
  });

  it("rejects a second fallback calculation while the first run is active", async () => {
    const releaseTravelSearch: Array<(value: { options: []; usedFallback: true }) => void> = [];
    mocks.collectTravelOptions.mockImplementation(() => new Promise((resolve) => {
      releaseTravelSearch.push(resolve);
    }));
    const {
      calculateFallbackRecommendations,
      createFallbackParticipant,
      createFallbackPlan,
      readFallbackPlan,
    } = await import("@/lib/fallback/mvp-store");
    const created = await createFallbackPlan({
      title: "运行互斥测试",
      arrivalDate: "2026-08-15",
      participantLimit: 2,
    });
    await createFallbackParticipant(created.code, {
      name: "李雷",
      departureCityCode: "beijing",
      departureCityName: "北京",
      acceptedModes: ["flight"],
    });
    await createFallbackParticipant(created.code, {
      name: "韩梅梅",
      departureCityCode: "shanghai",
      departureCityName: "上海",
      acceptedModes: ["flight"],
    });

    const first = calculateFallbackRecommendations(created.code);
    await vi.waitFor(() => expect(mocks.collectTravelOptions).toHaveBeenCalledTimes(1));
    const second = calculateFallbackRecommendations(created.code);
    const secondOutcome = await Promise.race([
      second.then(
        () => "resolved",
        (error: unknown) => error instanceof Error ? error.message : "rejected",
      ),
      new Promise<string>((resolve) => { setTimeout(() => resolve("pending"), 0); }),
    ]);

    try {
      expect(secondOutcome).toBe("CALCULATION_IN_PROGRESS");
      expect(readFallbackPlan(created.code)?.latestRun?.status).toBe("running");
    } finally {
      for (const release of releaseTravelSearch) {
        release({ options: [], usedFallback: true });
      }
      await Promise.allSettled([first, second]);
    }
  });
});
