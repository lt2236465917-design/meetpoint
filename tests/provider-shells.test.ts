import { afterEach, describe, expect, it, vi } from "vitest";
import { searchCities } from "@/lib/city/city-provider";
import {
  createDeepSeekClient,
  getDeepSeekModel,
} from "@/lib/ai/deepseek-client";
import {
  explainRecommendation,
  fallbackExplanation,
} from "@/lib/ai/recommendation-explainer";
import { FlyAITravelProvider } from "@/lib/travel/flyai-provider";
import type { CityRecommendation } from "@/types/domain";

vi.mock("@/lib/ai/deepseek-client", () => ({
  createDeepSeekClient: vi.fn(),
  getDeepSeekModel: vi.fn(() => "deepseek-v4-flash"),
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
  it("requests strict JSON from the configured model", async () => {
    const expected = {
      short_reason: "武汉兼顾团队费用与时间。",
      risk_badges: ["含估算"],
      share_summary: "推荐武汉作为本次见面城市。",
      detail_explanation: "数据均来自已计算结果。",
    };
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(expected) } }],
    });
    vi.mocked(createDeepSeekClient).mockReturnValue({
      chat: { completions: { create } },
    } as never);

    await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(expected);
    expect(getDeepSeekModel).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      max_tokens: 800,
    }));
    const request = create.mock.calls[0][0];
    expect(request.messages[0].content).toContain("JSON");
    expect(request.messages[0].content).toContain("short_reason");
    expect(request.messages[0].content).toContain("detail_explanation");
  });

  it.each([
    ["empty content", { choices: [{ message: { content: "" } }] }],
    ["missing fields", { choices: [{ message: { content: JSON.stringify({ short_reason: "武汉" }) } }] }],
    ["extra fields", { choices: [{ message: { content: JSON.stringify({
      short_reason: "武汉",
      risk_badges: [],
      share_summary: "武汉",
      detail_explanation: "武汉",
      ranking_override: 1,
    }) } }] }],
  ])("falls back for %s", async (_name, response) => {
    vi.mocked(createDeepSeekClient).mockReturnValue({
      chat: { completions: { create: vi.fn().mockResolvedValue(response) } },
    } as never);
    await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
      fallbackExplanation(baseRecommendation),
    );
  });

  it.each([
    ["English-only prose", {
      short_reason: "Wuhan balances cost and time.",
      risk_badges: ["含估算"],
      share_summary: "Wuhan is the recommended meeting city.",
      detail_explanation: "The explanation uses calculated results only.",
    }],
    ["an English-only risk badge", {
      short_reason: "武汉兼顾团队费用与时间。",
      risk_badges: ["Estimated fare"],
      share_summary: "推荐武汉作为本次见面城市。",
      detail_explanation: "数据均来自已计算结果。",
    }],
  ])("falls back for %s", async (_name, response) => {
    vi.mocked(createDeepSeekClient).mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(response) } }],
          }),
        },
      },
    } as never);

    await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
      fallbackExplanation(baseRecommendation),
    );
  });

  it("falls back when the request fails", async () => {
    vi.mocked(createDeepSeekClient).mockReturnValue({
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error("network")) } },
    } as never);
    await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
      fallbackExplanation(baseRecommendation),
    );
  });

  it("falls back without a configured client", async () => {
    vi.mocked(createDeepSeekClient).mockReturnValue(null);
    await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
      fallbackExplanation(baseRecommendation),
    );
  });

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
