import { afterEach, describe, expect, it, vi } from "vitest";

import { probeLiveContract } from "../src/contract-probe.js";

describe("live FlyAI contract probe", () => {
  afterEach(() => {
    delete process.env.FLYAI_API_KEY;
  });

  it("executes production-shaped normalization for both modes and emits counts only", async () => {
    process.env.FLYAI_API_KEY = "secret-token";
    const search = vi.fn().mockResolvedValue([{
      quoteId: "secret-quote",
      providerQuoteId: null,
      mode: "flight",
      source: "real",
      provider: "flyai",
      priceCny: 599,
      departAt: "2026-08-02T08:00:00+08:00",
      arriveAt: "2026-08-02T10:00:00+08:00",
      durationMinutes: 120,
      isDirect: true,
      hasTransfer: false,
      transferCount: 0,
      serviceName: "MU-secret",
      departureStationName: null,
      arrivalStationName: null,
      bookingUrl: "https://secret.example/token",
    }]);

    const result = await probeLiveContract({ search, now: new Date("2026-08-01T00:00:00Z") });

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenNthCalledWith(1, expect.objectContaining({
      originCityName: "北京",
      destinationCityName: "武汉",
      departureDate: "2026-08-02",
      mode: "flight",
    }));
    expect(search).toHaveBeenNthCalledWith(2, expect.objectContaining({ mode: "high_speed_rail" }));
    expect(result).toEqual([
      expect.objectContaining({ provider: "flyai", mode: "flight", status: "ok", optionCount: 1 }),
      expect.objectContaining({ provider: "flyai", mode: "high_speed_rail", status: "ok", optionCount: 1 }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|599|MU-|https:/);
  });

  it("reports only stable invalid-response categories", async () => {
    process.env.FLYAI_API_KEY = "secret-token";
    const search = vi.fn().mockRejectedValue(Object.assign(
      new Error("raw supplier payload with secret-token"),
      { code: "PROVIDER_INVALID_RESPONSE", schemaDriftSignature: "mixed_transport_category" },
    ));

    const result = await probeLiveContract({ search });

    expect(result).toEqual([
      expect.objectContaining({
        mode: "flight",
        code: "PROVIDER_INVALID_RESPONSE",
        schemaDriftSignature: "mixed_transport_category",
      }),
      expect.objectContaining({
        mode: "high_speed_rail",
        code: "PROVIDER_INVALID_RESPONSE",
        schemaDriftSignature: "mixed_transport_category",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
