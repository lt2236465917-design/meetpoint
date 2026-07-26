import { describe, expect, it } from "vitest";

import type { VerifiedQuote } from "@/lib/agent/contracts";
import {
  buildFastScheme,
  buildSavingScheme,
  directFirstEligible,
  PolicyLimitExceededError,
  rankEligibleCities,
} from "@/lib/recommendation/policy";
import {
  policyV2Fixture,
  policyV2ParityQuotes,
  policyV2ParitySavingSelection,
  policyV2Quote,
} from "./fixtures/publication-policy-v2";

const arrivalDate = "2026-08-15";

function quote(
  quoteId: string,
  participantId: string,
  overrides: Partial<VerifiedQuote> = {},
): VerifiedQuote {
  return {
    id: `row-${participantId}-${quoteId}`,
    quoteId,
    providerQuoteId: null,
    participantId,
    cityCode: "wuhan",
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

describe("directFirstEligible", () => {
  it("keeps direct routes even when a transfer is cheaper and faster", () => {
    const direct = quote("direct", "p1", { priceCny: 200, durationMinutes: 180 });
    const transfer = quote("transfer", "p1", {
      priceCny: 50,
      durationMinutes: 60,
      transferCount: 1,
      isDirect: false,
    });

    expect(directFirstEligible([transfer, direct])).toEqual([direct]);
  });

  it("admits transfer routes only when no direct route exists", () => {
    const quotes = [
      quote("transfer-b", "p1", { transferCount: 2, isDirect: false }),
      quote("transfer-a", "p1", { transferCount: 1, isDirect: false }),
    ];

    expect(directFirstEligible(quotes)).toEqual(quotes);
  });
});

describe("buildSavingScheme", () => {
  it("matches the shared PostgreSQL saving fixture", () => {
    const quotes = policyV2ParityQuotes.map((input) => {
      const fixture = policyV2Quote(input);
      return quote(fixture.quoteId, fixture.participantId, {
        id: fixture.id,
        cityCode: fixture.cityCode,
        mode: fixture.mode,
        searchDate: fixture.searchDate,
        priceCny: fixture.priceCny,
        departAt: fixture.departAt,
        arriveAt: fixture.arriveAt,
        durationMinutes: fixture.durationMinutes,
        transferCount: fixture.transferCount,
        isDirect: fixture.isDirect,
      });
    });

    expect(buildSavingScheme(policyV2Fixture.participantIds, quotes)?.quoteIdsByParticipant)
      .toEqual(Object.fromEntries(policyV2ParitySavingSelection.map((selection) => [
        selection.participantId,
        selection.quoteId,
      ])));
  });

  it("selects the cheapest direct quote even when a faster quote is within 110 percent", () => {
    const scheme = buildSavingScheme(["p1"], [
      quote("normal-train", "p1", {
        mode: "normal_train",
        serviceName: "Z1",
        priceCny: 100,
        durationMinutes: 200,
      }),
      quote("high-speed", "p1", { priceCny: 110, durationMinutes: 100 }),
    ]);

    expect(scheme).toEqual({
      kind: "saving",
      quoteIdsByParticipant: { p1: "normal-train" },
      totalFareCny: 100,
    });
  });

  it.each([
    {
      name: "transfer count",
      quotes: [
        quote("loser", "p1", { isDirect: false, transferCount: 2, durationMinutes: 50 }),
        quote("winner", "p1", { isDirect: false, transferCount: 1, durationMinutes: 200 }),
      ],
    },
    {
      name: "duration",
      quotes: [
        quote("loser", "p1", { durationMinutes: 121 }),
        quote("winner", "p1", { durationMinutes: 120 }),
      ],
    },
    {
      name: "quote ID",
      quotes: [quote("z-quote", "p1"), quote("a-quote", "p1")],
    },
  ])("uses $name as the next saving tie-break", ({ quotes }) => {
    expect(buildSavingScheme(["p1"], quotes)?.quoteIdsByParticipant).toEqual({
      p1: quotes.find((item) => item.quoteId === "winner")?.quoteId ?? "a-quote",
    });
  });

  it("returns null unless every participant has coverage", () => {
    expect(buildSavingScheme(["p1", "p2"], [quote("p1-only", "p1")])).toBeNull();
  });
});

describe("buildFastScheme", () => {
  it("admits the exact 130 percent team boundary and rejects one yuan above", () => {
    const exact = buildFastScheme(["p1", "p2"], [
      quote("p1-slow", "p1", { priceCny: 100, durationMinutes: 200 }),
      quote("p1-fast", "p1", { priceCny: 130, durationMinutes: 50 }),
      quote("p2-slow", "p2", { priceCny: 100, durationMinutes: 200 }),
      quote("p2-fast", "p2", { priceCny: 130, durationMinutes: 50 }),
    ], 200);
    const above = buildFastScheme(["p1", "p2"], [
      quote("p1-fast", "p1", { priceCny: 131, durationMinutes: 50 }),
      quote("p2-fast", "p2", { priceCny: 130, durationMinutes: 50 }),
      quote("p1-slow", "p1", { priceCny: 100, durationMinutes: 200 }),
      quote("p2-slow", "p2", { priceCny: 100, durationMinutes: 200 }),
    ], 200);

    expect(exact?.quoteIdsByParticipant).toEqual({ p1: "p1-fast", p2: "p2-fast" });
    expect(exact?.totalFareCny).toBe(260);
    expect(above?.quoteIdsByParticipant).not.toEqual({ p1: "p1-fast", p2: "p2-fast" });
  });

  it.each([
    {
      name: "team duration",
      first: { durationMinutes: 120 },
      second: { durationMinutes: 100 },
    },
    {
      name: "latest arrival",
      first: { arriveAt: "2026-08-15T12:00:00+08:00" },
      second: { arriveAt: "2026-08-15T11:00:00+08:00" },
    },
    {
      name: "team transfers",
      first: { isDirect: false, transferCount: 2 },
      second: { isDirect: false, transferCount: 1 },
    },
    {
      name: "team fare",
      first: { priceCny: 101 },
      second: { priceCny: 100 },
    },
  ])("uses $name as the next fast tie-break", ({ first, second }) => {
    const result = buildFastScheme(["p1", "p2"], [
      quote("first", "p1", first),
      quote("second", "p1", second),
      quote("fixed", "p2"),
    ], 300);

    expect(result?.quoteIdsByParticipant).toEqual({ p1: "second", p2: "fixed" });
  });

  it("uses participant-ordered quote IDs as the final stable tie-break", () => {
    const result = buildFastScheme(["p2", "p1"], [
      quote("z", "p2"),
      quote("a", "p2"),
      quote("a", "p1"),
      quote("z", "p1"),
    ], 200);

    expect(result?.quoteIdsByParticipant).toEqual({ p2: "a", p1: "a" });
    expect(Object.keys(result?.quoteIdsByParticipant ?? {})).toEqual(["p2", "p1"]);
  });

  it("returns null when the cap cannot cover every participant", () => {
    expect(buildFastScheme(["p1", "p2"], [
      quote("p1", "p1", { priceCny: 100 }),
      quote("p2", "p2", { priceCny: 100 }),
    ], 150)).toBeNull();
  });

  it("rejects a state space beyond the deterministic policy budget", () => {
    const p1Quotes = Array.from({ length: 256 }, (_, index) => quote(`p1-${index}`, "p1", {
      priceCny: 1_000_000 + index,
    }));
    const p2Quotes = Array.from({ length: 256 }, (_, index) => quote(`p2-${index}`, "p2", {
      priceCny: 1_000_000 + index * 256,
    }));

    expect(() => buildFastScheme(
      ["p1", "p2"],
      [...p1Quotes, ...p2Quotes],
      2_000_000,
    )).toThrow(PolicyLimitExceededError);
  });

  it("rejects excessive transitions even when fare states collide", () => {
    const p1Quotes = Array.from({ length: 501 }, (_, index) => quote(`p1-${index}`, "p1", {
      priceCny: 1_000_000 + index,
    }));
    const p2Quotes = Array.from({ length: 501 }, (_, index) => quote(`p2-${index}`, "p2", {
      priceCny: 1_000_000,
    }));

    expect(() => buildFastScheme(
      ["p1", "p2"],
      [...p1Quotes, ...p2Quotes],
      2_000_000,
    )).toThrow(PolicyLimitExceededError);
  });
});

describe("rankEligibleCities", () => {
  function city(cityCode: string, p1Fare: number, p2Fare: number, overrides: {
    p1?: Partial<VerifiedQuote>;
    p2?: Partial<VerifiedQuote>;
  } = {}) {
    return {
      cityCode,
      participantIds: ["p1", "p2"],
      arrivalDate,
      quotes: [
        quote(`${cityCode}-p1`, "p1", { cityCode, priceCny: p1Fare, ...overrides.p1 }),
        quote(`${cityCode}-p2`, "p2", { cityCode, priceCny: p2Fare, ...overrides.p2 }),
      ],
    };
  }

  it("keeps only cities with complete real and Shanghai-date-valid coverage", () => {
    const incomplete = city("incomplete", 100, 100);
    incomplete.quotes.pop();
    const estimated = city("estimated", 80, 80) as ReturnType<typeof city> & {
      quotes: Array<VerifiedQuote & { source?: string }>;
    };
    estimated.quotes[0]!.source = "estimated";
    const wrongDate = city("wrong-date", 70, 70, {
      p2: { arriveAt: "2026-08-15T23:30:00Z" },
    });

    expect(rankEligibleCities([
      incomplete,
      estimated,
      wrongDate,
      city("eligible", 100, 100),
    ]).map((item) => item.cityCode)).toEqual(["eligible"]);
  });

  it("ranks by saving fare, direct count, fairness, duration, then city code", () => {
    const ranked = rankEligibleCities([
      city("fare-loser", 100, 101),
      city("direct-loser", 100, 100, {
        p2: { isDirect: false, transferCount: 1 },
      }),
      city("fairness-loser", 80, 120),
      city("duration-loser", 100, 100, {
        p1: { durationMinutes: 121 },
      }),
      city("b-code", 100, 100),
      city("a-code", 100, 100),
    ]);

    expect(ranked.map((item) => item.cityCode)).toEqual([
      "a-code",
      "b-code",
      "duration-loser",
      "fairness-loser",
      "direct-loser",
      "fare-loser",
    ]);
    expect(ranked[0]).toMatchObject({
      directParticipantCount: 2,
      fareFairnessGap: 0,
      totalDurationMinutes: 240,
    });
  });
});
