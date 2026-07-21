import { afterEach, describe, expect, it, vi } from "vitest";
import { searchCities } from "@/lib/city/city-provider";
import { resetAmapCityIndexCacheForTests } from "@/lib/city/amap-client";
import { GatewayClientError, searchGateway } from "@/lib/travel/gateway-client";

const originalEnv = process.env;

afterEach(() => {
  resetAmapCityIndexCacheForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  process.env = originalEnv;
});

const gatewaySearchRequest = {
  originCityCode: "beijing",
  originCityName: "北京",
  destinationCityCode: "wuhan",
  destinationCityName: "武汉",
  departureDate: "2026-08-01",
  mode: "flight" as const,
};

const validGatewayOption = {
  quoteId: `flyai:${"a".repeat(64)}`,
  providerQuoteId: null,
  mode: "flight",
  source: "real",
  provider: "flyai",
  priceCny: 980,
  departAt: "2026-08-20T00:00:00+08:00",
  arriveAt: "2026-08-20T15:00:00+08:00",
  durationMinutes: 900,
  isDirect: true,
  hasTransfer: false,
  transferCount: 0,
  serviceName: "MU5101",
  departureStationName: "北京首都",
  arrivalStationName: "上海虹桥",
  bookingUrl: null,
} as const;

function serviceNameFor(segmentCount: number, segmentLength = 8): string {
  return Array.from(
    { length: segmentCount },
    (_, index) => `${String(index + 1).padStart(2, "0")}${"X".repeat(segmentLength - 2)}`,
  ).join(" → ");
}

function stubGatewayOption(overrides: Record<string, unknown>): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    options: [{ ...validGatewayOption, ...overrides }],
    queriedAt: "2026-08-01T08:00:00+08:00",
    traceId: "550e8400-e29b-41d4-a716-446655440000",
    cache: "miss",
  }), { status: 200 })));
}

async function searchStubbedGateway(): Promise<Awaited<ReturnType<typeof searchGateway>>> {
  return searchGateway(gatewaySearchRequest, {
    gatewayUrl: "http://gateway.internal:8080",
    token: "gateway-secret-token",
  });
}

async function expectInvalidGatewayOption(overrides: Record<string, unknown>): Promise<void> {
  stubGatewayOption(overrides);
  await expect(searchStubbedGateway()).rejects.toMatchObject({ code: "GATEWAY_INVALID_RESPONSE" });
}

describe("searchGateway", () => {
  it("accepts canonical service names for two through eight segments from the gateway", async () => {
    for (let segmentCount = 2; segmentCount <= 8; segmentCount += 1) {
      const serviceName = serviceNameFor(segmentCount, 64);
      stubGatewayOption({
        isDirect: false,
        hasTransfer: true,
        transferCount: segmentCount - 1,
        serviceName,
      });

      const result = await searchStubbedGateway();

      expect(result.options[0]).toMatchObject({ serviceName, transferCount: segmentCount - 1 });
    }
  });

  it("rejects a direct service identity longer than 64 characters from the gateway", async () => {
    await expectInvalidGatewayOption({ serviceName: "X".repeat(65) });
  });

  it("rejects a connecting service identity with an oversized segment from the gateway", async () => {
    await expectInvalidGatewayOption({
      isDirect: false,
      hasTransfer: true,
      transferCount: 1,
      serviceName: `${"X".repeat(65)} → MU5202`,
    });
  });

  it("rejects more than eight service identity segments from the gateway", async () => {
    await expectInvalidGatewayOption({
      isDirect: false,
      hasTransfer: true,
      transferCount: 8,
      serviceName: serviceNameFor(9),
    });
  });

  it("rejects a noncanonical service identity separator from the gateway", async () => {
    await expectInvalidGatewayOption({
      isDirect: false,
      hasTransfer: true,
      transferCount: 1,
      serviceName: "MU5101→MU5202",
    });
  });

  it("rejects a service segment count that disagrees with transferCount from the gateway", async () => {
    await expectInvalidGatewayOption({
      isDirect: false,
      hasTransfer: true,
      transferCount: 2,
      serviceName: "MU5101 → MU5202",
    });
  });

  it.each([
    { isDirect: true, hasTransfer: true, transferCount: 0 },
    { isDirect: true, hasTransfer: false, transferCount: 1 },
    { isDirect: false, hasTransfer: false, transferCount: 1 },
    { isDirect: false, hasTransfer: true, transferCount: 0 },
  ])("rejects inconsistent direct and transfer indicators from the gateway: %j", async (indicators) => {
    await expectInvalidGatewayOption({
      ...indicators,
      serviceName: indicators.isDirect ? "MU5101" : "MU5101 → MU5202",
    });
  });

  it("uses a token-safe timeout error for a fetch timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(
      new Error("gateway-secret-token timed out"), { name: "TimeoutError" },
    )));

    const error = await searchGateway(gatewaySearchRequest, {
      gatewayUrl: "http://gateway.internal:8080",
      token: "gateway-secret-token",
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayClientError);
    expect(error).toMatchObject({ code: "GATEWAY_TIMEOUT", message: "GATEWAY_TIMEOUT" });
    expect((error as Error).message).not.toContain("gateway-secret-token");
  });

  it("uses a stable unavailable error without exposing a token from a normal fetch rejection", async () => {
    const token = "gateway-secret-token";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      new Error(`connection failed with Authorization: Bearer ${token}`),
    ));

    const error = await searchGateway(gatewaySearchRequest, {
      gatewayUrl: "http://gateway.internal:8080",
      token,
    }).then(() => null, (caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "GATEWAY_UNAVAILABLE",
      message: "GATEWAY_UNAVAILABLE",
    });
    expect(String(error)).not.toContain(token);
  });
});

