import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAmapCityIndexCacheForTests } from "@/lib/city/amap-client";
import { resolveDepartureCityIdentity } from "@/lib/city/departure-city";

describe("resolveDepartureCityIdentity", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetAmapCityIndexCacheForTests();
  });

  it("resolves an Amap adcode and persists its canonical city name", async () => {
    vi.stubEnv("AMAP_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("keywords") === "440800") {
        return new Response(JSON.stringify({
          status: "1",
          districts: [{ name: "湛江市", adcode: "440800", level: "city", center: "110.364977,21.274898" }],
        }), { status: 200 });
      }
      return new Response("unavailable", { status: 503 });
    }));

    await expect(resolveDepartureCityIdentity({
      code: "amap-440800",
      name: "湛江市",
    })).resolves.toEqual({
      ok: true,
      city: { code: "amap-440800", name: "湛江", lat: 21.274898, lng: 110.364977 },
    });
  });

  it("rejects an Amap adcode paired with another city name", async () => {
    vi.stubEnv("AMAP_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "1",
      districts: [{ name: "湛江市", adcode: "440800", level: "city", center: "110.364977,21.274898" }],
    }), { status: 200 })));

    await expect(resolveDepartureCityIdentity({
      code: "amap-440800",
      name: "茂名",
    })).resolves.toEqual({ ok: false, error: "INVALID_DEPARTURE_CITY" });
  });

  it("fails closed when an Amap identity cannot be verified", async () => {
    vi.stubEnv("AMAP_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    ));

    await expect(resolveDepartureCityIdentity({
      code: "amap-440800",
      name: "湛江",
    })).resolves.toEqual({
      ok: false,
      error: "CITY_VALIDATION_UNAVAILABLE",
    });
  });

  it("accepts province-administered city adcodes", async () => {
    vi.stubEnv("AMAP_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "1",
      districts: [{ name: "济源市", adcode: "419001", level: "city", center: "112.602347,35.069057" }],
    }), { status: 200 })));

    await expect(resolveDepartureCityIdentity({
      code: "amap-419001",
      name: "济源",
    })).resolves.toEqual({
      ok: true,
      city: { code: "amap-419001", name: "济源", lat: 35.069057, lng: 112.602347 },
    });
  });

  it("canonicalizes an Amap direct-admin identity to the built-in city", async () => {
    vi.stubEnv("AMAP_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "1",
      districts: [{ name: "北京市", adcode: "110000", level: "province", center: "116.4074,39.9042" }],
    }), { status: 200 })));

    await expect(resolveDepartureCityIdentity({
      code: "amap-110000",
      name: "北京市",
    })).resolves.toEqual({
      ok: true,
      city: { code: "beijing", name: "北京", lat: 39.9042, lng: 116.4074 },
    });
  });
});
