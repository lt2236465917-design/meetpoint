import { afterEach, describe, expect, it, vi } from "vitest";

const searchFlyAIMock = vi.hoisted(() => vi.fn());

vi.mock("../src/flyai-adapter.js", async () => {
  const actual = await vi.importActual<typeof import("../src/flyai-adapter.js")>("../src/flyai-adapter.js");
  return { ...actual, searchFlyAI: searchFlyAIMock };
});

import {
  gatewaySearchResultSchema,
  type GatewaySearchRequest,
  type GatewayTravelOption,
} from "../src/contracts.js";
import { FlyAIAdapterError } from "../src/flyai-adapter.js";
import { createTravelSearchService } from "../src/service.js";

const request: GatewaySearchRequest = {
  originCityCode: "beijing", originCityName: "北京",
  destinationCityCode: "shanghai", destinationCityName: "上海",
  departureDate: "2026-08-20", mode: "flight",
};
const option: GatewayTravelOption = {
  quoteId: "flyai:7c4198543e0fde40f3da35015176499ecef35a5c9241186a6f31d01e65a8af7e",
  providerQuoteId: "native-quote-1",
  mode: "flight", source: "real", provider: "flyai", priceCny: 680,
  departAt: "2026-08-20T08:00:00+08:00", arriveAt: "2026-08-20T10:15:00+08:00",
  durationMinutes: 135, isDirect: true, hasTransfer: false, transferCount: 0,
  serviceName: "MU5101", departureStationName: "北京首都", arrivalStationName: "上海虹桥", bookingUrl: null,
};