describe("searchCities", () => {
  it("merges Amap prefecture matches after local hubs for the same query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(
        new Response(
          JSON.stringify({
            status: "1",
            tips: [
              { name: "武汉市", district: "湖北省", adcode: "420100" },
              { name: "武威市", district: "甘肃省", adcode: "620600" },
            ],
          }),
          { status: 200 },
        ),
      )),
    );
    vi.stubEnv("AMAP_API_KEY", "test-key");

    const cities = await searchCities("武");
    expect(cities[0]).toEqual(expect.objectContaining({ code: "wuhan", name: "武汉" }));
    expect(cities.map((c) => c.code)).toContain("amap-620600");
    expect(fetch).toHaveBeenCalled();
  });

  it("selects Tianjin from the local city library without requiring Amap", async () => {
    vi.stubEnv("AMAP_API_KEY", "");

    await expect(searchCities("天津")).resolves.toEqual([
      expect.objectContaining({ code: "tianjin", name: "天津" }),
    ]);
  });

  it("normalizes an Amap city tip to a selectable city result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      status: "1",
      tips: [{ name: "武汉市", district: "湖北省", adcode: "420100" }],
    }), { status: 200 }))));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("武汉市")).resolves.toEqual([
      expect.objectContaining({ code: "wuhan", name: "武汉" }),
    ]);
  });

  it("makes Amap prefecture-level cities selectable when they are not in the local library", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      status: "1",
      tips: [{ name: "湛江市", district: "广东省", adcode: "440800" }],
    }), { status: 200 }))));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("湛江市")).resolves.toEqual([
      expect.objectContaining({ code: "amap-440800", name: "湛江", province: "广东" }),
    ]);
  });

  it("uses the administrative-district city code instead of an input-tip district code", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/v3/config/district") {
        return new Response(JSON.stringify({
          status: "1",
          districts: [{
            name: "齐齐哈尔市",
            adcode: "230200",
            level: "city",
            citycode: "0452",
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        status: "1",
        tips: [{
          name: "齐齐哈尔市",
          district: "黑龙江省齐齐哈尔市",
          adcode: "230203",
        }],
      }), { status: 200 });
    }));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("齐齐哈尔")).resolves.toEqual([
      { code: "amap-230200", name: "齐齐哈尔", province: "黑龙江" },
    ]);
  });

  it("retries the canonical district lookup once after a transient failure", async () => {
    let districtCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/v3/config/district") {
        districtCalls += 1;
        if (districtCalls === 1) return new Response("unavailable", { status: 503 });
        return new Response(JSON.stringify({
          status: "1",
          districts: [{
            name: "齐齐哈尔市",
            adcode: "230200",
            level: "city",
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "1", tips: [] }), {
        status: 200,
      });
    }));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("齐齐哈尔")).resolves.toEqual([
      { code: "amap-230200", name: "齐齐哈尔", province: "中国" },
    ]);
    expect(districtCalls).toBe(2);
  });

  it("accepts province-administered cities whose adcodes do not end in 00", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/v3/config/district") {
        return new Response(JSON.stringify({
          status: "1",
          districts: [{ name: "济源市", adcode: "419001", level: "city" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        status: "1",
        tips: [{ name: "济源市", district: "河南省济源市", adcode: "419001" }],
      }), { status: 200 });
    }));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("济源")).resolves.toEqual([
      { code: "amap-419001", name: "济源", province: "河南" },
    ]);
  });

  it("falls back to the Amap China city index when direct lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/v3/assistant/inputtips") {
        return new Response(JSON.stringify({ status: "1", tips: [] }), {
          status: 200,
        });
      }
      if (url.searchParams.get("keywords") === "中国") {
        return new Response(JSON.stringify({
          status: "1",
          districts: [{
            name: "中华人民共和国",
            adcode: "100000",
            level: "country",
            districts: [{
              name: "黑龙江省",
              adcode: "230000",
              level: "province",
              districts: [{
                name: "齐齐哈尔市",
                adcode: "230200",
                level: "city",
                districts: [],
              }],
            }],
          }],
        }), { status: 200 });
      }
      return new Response("unavailable", { status: 503 });
    }));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("齐齐哈尔")).resolves.toEqual([
      { code: "amap-230200", name: "齐齐哈尔", province: "黑龙江" },
    ]);

    const requestCountAfterWarmup = vi.mocked(fetch).mock.calls.length;
    await expect(searchCities("齐齐哈")).resolves.toEqual([
      { code: "amap-230200", name: "齐齐哈尔", province: "黑龙江" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(requestCountAfterWarmup);
  });

  it("returns local hubs when Amap fails but local hits exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("武汉")).resolves.toEqual([
      expect.objectContaining({ code: "wuhan", name: "武汉" }),
    ]);
  });

  it.each([
    ["HTTP failure", () => new Response("unavailable", { status: 503 })],
    ["Amap status 0", () => new Response(JSON.stringify({ status: "0", tips: [] }), { status: 200 })],
    ["invalid JSON", () => new Response("not-json", { status: 200 })],
  ])("returns an empty list after %s when there are no local hits", async (_name, responseFactory) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFactory()));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("武汉市")).resolves.toEqual([]);
  });

  it("returns an empty list when the Amap request aborts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("武汉市")).resolves.toEqual([]);
  });

  it("returns an empty list for unknown cities when Amap is not configured", async () => {
    vi.stubEnv("AMAP_API_KEY", "");

    await expect(searchCities("不存在的城市")).resolves.toEqual([]);
  });
});
