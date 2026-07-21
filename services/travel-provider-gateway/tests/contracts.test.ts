import { describe, expect, it } from "vitest";

import {
  gatewayErrorBodySchema,
  gatewayErrorCodeSchema,
  gatewaySearchRequestSchema,
  gatewaySearchResponseSchema,
  gatewayTravelOptionSchema,
} from "../src/contracts.js";

const validRequest = {
  originCityCode: "beijing",
  originCityName: "北京",
  destinationCityCode: "shanghai",
  destinationCityName: "上海",
  departureDate: "2026-07-20",
  mode: "flight",
} as const;

const validOption = {
  quoteId: "flyai:7c4198543e0fde40f3da35015176499ecef35a5c9241186a6f31d01e65a8af7e",
  providerQuoteId: "native-quote-1",
  mode: "flight",
  source: "real",
  provider: "flyai",
  priceCny: 860,
  departAt: "2026-07-20T08:00:00+08:00",
  arriveAt: "2026-07-20T10:15:00+08:00",
  durationMinutes: 135,
  isDirect: true,
  hasTransfer: false,
  transferCount: 0,
  serviceName: "MU5101",
  departureStationName: "北京首都",
  arrivalStationName: "上海虹桥",
  bookingUrl: "https://www.fliggy.com/booking/flight",
} as const;

function serviceNameFor(segmentCount: number, segmentLength = 8): string {
  return Array.from(
    { length: segmentCount },
    (_, index) => `${String(index + 1).padStart(2, "0")}${"X".repeat(segmentLength - 2)}`,
  ).join(" → ");
}

describe("gatewaySearchRequestSchema", () => {
  it("accepts a valid normalized search", () => {
    expect(gatewaySearchRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects unknown keys and unsupported modes", () => {
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, participantName: "Alice" })).toThrow();
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, mode: "bus" })).toThrow();
  });

  it("rejects impossible dates and oversized city names", () => {
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, departureDate: "2026-02-30" })).toThrow();
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, originCityName: "北".repeat(25) })).toThrow();
  });

  it("requires departureDate and rejects the former meetingDate field", () => {
    const withoutDepartureDate: Record<string, unknown> = { ...validRequest };
    delete withoutDepartureDate.departureDate;
    expect(() => gatewaySearchRequestSchema.parse(withoutDepartureDate)).toThrow();
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, meetingDate: "2026-07-20" })).toThrow();
  });
});

