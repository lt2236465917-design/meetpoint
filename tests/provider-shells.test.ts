import { afterEach, describe, expect, it, vi } from "vitest";
import { searchCities } from "@/lib/city/city-provider";
import { createDeepSeekClient } from "@/lib/ai/deepseek-client";
import {
  explainRecommendation,
  fallbackExplanation,
} from "@/lib/ai/recommendation-explainer";
import { FlyAITravelProvider } from "@/lib/travel/flyai-provider";
import type { CityRecommendation } from "@/types/domain";

vi.mock("@/lib/ai/deepseek-client", () => ({
  createDeepSeekClient: vi.fn(),
}));

const originalEnv = process.env;

const baseRecommendation: CityRecommendation = {
  cityCode: "wuhan",
  cityName: "武汉",
  totalPriceCny: 900,
  avgPriceCny: 300,
  totalDurationMinutes: 720,
  fairnessGap: 120,
  waitingPenalty: 30,
  transferPenalty: 120,
  estimatePenalty: 200,
  missingPenalty: 0,
  scoreCheapest: 1220,
  scoreBalanced: 1610,
  scoreFastest: 1070,
  labels: ["balanced"],
};

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = originalEnv;
});

describe("FlyAITravelProvider", () => {
  it("returns estimate options while production FlyAI access is not configured", async () => {
    vi.stubEnv("FLYAI_CLI_PATH", "");
    const provider = new FlyAITravelProvider();

    const options = await provider.search({
      participantId: "p1",
      originCityCode: "beijing",
      originCityName: "北京",
      destinationCityCode: "wuhan",
      destinationCityName: "武汉",
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      acceptedModes: ["flight", "high_speed_rail"],
    });

    expect(options).toHaveLength(2);
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "flight",
          source: "estimated",
          provider: "estimate",
        }),
        expect.objectContaining({
          mode: "high_speed_rail",
          source: "estimated",
          provider: "estimate",
        }),
      ]),
    );
  });
});

describe("searchCities", () => {
  it("uses built-in city search before external Amap lookup", async () => {
    vi.stubEnv("AMAP_API_KEY", "test-key");

    const cities = await searchCities("武汉");

    expect(cities.map((city) => city.code)).toEqual(["wuhan"]);
  });

  it("returns an empty list for unknown cities when Amap is not configured", async () => {
    vi.stubEnv("AMAP_API_KEY", "");

    await expect(searchCities("不存在的城市")).resolves.toEqual([]);
  });
});

describe("fallbackExplanation", () => {
  it("summarizes computed recommendation values without inventing travel details", () => {
    const explanation = fallbackExplanation(baseRecommendation);

    expect(explanation.short_reason).toContain("武汉");
    expect(explanation.short_reason).toContain("团队总路费约 ¥900");
    expect(explanation.short_reason).toContain("总耗时约 12小时");
    expect(explanation.short_reason).toContain("费用差约 ¥120");
    expect(explanation.risk_badges).toEqual(["含估算", "含中转", "等待较久"]);
    expect(explanation.share_summary).toContain("团队总路费约 ¥900");
    expect(explanation.detail_explanation).toContain("请在购票前重新核对实时价格");
  });
});

describe("explainRecommendation", () => {
  it("falls back to deterministic copy when DeepSeek returns malformed JSON", async () => {
    vi.mocked(createDeepSeekClient).mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "not-json" } }],
          }),
        },
      },
    } as never);

    await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
      fallbackExplanation(baseRecommendation),
    );
  });
});
