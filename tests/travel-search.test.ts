import { describe, expect, it, vi } from "vitest";
import { scoreCandidateCity } from "@/lib/recommendation/scoring";
import type { TravelOption } from "@/types/domain";
import type { TravelProvider, TravelSearchInput } from "@/lib/travel/types";
import {
  collectTravelOptions,
  travelSearchKey,
} from "@/lib/recommendation/travel-search";

const participants = [
  {
    id: "p1",
    departureCityCode: "beijing",
    departureCityName: "北京",
    acceptedModes: ["flight"] as const,
  },
  {
    id: "p2",
    departureCityCode: "beijing",
    departureCityName: "北京",
    acceptedModes: ["flight"] as const,
  },
];

const candidates = [{ code: "wuhan", name: "武汉" }];

function option(overrides: Partial<TravelOption> = {}): TravelOption {
  return {
    participantId: "provider-participant",
    candidateCityCode: "wuhan",
    mode: "flight",
    source: "real",
    provider: "flyai",
    queriedAt: "2026-07-12T08:30:00.000Z",
    priceCny: 500,
    departAt: "2026-08-01T00:30:00.000Z",
    arriveAt: "2026-08-01T03:00:00.000Z",
    durationMinutes: 150,
    waitMinutes: null,
    isDirect: true,
    hasTransfer: false,
    transferCount: 0,
    serviceName: "MU5101",
    bookingUrl: null,
    failureReason: null,
    ...overrides,
  };
}

function providerFrom(
  search: (input: TravelSearchInput) => Promise<TravelOption[]>,
): TravelProvider {
  return { search: vi.fn(search) };
}

describe("travelSearchKey", () => {
  it("creates a versioned key from the route, date, and mode", () => {
    expect(
      travelSearchKey({
        originCityCode: "beijing",
        destinationCityCode: "wuhan",
        meetingDate: "2026-08-01",
        mode: "flight",
      }),
    ).toBe("beijing:wuhan:2026-08-01:flight:v1");
  });
});

describe("collectTravelOptions", () => {
  it("searches each identical route once and clones the facts per participant", async () => {
    const provider = providerFrom(async () => [option()]);

    const result = await collectTravelOptions({
      participants,
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider,
      timeoutMs: 100,
    });

    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: "p1",
        acceptedModes: ["flight"],
      }),
    );
    expect(result.options).toHaveLength(2);
    expect(result.options.map((item) => item.participantId)).toEqual(["p1", "p2"]);
    expect(result.options.map((item) => item.serviceName)).toEqual(["MU5101", "MU5101"]);
    expect(result.usedFallback).toBe(false);
  });

  it("keeps only Shanghai meeting-day departures that arrive by the target time", async () => {
    const provider = providerFrom(async () => [
      option({
        serviceName: "wrong-day",
        departAt: "2026-08-01T16:30:00.000Z",
        arriveAt: "2026-08-01T18:00:00.000Z",
      }),
      option({
        serviceName: "late",
        departAt: "2026-08-01T00:30:00.000Z",
        arriveAt: "2026-08-01T04:30:00.000Z",
      }),
      option({
        serviceName: "on-time",
        departAt: "2026-08-01T00:30:00.000Z",
        arriveAt: "2026-08-01T04:00:00.000Z",
      }),
    ]);

    const result = await collectTravelOptions({
      participants: [participants[0]],
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider,
      timeoutMs: 100,
    });

    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.serviceName).toBe("on-time");
  });

  it("uses the total deadline to estimate only unfinished groups", async () => {
    const provider = providerFrom(async () => new Promise<TravelOption[]>(() => {}));

    const result = await collectTravelOptions({
      participants: [participants[0]],
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider,
      timeoutMs: 1,
    });

    expect(result.options).toEqual([
      expect.objectContaining({
        participantId: "p1",
        source: "estimated",
        provider: "estimate",
      }),
    ]);
    expect(result.usedFallback).toBe(true);
  });

  it("runs a secondary lookup for unfinished groups before estimating", async () => {
    let attempts = 0;
    const provider = providerFrom(async () => {
      attempts += 1;
      if (attempts === 1) return new Promise<TravelOption[]>(() => {});
      return [option({ serviceName: "second-try" })];
    });

    const result = await collectTravelOptions({
      participants: [participants[0]],
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider,
      timeoutMs: 1200,
    });

    expect(attempts).toBe(2);
    expect(result.options).toEqual([
      expect.objectContaining({
        participantId: "p1",
        source: "real",
        serviceName: "second-try",
      }),
    ]);
    expect(result.usedFallback).toBe(false);
  });

  it("limits provider concurrency so queued live searches do not consume request timeout", async () => {
    let active = 0;
    let maxActive = 0;
    const provider = providerFrom(async (input) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return [option({ candidateCityCode: input.destinationCityCode })];
    });

    const result = await collectTravelOptions({
      participants: [participants[0]],
      candidates: [
        { code: "wuhan", name: "武汉" },
        { code: "changsha", name: "长沙" },
        { code: "nanjing", name: "南京" },
        { code: "hangzhou", name: "杭州" },
        { code: "zhengzhou", name: "郑州" },
        { code: "xian", name: "西安" },
      ],
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider,
      timeoutMs: 200,
    });

    expect(provider.search).toHaveBeenCalledTimes(6);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(result.options).toHaveLength(6);
    expect(result.usedFallback).toBe(false);
  });

  it("starts the total deadline when collection begins", async () => {
    const provider = providerFrom(async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 30) {
        // Simulate expensive synchronous provider setup before its promise settles.
      }
      return [option()];
    });

    const result = await collectTravelOptions({
      participants: [participants[0]],
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider,
      timeoutMs: 1,
    });

    expect(result.options).toEqual([
      expect.objectContaining({
        participantId: "p1",
        source: "estimated",
        provider: "estimate",
      }),
    ]);
    expect(result.usedFallback).toBe(true);
  });

  it("does not restart the total deadline after synchronous provider setup", async () => {
    const startedAt = Date.now();
    const provider = providerFrom(async () => {
      while (Date.now() - startedAt < 60) {
        // Simulate setup that consumes the whole collection budget.
      }
      return new Promise<TravelOption[]>(() => {});
    });

    const result = await collectTravelOptions({
      participants: [participants[0]],
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider,
      timeoutMs: 50,
    });

    expect(Date.now() - startedAt).toBeLessThan(90);
    expect(result.options).toEqual([
      expect.objectContaining({
        participantId: "p1",
        source: "estimated",
        provider: "estimate",
      }),
    ]);
  });

  it("stabilizes selected routes when the provider returns the same facts in a different order", async () => {
    const routes = [
      option({ serviceName: "later", priceCny: 500, durationMinutes: 150 }),
      option({ serviceName: "earlier", priceCny: 500, durationMinutes: 150 }),
    ];
    const first = await collectTravelOptions({
      participants: [participants[0]],
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider: providerFrom(async () => routes),
      timeoutMs: 100,
    });
    const second = await collectTravelOptions({
      participants: [participants[0]],
      candidates,
      meetingDate: "2026-08-01",
      targetArrivalTime: "12:00",
      provider: providerFrom(async () => [...routes].reverse()),
      timeoutMs: 100,
    });

    expect(first.options).toEqual(second.options);
    expect(
      scoreCandidateCity({ cityCode: "wuhan", cityName: "武汉", options: first.options }),
    ).toEqual(
      scoreCandidateCity({ cityCode: "wuhan", cityName: "武汉", options: second.options }),
    );
  });
});
