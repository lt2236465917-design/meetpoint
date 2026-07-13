import { describe, expect, it, vi } from "vitest";

import {
  gatewaySearchResponseSchema,
  type GatewaySearchRequest,
  type GatewayTravelOption,
} from "../src/contracts.js";
import { FlyAIAdapterError } from "../src/flyai-adapter.js";
import { createTravelSearchService } from "../src/service.js";

const request: GatewaySearchRequest = {
  originCityCode: "beijing", originCityName: "北京",
  destinationCityCode: "shanghai", destinationCityName: "上海",
  meetingDate: "2026-08-20", mode: "flight",
};
const option: GatewayTravelOption = {
  mode: "flight", source: "real", provider: "flyai", priceCny: 680,
  departAt: "2026-08-20T08:00:00+08:00", arriveAt: "2026-08-20T10:15:00+08:00",
  durationMinutes: 135, isDirect: true, hasTransfer: false, transferCount: 0,
  serviceName: "MU5101", bookingUrl: null,
};

describe("createTravelSearchService", () => {
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

    expect(second).toEqual(first);
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
    expect(second).toEqual({ options: [option], queriedAt: "2026-07-12T08:00:00.000Z" });
    expect(gatewaySearchResponseSchema.safeParse(second).success).toBe(true);
    expect(second).not.toBe(first);
    expect(second.options).not.toBe(first.options);
    expect(second.options[0]).not.toBe(first.options[0]);

    second.options[0]!.priceCny = 2;
    Object.assign(second.options[0]!, { injected: "from-hit" });
    Object.assign(second, { injected: "from-hit" });

    const third = await service.search(request);
    expect(third).toEqual({ options: [option], queriedAt: "2026-07-12T08:00:00.000Z" });
    expect(gatewaySearchResponseSchema.safeParse(third).success).toBe(true);
    expect(third).not.toBe(second);
    expect(third.options).not.toBe(second.options);
    expect(third.options[0]).not.toBe(second.options[0]);
    expect(searchProvider).toHaveBeenCalledTimes(1);
  });

  it.each(["PROVIDER_TIMEOUT", "PROVIDER_RATE_LIMITED", "PROVIDER_UPSTREAM_UNAVAILABLE"] as const)(
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

  it("maps unknown failures to a stable internal error without echoing details", async () => {
    const service = createTravelSearchService({ searchProvider: vi.fn().mockRejectedValue(new Error("token=secret")) });
    const error = await service.search(request).catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", message: "Gateway request failed" });
    expect(String(error)).not.toContain("secret");
  });
});
