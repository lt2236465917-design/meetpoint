import { afterEach, describe, expect, it, vi } from "vitest";

const searchGatewayMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/travel/gateway-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/travel/gateway-client")>("@/lib/travel/gateway-client");
  return { ...actual, searchGateway: searchGatewayMock };
});

import { executeRouteTask } from "@/lib/recommendation/travel-search";
import { GatewayClientError } from "@/lib/travel/gateway-client";

const task = {
  participantId: "p1",
  cityCode: "wuhan",
  originCityCode: "beijing",
  mode: "normal_train" as const,
  searchDate: "2026-08-13",
  arrivalDate: "2026-08-15",
  physicalKey: "beijing:wuhan:normal_train:2026-08-13",
};

const quote = {
  quoteId: `flyai:${"a".repeat(64)}`,
  providerQuoteId: null,
  mode: "normal_train" as const,
  source: "real" as const,
  provider: "flyai" as const,
  priceCny: 220,
  departAt: "2026-08-13T23:00:00+08:00",
  arriveAt: "2026-08-15T00:01:00+08:00",
  durationMinutes: 1501,
  isDirect: true,
  hasTransfer: false,
  transferCount: 0,
  serviceName: "K123",
  departureStationName: "北京西",
  arrivalStationName: "武汉",
  bookingUrl: null,
};

describe("executeRouteTask", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns verified overnight quotes that arrive on the selected Shanghai date", async () => {
    searchGatewayMock.mockResolvedValue({
      options: [quote, { ...quote, quoteId: `flyai:${"b".repeat(64)}`, mode: "flight" }],
      queriedAt: "2026-07-15T08:00:00.000Z",
      traceId: "57f56c4d-20f6-4a8c-bf9f-349d288e07ab",
      cache: "miss",
    });

    await expect(executeRouteTask(task)).resolves.toEqual({
      status: "success",
      quotes: [expect.objectContaining({
        id: quote.quoteId,
        quoteId: quote.quoteId,
        providerQuoteId: null,
        participantId: "p1",
        cityCode: "wuhan",
        searchDate: "2026-08-13",
        serviceName: "K123",
      })],
    });
    expect(searchGatewayMock).toHaveBeenCalledWith(expect.objectContaining({
      departureDate: "2026-08-13",
      mode: "normal_train",
    }));
  });

  it("returns empty for successful responses with no feasible facts", async () => {
    searchGatewayMock.mockResolvedValue({
      options: [{ ...quote, arriveAt: "2026-08-15T16:01:00Z" }],
      queriedAt: "2026-07-15T08:00:00.000Z",
      traceId: "57f56c4d-20f6-4a8c-bf9f-349d288e07ab",
      cache: "hit",
    });

    await expect(executeRouteTask(task)).resolves.toEqual({ status: "empty" });
  });

  it("preserves retry metadata instead of estimating", async () => {
    searchGatewayMock.mockRejectedValue(new GatewayClientError("PROVIDER_RATE_LIMITED", null, 800));
    await expect(executeRouteTask(task)).resolves.toEqual({
      status: "retryable_failure",
      code: "PROVIDER_RATE_LIMITED",
      retryAfterMs: 800,
    });
  });

  it("maps invalid responses and CLI failures to terminal failures", async () => {
    searchGatewayMock.mockRejectedValue(new GatewayClientError("PROVIDER_CLI_FAILED"));
    await expect(executeRouteTask(task)).resolves.toEqual({
      status: "terminal_failure",
      code: "PROVIDER_CLI_FAILED",
    });
  });

  it("maps explicit no-route supplier responses to empty", async () => {
    searchGatewayMock.mockRejectedValue(new GatewayClientError("PROVIDER_NO_ROUTE"));
    await expect(executeRouteTask(task)).resolves.toEqual({ status: "empty" });
  });
});