describe("createTravelSearchService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("passes the gateway diagnostic logger only to the default FlyAI adapter", async () => {
    const diagnosticLogger = vi.fn();
    searchFlyAIMock.mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_NO_ROUTE", "detail"));
    const service = createTravelSearchService({ diagnosticLogger });

    await expect(service.search(request)).rejects.toBeDefined();
    expect(searchFlyAIMock).toHaveBeenCalledWith(request, { diagnosticLogger });
  });

  it("does not call a diagnostic logger for an injected provider", async () => {
    const diagnosticLogger = vi.fn();
    const service = createTravelSearchService({
      searchProvider: vi.fn().mockResolvedValue([option]),
      diagnosticLogger,
    });

    await service.search(request);
    expect(diagnosticLogger).not.toHaveBeenCalled();
  });

  it("strictly validates requests before calling the provider", async () => {
    const searchProvider = vi.fn();
    const service = createTravelSearchService({ searchProvider });

    await expect(service.search({ ...request, participantId: "secret" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(searchProvider).not.toHaveBeenCalled();
  });

  it("caches by v1 route fields without participant or city display names", async () => {
    const searchProvider = vi.fn().mockResolvedValue([option]);
    const service = createTravelSearchService({ searchProvider, now: () => new Date("2026-07-12T08:00:00Z") });

    const first = await service.search(request);
    const second = await service.search({ ...request, originCityName: "北京市", destinationCityName: "上海市" });

    expect(second.options).toEqual(first.options);
    expect(first.cache).toBe("miss");
    expect(second.cache).toBe("hit");
    expect(searchProvider).toHaveBeenCalledTimes(1);
    expect(first.queriedAt).toBe("2026-07-12T08:00:00.000Z");
  });

  it("isolates cached responses from mutations to miss and hit results", async () => {
    const searchProvider = vi.fn().mockResolvedValue([option]);
    const service = createTravelSearchService({ searchProvider, now: () => new Date("2026-07-12T08:00:00Z") });

    const first = await service.search(request);
    first.options[0]!.priceCny = 1;
    Object.assign(first.options[0]!, { injected: "from-miss" });
    Object.assign(first, { injected: "from-miss" });

    const second = await service.search(request);
    expect(second).toEqual({ options: [option], queriedAt: "2026-07-12T08:00:00.000Z", cache: "hit" });
    expect(gatewaySearchResultSchema.safeParse(second).success).toBe(true);
    expect(second).not.toBe(first);
    expect(second.options).not.toBe(first.options);
    expect(second.options[0]).not.toBe(first.options[0]);

    second.options[0]!.priceCny = 2;
    Object.assign(second.options[0]!, { injected: "from-hit" });
    Object.assign(second, { injected: "from-hit" });

    const third = await service.search(request);
    expect(third).toEqual({ options: [option], queriedAt: "2026-07-12T08:00:00.000Z", cache: "hit" });
    expect(gatewaySearchResultSchema.safeParse(third).success).toBe(true);
    expect(third).not.toBe(second);
    expect(third.options).not.toBe(second.options);
    expect(third.options[0]).not.toBe(second.options[0]);
    expect(searchProvider).toHaveBeenCalledTimes(1);
  });

  it.each(["PROVIDER_TIMEOUT", "PROVIDER_UPSTREAM_UNAVAILABLE"] as const)(
    "retries %s exactly once with one queriedAt",
    async (code) => {
    const searchProvider = vi.fn()
      .mockRejectedValueOnce(new FlyAIAdapterError(code, "sensitive supplier detail"))
      .mockResolvedValueOnce([option]);
    const now = vi.fn(() => new Date("2026-07-12T08:00:00Z"));
    const service = createTravelSearchService({ searchProvider, now });

    await expect(service.search(request)).resolves.toMatchObject({ options: [option] });
    expect(searchProvider).toHaveBeenCalledTimes(2);
    expect(now).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["PROVIDER_NO_ROUTE", "PROVIDER_NO_TICKET", "PROVIDER_CLI_FAILED"] as const)(
    "does not retry %s",
    async (code) => {
      const searchProvider = vi.fn().mockRejectedValue(new FlyAIAdapterError(code, "sensitive supplier detail"));
      const service = createTravelSearchService({ searchProvider });

      await expect(service.search(request)).rejects.toMatchObject({ code });
      expect(searchProvider).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry or cache an invalid provider response", async () => {
    const searchProvider = vi.fn().mockResolvedValue([{ ...option, rawPayload: "secret" }]);
    const service = createTravelSearchService({ searchProvider });

    await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    expect(searchProvider).toHaveBeenCalledTimes(2);
  });

  it("fails fast after repeated matching schema drift instead of fanning out across routes", async () => {
    let nowMs = Date.parse("2026-07-12T08:00:00Z");
    const operationalLogger = vi.fn();
    const searchProvider = vi.fn().mockRejectedValue(
      new FlyAIAdapterError(
        "PROVIDER_INVALID_RESPONSE",
        "sensitive supplier detail",
        "mixed_transport_category",
      ),
    );
    const service = createTravelSearchService({
      searchProvider,
      now: () => new Date(nowMs),
      operationalLogger,
    });

    await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    await expect(service.search({
      ...request,
      destinationCityCode: "wuhan",
      destinationCityName: "武汉",
    })).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    await expect(service.search({
      ...request,
      destinationCityCode: "nanjing",
      destinationCityName: "南京",
    })).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    expect(searchProvider).toHaveBeenCalledTimes(2);
    expect(operationalLogger).toHaveBeenNthCalledWith(1, {
      event: "schema_drift_circuit_open",
      provider: "flyai",
      signature: "mixed_transport_category",
      ttlMs: 60_000,
    });
    expect(operationalLogger).toHaveBeenNthCalledWith(2, {
      event: "schema_drift_circuit_short_circuit",
      provider: "flyai",
      signature: "mixed_transport_category",
    });

    nowMs += 60_001;
    await expect(service.search({
      ...request,
      destinationCityCode: "hangzhou",
      destinationCityName: "杭州",
    })).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    expect(searchProvider).toHaveBeenCalledTimes(3);
  });

  it("does not open the schema-drift circuit for unrelated invalid response signatures", async () => {
    const searchProvider = vi.fn()
      .mockRejectedValueOnce(new FlyAIAdapterError(
        "PROVIDER_INVALID_RESPONSE",
        "detail one",
        "mixed_transport_category",
      ))
      .mockRejectedValueOnce(new FlyAIAdapterError(
        "PROVIDER_INVALID_RESPONSE",
        "detail two",
        "invalid_segment_sequence",
      ))
      .mockResolvedValueOnce([option]);
    const service = createTravelSearchService({ searchProvider });

    await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    await expect(service.search({
      ...request,
      destinationCityCode: "wuhan",
      destinationCityName: "武汉",
    })).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    await expect(service.search({
      ...request,
      destinationCityCode: "nanjing",
      destinationCityName: "南京",
    })).resolves.toMatchObject({ options: [option] });
    expect(searchProvider).toHaveBeenCalledTimes(3);
  });

  it("maps unknown failures to a stable internal error without echoing details", async () => {
    const service = createTravelSearchService({ searchProvider: vi.fn().mockRejectedValue(new Error("token=secret")) });
    const error = await service.search(request).catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", message: "Gateway request failed" });
    expect(String(error)).not.toContain("secret");
  });

  it("shares one provider call for concurrent cache misses with the same key", async () => {
    const searchProvider = vi.fn().mockResolvedValue([option]);
    const service = createTravelSearchService({ searchProvider });

    const first = service.search(request);
    const second = service.search({ ...request, originCityName: "北京市" });
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse).toEqual(secondResponse);
    expect(firstResponse).not.toBe(secondResponse);
    expect(searchProvider).toHaveBeenCalledTimes(1);
  });

  it("removes a failed in-flight entry so a later same-key request can call the provider", async () => {
    const searchProvider = vi.fn()
      .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_NO_ROUTE", "supplier detail"))
      .mockResolvedValueOnce([option]);
    const service = createTravelSearchService({ searchProvider });

    await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_NO_ROUTE" });
    await expect(service.search(request)).resolves.toMatchObject({ options: [option] });
    expect(searchProvider).toHaveBeenCalledTimes(2);
  });

  it("does not immediately retry rate limiting and waits five seconds before the next provider call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T08:00:00Z"));
    const searchProvider = vi.fn()
      .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_RATE_LIMITED", "supplier detail"))
      .mockResolvedValueOnce([option]);
    const service = createTravelSearchService({ searchProvider });

    await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    expect(searchProvider).toHaveBeenCalledTimes(1);
    const next = service.search({ ...request, destinationCityCode: "wuhan", destinationCityName: "武汉" });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(searchProvider).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(next).resolves.toMatchObject({ options: [option] });
    expect(searchProvider).toHaveBeenCalledTimes(2);
  });

  it("exposes the bounded current cooldown on rate-limit errors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T08:00:00Z"));
    const searchProvider = vi.fn().mockRejectedValue(
      new FlyAIAdapterError("PROVIDER_RATE_LIMITED", "supplier detail"),
    );
    const service = createTravelSearchService({ searchProvider });

    await expect(service.search(request)).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryAfterMs: 5_000,
    });
  });

  it("waits fifteen seconds after the first post-cooldown provider call is rate limited", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T08:00:00Z"));
    const searchProvider = vi.fn()
      .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_RATE_LIMITED", "first"))
      .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_RATE_LIMITED", "second"))
      .mockResolvedValueOnce([option]);
    const service = createTravelSearchService({ searchProvider });

    await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    const second = service.search({ ...request, destinationCityCode: "wuhan", destinationCityName: "武汉" });
    const secondFailure = expect(second).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    await vi.advanceTimersByTimeAsync(5_000);
    await secondFailure;
    const third = service.search({ ...request, destinationCityCode: "nanjing", destinationCityName: "南京" });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(searchProvider).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(third).resolves.toMatchObject({ options: [option] });
    expect(searchProvider).toHaveBeenCalledTimes(3);
  });
});
