import { afterEach, describe, expect, it, vi } from "vitest";

const searchGatewayMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/travel/gateway-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/travel/gateway-client")>("@/lib/travel/gateway-client");
  return { ...actual, searchGateway: searchGatewayMock };
});

import { FlyAITravelProvider } from "@/lib/travel/flyai-provider";
import { GatewayClientError } from "@/lib/travel/gateway-client";

const input = {
  participantId: "p1",
  originCityCode: "beijing",
  originCityName: "北京",
  destinationCityCode: "wuhan",
  destinationCityName: "武汉",
  meetingDate: "2026-08-20",
  targetArrivalTime: "12:00",
  acceptedModes: ["flight"] as const,
};

const gatewayResponse = {
  cache: "miss" as const,
  queriedAt: "2026-07-14T08:00:00.000Z",
  options: [{
    mode: "flight" as const,
    source: "real" as const,
    provider: "flyai" as const,
    priceCny: 680,
    departAt: "2026-08-20T08:00:00+08:00",
    arriveAt: "2026-08-20T10:15:00+08:00",
    durationMinutes: 135,
    isDirect: true,
    hasTransfer: false,
    transferCount: 0,
    serviceName: "MU5101",
    departureStationName: "北京首都",
    arrivalStationName: "武汉天河",
    bookingUrl: "https://a.feizhu.com/flight/MU5101",
  }],
};

describe("FlyAITravelProvider gateway retries", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not immediately retry a rate-limited mode", async () => {
    searchGatewayMock.mockRejectedValue(new GatewayClientError("PROVIDER_RATE_LIMITED"));

    const result = await new FlyAITravelProvider().search(input);

    expect(searchGatewayMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([expect.objectContaining({
      source: "estimated",
      provider: "estimate",
      mode: "flight",
      failureReason: "PROVIDER_RATE_LIMITED",
    })]);
  });

  it("retries a provider timeout once before returning real rows", async () => {
    searchGatewayMock
      .mockRejectedValueOnce(new GatewayClientError("PROVIDER_TIMEOUT"))
      .mockResolvedValueOnce(gatewayResponse);

    const result = await new FlyAITravelProvider().search(input);

    expect(searchGatewayMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual([expect.objectContaining({ source: "real", provider: "flyai" })]);
  });
});
