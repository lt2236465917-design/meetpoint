import type { AddressInfo } from "node:net";
import { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gatewayErrorBodySchema, gatewaySearchResponseSchema, type GatewaySearchRequest, type GatewaySearchResult } from "../src/contracts.js";
import { GatewayServiceError } from "../src/service.js";
import { createGatewayServer, startGatewayServer } from "../src/server.js";

const request: GatewaySearchRequest = {
  originCityCode: "beijing", originCityName: "北京", destinationCityCode: "shanghai",
  destinationCityName: "上海", departureDate: "2026-08-20", mode: "flight",
};
const response: GatewaySearchResult = {
  options: [], queriedAt: "2026-07-12T08:00:00.000Z", cache: "miss",
};
const servers: ReturnType<typeof createGatewayServer>[] = [];

async function start(search = vi.fn().mockResolvedValue(response), token = "gateway-secret") {
  const server = createGatewayServer({ token, service: { search } });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, search };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("createGatewayServer", () => {
  it("returns a secret-free health response without authentication", async () => {
    const { baseUrl } = await start();
    const result = await fetch(`${baseUrl}/healthz`);
    const text = await result.text();
    expect(result.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ status: "ok" });
    expect(text).not.toContain("gateway-secret");
  });

  it.each([undefined, "Bearer wrong", "Basic gateway-secret"])("rejects missing or wrong bearer auth: %s", async (authorization) => {
    const { baseUrl, search } = await start();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (authorization !== undefined) headers.authorization = authorization;
    const result = await fetch(`${baseUrl}/v1/search`, { method: "POST", headers, body: JSON.stringify(request) });
    expect(result.status).toBe(401);
    const body = gatewayErrorBodySchema.parse(await result.json());
    expect(body).toEqual({ ...body, code: "UNAUTHORIZED", message: "Unauthorized", retryAfterMs: null });
    expect(body.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(search).not.toHaveBeenCalled();
  });

  it("rejects bodies over 16 KiB and malformed JSON with stable errors", async () => {
    const { baseUrl } = await start();
    const headers = { authorization: "Bearer gateway-secret", "content-type": "application/json" };
    const oversized = await fetch(`${baseUrl}/v1/search`, { method: "POST", headers, body: JSON.stringify({ value: "x".repeat(16_384) }) });
    expect(oversized.status).toBe(400);
    const oversizedBody = gatewayErrorBodySchema.parse(await oversized.json());
    expect(oversizedBody).toEqual({
      ...oversizedBody, code: "INVALID_REQUEST", message: "Invalid request", retryAfterMs: null,
    });
    const malformed = await fetch(`${baseUrl}/v1/search`, { method: "POST", headers, body: "{" });
    expect(malformed.status).toBe(400);
    const malformedBody = gatewayErrorBodySchema.parse(await malformed.json());
    expect(malformedBody).toEqual({
      ...malformedBody, code: "INVALID_REQUEST", message: "Invalid request", retryAfterMs: null,
    });
  });

  it("returns a valid authenticated response", async () => {
    const { baseUrl, search } = await start();
    const result = await fetch(`${baseUrl}/v1/search`, {
      method: "POST", headers: { authorization: "Bearer gateway-secret", "content-type": "application/json" }, body: JSON.stringify(request),
    });
    expect(result.status).toBe(200);
    const body = gatewaySearchResponseSchema.parse(await result.json());
    expect(body).toEqual({ ...response, traceId: body.traceId });
    expect(body.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(search).toHaveBeenCalledWith(request);
  });

  it.each([
    ["INVALID_REQUEST", 400], ["PROVIDER_INVALID_RESPONSE", 502], ["PROVIDER_UNAVAILABLE", 503],
    ["PROVIDER_NO_ROUTE", 404], ["PROVIDER_NO_TICKET", 404], ["PROVIDER_RATE_LIMITED", 429],
    ["PROVIDER_UPSTREAM_UNAVAILABLE", 503], ["PROVIDER_CLI_FAILED", 502],
    ["PROVIDER_TIMEOUT", 504], ["INTERNAL_ERROR", 500],
  ] as const)("maps %s to HTTP %s without echoing exception details", async (code, status) => {
    const search = vi.fn().mockRejectedValue(new GatewayServiceError(code, "token=secret raw provider"));
    const { baseUrl } = await start(search);
    const result = await fetch(`${baseUrl}/v1/search`, {
      method: "POST", headers: { authorization: "Bearer gateway-secret", "content-type": "application/json" }, body: JSON.stringify(request),
    });
    const text = await result.text();
    const body: unknown = JSON.parse(text);
    expect(result.status).toBe(status);
    expect(body).toMatchObject({ code });
    expect(gatewayErrorBodySchema.safeParse(body).success).toBe(true);
    expect(text).not.toMatch(/secret|raw provider/);
  });

  it("returns a bounded retryAfterMs on 429 without provider text", async () => {
    const search = vi.fn().mockRejectedValue(
      new GatewayServiceError("PROVIDER_RATE_LIMITED", "supplier secret detail", 4_500),
    );
    const { baseUrl } = await start(search);
    const result = await fetch(`${baseUrl}/v1/search`, {
      method: "POST",
      headers: { authorization: "Bearer gateway-secret", "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const text = await result.text();
    const body = gatewayErrorBodySchema.parse(JSON.parse(text));

    expect(result.status).toBe(429);
    expect(body).toEqual({
      code: "PROVIDER_RATE_LIMITED",
      message: "Provider rate limited",
      traceId: body.traceId,
      retryAfterMs: 4_500,
    });
    expect(body.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(text).not.toMatch(/supplier|secret|detail/);
  });
});

describe("startGatewayServer", () => {
  it("listens on 8080 when PORT is unset", () => {
    vi.stubEnv("TRAVEL_GATEWAY_TOKEN", "gateway-secret");
    vi.stubEnv("PORT", undefined);
    const listen = vi.spyOn(Server.prototype, "listen").mockReturnThis();

    startGatewayServer();

    expect(listen).toHaveBeenCalledWith(8080);
  });

  it("uses the supplied PORT value", () => {
    vi.stubEnv("TRAVEL_GATEWAY_TOKEN", "gateway-secret");
    vi.stubEnv("PORT", "9123");
    const listen = vi.spyOn(Server.prototype, "listen").mockReturnThis();

    startGatewayServer();

    expect(listen).toHaveBeenCalledWith(9123);
  });
});