describe("gatewayTravelOptionSchema", () => {
  it("accepts a complete real FlyAI option", () => {
    expect(gatewayTravelOptionSchema.parse(validOption)).toEqual(validOption);
  });

  it("rejects unknown keys, negative or fractional prices, and invalid timestamps", () => {
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, rawPayload: {} })).toThrow();
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, priceCny: -1 })).toThrow();
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, priceCny: 1.5 })).toThrow();
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, departAt: "2026-07-20T08:00:00" })).toThrow();
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, arriveAt: "not-a-time" })).toThrow();
  });

  it("requires route identity and rejects unsafe booking URLs", () => {
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, serviceName: " " })).toThrow();
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, bookingUrl: "http://www.fliggy.com/booking" })).toThrow();
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, bookingUrl: "https://evil.example/booking" })).toThrow();
    expect(() => gatewayTravelOptionSchema.parse({ ...validOption, bookingUrl: "https://fliggy.com.evil/booking" })).toThrow();
    expect(gatewayTravelOptionSchema.parse({ ...validOption, bookingUrl: "https://a.feizhu.com/booking" }).bookingUrl)
      .toBe("https://a.feizhu.com/booking");
    expect(gatewayTravelOptionSchema.parse({ ...validOption, bookingUrl: null }).bookingUrl).toBeNull();
  });

  it("rejects a direct service identity longer than 64 characters", () => {
    expect(() => gatewayTravelOptionSchema.parse({
      ...validOption,
      serviceName: "X".repeat(65),
    })).toThrow();
  });

  it("accepts canonical service names for two through eight segments", () => {
    for (let segmentCount = 2; segmentCount <= 8; segmentCount += 1) {
      const option = {
        ...validOption,
        isDirect: false,
        hasTransfer: true,
        transferCount: segmentCount - 1,
        serviceName: serviceNameFor(segmentCount, 64),
      };

      expect(gatewayTravelOptionSchema.parse(option)).toEqual(option);
    }
  });

  it("rejects a connecting service identity with an oversized segment", () => {
    expect(() => gatewayTravelOptionSchema.parse({
      ...validOption,
      isDirect: false,
      hasTransfer: true,
      transferCount: 1,
      serviceName: `${"X".repeat(65)} → MU5202`,
    })).toThrow();
  });

  it("rejects more than eight service identity segments", () => {
    expect(() => gatewayTravelOptionSchema.parse({
      ...validOption,
      isDirect: false,
      hasTransfer: true,
      transferCount: 8,
      serviceName: serviceNameFor(9),
    })).toThrow();
  });

  it("rejects a noncanonical service identity separator", () => {
    expect(() => gatewayTravelOptionSchema.parse({
      ...validOption,
      isDirect: false,
      hasTransfer: true,
      transferCount: 1,
      serviceName: "MU5101→MU5202",
    })).toThrow();
  });

  it("rejects a segment count that disagrees with transferCount", () => {
    expect(() => gatewayTravelOptionSchema.parse({
      ...validOption,
      isDirect: false,
      hasTransfer: true,
      transferCount: 2,
      serviceName: "MU5101 → MU5202",
    })).toThrow();
  });

  it.each([
    { isDirect: true, hasTransfer: true, transferCount: 0 },
    { isDirect: true, hasTransfer: false, transferCount: 1 },
    { isDirect: false, hasTransfer: false, transferCount: 1 },
    { isDirect: false, hasTransfer: true, transferCount: 0 },
  ])("rejects inconsistent direct and transfer indicators: %j", (indicators) => {
    expect(() => gatewayTravelOptionSchema.parse({
      ...validOption,
      ...indicators,
      serviceName: indicators.isDirect ? "MU5101" : "MU5101 → MU5202",
    })).toThrow();
  });
});

describe("gateway error schema", () => {
  it("keeps the public error code set stable", () => {
    const codes = [
      "UNAUTHORIZED",
      "INVALID_REQUEST",
      "PROVIDER_TIMEOUT",
      "PROVIDER_UNAVAILABLE",
      "PROVIDER_NO_ROUTE",
      "PROVIDER_NO_TICKET",
      "PROVIDER_RATE_LIMITED",
      "PROVIDER_UPSTREAM_UNAVAILABLE",
      "PROVIDER_CLI_FAILED",
      "PROVIDER_INVALID_RESPONSE",
      "INTERNAL_ERROR",
    ] as const;

    for (const code of codes) {
      expect(gatewayErrorCodeSchema.parse(code)).toBe(code);
    }
    expect(() => gatewayErrorCodeSchema.parse("UNKNOWN_ERROR")).toThrow();
  });

  it("accepts only a strict nonempty error body", () => {
    const errorBody = {
      code: "PROVIDER_TIMEOUT",
      message: "FlyAI request timed out",
      traceId: "6f8ae519-a19f-4d4a-baa9-4b4ab9a07c3e",
      retryAfterMs: null,
    } as const;

    expect(gatewayErrorBodySchema.parse(errorBody)).toEqual(errorBody);
    expect(() => gatewayErrorBodySchema.parse({ ...errorBody, code: "UNKNOWN_ERROR" })).toThrow();
    expect(() => gatewayErrorBodySchema.parse({ ...errorBody, message: " " })).toThrow();
    expect(() => gatewayErrorBodySchema.parse({ ...errorBody, retryAfter: 5 })).toThrow();
    expect(() => gatewayErrorBodySchema.parse({ ...errorBody, retryAfterMs: -1 })).toThrow();
  });
});

describe("gatewaySearchResponseSchema", () => {
  it("accepts a strict response with a query timestamp", () => {
    const response = {
      options: [validOption],
      queriedAt: "2026-07-12T12:00:00Z",
      traceId: "6f8ae519-a19f-4d4a-baa9-4b4ab9a07c3e",
      cache: "miss",
    };
    expect(gatewaySearchResponseSchema.parse(response)).toEqual(response);
    expect(() => gatewaySearchResponseSchema.parse({ ...response, providerRanking: 1 })).toThrow();
  });
});
