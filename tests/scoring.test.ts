import { describe, expect, it } from "vitest";
import {
  pickPrimaryRecommendations,
  scoreCandidateCity,
} from "@/lib/recommendation/scoring";
import type { CityRecommendation, TravelOption } from "@/types/domain";

const baseOption: TravelOption = {
  participantId: "p1",
  candidateCityCode: "wuhan",
  mode: "high_speed_rail",
  source: "real",
  provider: "flyai",
  priceCny: 300,
  departAt: "2026-08-01T08:00:00+08:00",
  arriveAt: "2026-08-01T12:00:00+08:00",
  durationMinutes: 240,
  waitMinutes: 360,
  isDirect: true,
  hasTransfer: false,
  transferCount: 0,
  serviceName: null,
  bookingUrl: null,
  failureReason: null,
};

function recommendation(
  cityCode: string,
  scores: Pick<
    CityRecommendation,
    "scoreCheapest" | "scoreBalanced" | "scoreFastest" | "missingPenalty"
  >,
): CityRecommendation {
  return {
    cityCode,
    cityName: cityCode,
    totalPriceCny: 0,
    avgPriceCny: 0,
    totalDurationMinutes: 0,
    fairnessGap: 0,
    waitingPenalty: 0,
    transferPenalty: 0,
    estimatePenalty: 0,
    labels: [],
    ...scores,
  };
}

describe("scoreCandidateCity", () => {
  it("uses one best route per participant instead of summing every transport mode", () => {
    const scored = scoreCandidateCity({
      cityCode: "wuhan",
      cityName: "武汉",
      options: [
        {
          ...baseOption,
          participantId: "p1",
          mode: "flight",
          priceCny: 900,
          durationMinutes: 120,
        },
        {
          ...baseOption,
          participantId: "p1",
          mode: "high_speed_rail",
          priceCny: 300,
          durationMinutes: 240,
        },
        {
          ...baseOption,
          participantId: "p2",
          priceCny: 200,
          durationMinutes: 180,
        },
      ],
    });

    expect(scored.totalPriceCny).toBe(500);
    expect(scored.totalDurationMinutes).toBe(420);
    expect(scored.fairnessGap).toBe(100);
  });

  it("penalizes estimates, transfers, and unavailable options", () => {
    const scored = scoreCandidateCity({
      cityCode: "wuhan",
      cityName: "武汉",
      options: [
        baseOption,
        {
          ...baseOption,
          participantId: "p2",
          source: "estimated",
          provider: "estimate",
          priceCny: 500,
        },
        {
          ...baseOption,
          participantId: "p3",
          hasTransfer: true,
          transferCount: 1,
          isDirect: false,
        },
        {
          ...baseOption,
          participantId: "p4",
          source: "unavailable",
          priceCny: null,
          durationMinutes: null,
        },
      ],
    });

    expect(scored.totalPriceCny).toBe(1100);
    expect(scored.estimatePenalty).toBeGreaterThan(0);
    expect(scored.transferPenalty).toBeGreaterThan(0);
    expect(scored.missingPenalty).toBeGreaterThan(0);
  });

  it("merges labels when the same eligible city wins multiple scoring modes", () => {
    const picked = pickPrimaryRecommendations([
      recommendation("wuhan", {
        scoreCheapest: 10,
        scoreBalanced: 10,
        scoreFastest: 10,
        missingPenalty: 0,
      }),
      recommendation("changsha", {
        scoreCheapest: 20,
        scoreBalanced: 20,
        scoreFastest: 20,
        missingPenalty: 0,
      }),
      recommendation("nanjing", {
        scoreCheapest: 1,
        scoreBalanced: 1,
        scoreFastest: 1,
        missingPenalty: 9999,
      }),
    ]);

    expect(picked).toHaveLength(1);
    expect(picked[0]).toMatchObject({
      cityCode: "wuhan",
      labels: ["cheapest", "balanced", "fastest"],
    });
  });
});
