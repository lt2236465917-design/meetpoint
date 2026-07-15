import { afterEach, describe, expect, it, vi } from "vitest";
import { searchCities } from "@/lib/city/city-provider";
import { GatewayClientError, searchGateway } from "@/lib/travel/gateway-client";

const originalEnv = process.env;

afterEach(() => {
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

describe("searchGateway", () => {
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
  it("uses built-in city search before external Amap lookup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AMAP_API_KEY", "test-key");

    const cities = await searchCities("武汉");

    expect(cities.map((city) => city.code)).toEqual(["wuhan"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects Tianjin from the local city library without requiring Amap", async () => {
    vi.stubEnv("AMAP_API_KEY", "");

    await expect(searchCities("天津")).resolves.toEqual([
      expect.objectContaining({ code: "tianjin", name: "天津" }),
    ]);
  });

  it("normalizes an Amap city tip to a selectable city result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "1",
      tips: [{ name: "武汉市", district: "湖北省", adcode: "420100" }],
    }), { status: 200 })));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("武汉市")).resolves.toEqual([
      expect.objectContaining({ code: "wuhan", name: "武汉" }),
    ]);
  });

  it("makes Amap prefecture-level cities selectable when they are not in the local library", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "1",
      tips: [{ name: "湛江市", district: "广东省", adcode: "440800" }],
    }), { status: 200 })));
    vi.stubEnv("AMAP_API_KEY", "test-key");

    await expect(searchCities("湛江市")).resolves.toEqual([
      expect.objectContaining({ code: "amap-440800", name: "湛江", province: "广东" }),
    ]);
  });

  it.each([
    ["HTTP failure", () => new Response("unavailable", { status: 503 })],
    ["Amap status 0", () => new Response(JSON.stringify({ status: "0", tips: [] }), { status: 200 })],
    ["invalid JSON", () => new Response("not-json", { status: 200 })],
  ])("returns an empty list after %s", async (_name, responseFactory) => {
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
