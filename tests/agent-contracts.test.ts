import { describe, expect, it } from "vitest";

import {
  POLICY_VERSION,
  calculationOutputSchema,
  runStatusSchema,
  verifiedQuoteSchema,
} from "@/lib/agent/contracts";

describe("multi-agent contracts", () => {
  it("accepts exactly one city with saving and fast schemes", () => {
    expect(POLICY_VERSION).toBe("2026-07-15.v1");
    expect(runStatusSchema.parse("awaiting_host_confirmation")).toBe(
      "awaiting_host_confirmation",
    );

    expect(
      calculationOutputSchema.parse({
        status: "proposal",
        cityCode: "shanghai",
        schemes: [
          {
            kind: "saving",
            quoteIdsByParticipant: { p1: "q1", p2: "q2" },
            totalFareCny: 800,
          },
          {
            kind: "fast",
            quoteIdsByParticipant: { p1: "q3", p2: "q4" },
            totalFareCny: 980,
          },
        ],
        comparisonEvidence: {
          eligibleCityCodes: ["shanghai"],
          orderedCityCodes: ["shanghai"],
        },
        explanationZh: "上海满足全员真实路线并符合省钱与省时策略。",
      }).schemes,
    ).toHaveLength(2);
  });

  it("rejects reversed schemes and unrecognized proposal fields", () => {
    const baseProposal = {
      status: "proposal" as const,
      cityCode: "shanghai",
      schemes: [
        {
          kind: "fast" as const,
          quoteIdsByParticipant: { p1: "q1" },
          totalFareCny: 100,
        },
        {
          kind: "saving" as const,
          quoteIdsByParticipant: { p1: "q2" },
          totalFareCny: 80,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["shanghai"],
        orderedCityCodes: ["shanghai"],
      },
      explanationZh: "上海满足要求。",
    };

    expect(calculationOutputSchema.safeParse(baseProposal).success).toBe(false);
    expect(
      calculationOutputSchema.safeParse({
        ...baseProposal,
        schemes: [...baseProposal.schemes].reverse(),
        inventedFare: 1,
      }).success,
    ).toBe(false);
  });

  it("keeps gateway and provider quote identifiers separate", () => {
    const quote = verifiedQuoteSchema.parse({
      id: "row-1",
      quoteId: "gateway-evidence-1",
      providerQuoteId: "provider-native-9",
      participantId: "participant-1",
      cityCode: "shanghai",
      mode: "high_speed_rail",
      searchDate: "2026-07-20",
      queriedAt: "2026-07-15T10:00:00+08:00",
      priceCny: 553,
      departAt: "2026-07-20T08:00:00+08:00",
      arriveAt: "2026-07-20T12:00:00+08:00",
      durationMinutes: 240,
      transferCount: 0,
      isDirect: true,
      serviceName: "G1",
    });

    expect(quote.quoteId).toBe("gateway-evidence-1");
    expect(quote.providerQuoteId).toBe("provider-native-9");
  });
});
