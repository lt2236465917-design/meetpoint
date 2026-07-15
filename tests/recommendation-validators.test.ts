import { describe, expect, it } from "vitest";

import type { RecommendationProposal, VerifiedQuote } from "@/lib/agent/contracts";
import {
  sumFares,
  validateRecommendationPolicy,
} from "@/lib/recommendation/validators";

const arrivalDate = "2026-08-15";

function quote(
  quoteId: string,
  participantId: string,
  cityCode = "wuhan",
  overrides: Partial<VerifiedQuote> = {},
): VerifiedQuote {
  return {
    id: `row-${participantId}-${quoteId}`,
    quoteId,
    providerQuoteId: null,
    participantId,
    cityCode,
    mode: "high_speed_rail",
    searchDate: arrivalDate,
    queriedAt: "2026-07-15T10:00:00+08:00",
    priceCny: 100,
    departAt: "2026-08-15T08:00:00+08:00",
    arriveAt: "2026-08-15T10:00:00+08:00",
    durationMinutes: 120,
    transferCount: 0,
    isDirect: true,
    serviceName: "G1",
    ...overrides,
  };
}

const quotes = [
  quote("p1-saving", "p1", "wuhan", { priceCny: 100, durationMinutes: 180 }),
  quote("p1-fast", "p1", "wuhan", { priceCny: 120, durationMinutes: 60 }),
  quote("p2-saving", "p2", "wuhan", { priceCny: 100, durationMinutes: 180 }),
  quote("p2-fast", "p2", "wuhan", { priceCny: 120, durationMinutes: 60 }),
];

function proposal(overrides: Partial<RecommendationProposal> = {}): RecommendationProposal {
  return {
    status: "proposal",
    cityCode: "wuhan",
    schemes: [
      {
        kind: "saving",
        quoteIdsByParticipant: { p1: "p1-saving", p2: "p2-saving" },
        totalFareCny: 200,
      },
      {
        kind: "fast",
        quoteIdsByParticipant: { p1: "p1-fast", p2: "p2-fast" },
        totalFareCny: 240,
      },
    ],
    comparisonEvidence: {
      eligibleCityCodes: ["wuhan"],
      orderedCityCodes: ["wuhan"],
    },
    explanationZh: "武汉满足全员真实路线。",
    ...overrides,
  };
}

function validate(
  candidate: unknown = proposal(),
  cityQuotes: Array<VerifiedQuote & { source?: string }> = quotes,
) {
  return validateRecommendationPolicy({
    participantIds: ["p1", "p2"],
    arrivalDate,
    cityInputs: [{ cityCode: "wuhan", quotes: cityQuotes }],
    proposal: candidate,
  });
}

describe("sumFares", () => {
  it("sums exact integer fares and rejects an unknown quote ID", () => {
    const quoteMap = new Map(quotes.map((item) => [item.quoteId, item]));
    expect(sumFares(["p1-saving", "p2-fast"], quoteMap)).toBe(220);
    expect(() => sumFares(["unknown"], quoteMap)).toThrow("unknown");
  });
});

describe("validateRecommendationPolicy", () => {
  it("accepts only the independently recomputed city and schemes", () => {
    expect(validate()).toEqual({ ok: true });
  });

  it("does not let an incomplete alternative city invalidate a complete winner", () => {
    expect(validateRecommendationPolicy({
      participantIds: ["p1", "p2"],
      arrivalDate,
      cityInputs: [
        { cityCode: "wuhan", quotes },
        { cityCode: "incomplete", quotes: [quote("only-p1", "p1", "incomplete")] },
      ],
      proposal: proposal(),
    })).toEqual({ ok: true });
  });

  it.each([
    ["estimated quote", () => {
      const estimated = quotes.map((item) => ({ ...item, source: "real" }));
      estimated[0]!.source = "estimated";
      return validate(proposal(), estimated);
    }, "ESTIMATED_QUOTE"],
    ["missing participant", () => validate(proposal(), quotes.filter((item) => item.participantId === "p1")), "MISSING_PARTICIPANT"],
    ["wrong Shanghai arrival date", () => validate(proposal(), quotes.map((item, index) => index === 0
      ? { ...item, arriveAt: "2026-08-15T23:30:00Z" }
      : item)), "ARRIVAL_DATE_MISMATCH"],
    ["altered total", () => validate(proposal({
      schemes: [
        { ...proposal().schemes[0], totalFareCny: 201 },
        proposal().schemes[1],
      ],
    })), "TOTAL_FARE_MISMATCH"],
    ["unknown quote ID", () => validate(proposal({
      schemes: [
        proposal().schemes[0],
        {
          ...proposal().schemes[1],
          quoteIdsByParticipant: { p1: "unknown", p2: "p2-fast" },
        },
      ],
    })), "UNKNOWN_QUOTE_ID"],
    ["duplicate schemes", () => validate({
      ...proposal(),
      schemes: [proposal().schemes[0], proposal().schemes[0]],
    }), "INVALID_SCHEMES"],
    ["extra scheme", () => validate({
      ...proposal(),
      schemes: [...proposal().schemes, proposal().schemes[1]],
    }), "INVALID_SCHEMES"],
    ["extra city evidence", () => validate(proposal({
      comparisonEvidence: {
        eligibleCityCodes: ["wuhan", "invented"],
        orderedCityCodes: ["wuhan", "invented"],
      },
    })), "INVALID_CITY_EVIDENCE"],
  ])("rejects %s", (_name, run, code) => {
    const decision = run();
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.codes).toContain(code);
  });

  it("rejects selected IDs that are real but violate deterministic policy", () => {
    const decision = validate(proposal({
      schemes: [
        {
          ...proposal().schemes[0],
          quoteIdsByParticipant: { p1: "p1-fast", p2: "p2-fast" },
          totalFareCny: 240,
        },
        proposal().schemes[1],
      ],
    }));

    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.codes).toContain("POLICY_MISMATCH");
  });
});
