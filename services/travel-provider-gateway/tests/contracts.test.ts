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
  meetingDate: "2026-07-20",
  mode: "flight",
} as const;

const validOption = {
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
  bookingUrl: "https://www.fliggy.com/booking/flight",
} as const;

describe("gatewaySearchRequestSchema", () => {
  it("accepts a valid normalized search", () => {
    expect(gatewaySearchRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects unknown keys and unsupported modes", () => {
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, participantName: "Alice" })).toThrow();
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, mode: "bus" })).toThrow();
  });

  it("rejects impossible dates and oversized city names", () => {
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, meetingDate: "2026-02-30" })).toThrow();
    expect(() => gatewaySearchRequestSchema.parse({ ...validRequest, originCityName: "北".repeat(25) })).toThrow();
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
    expect(gatewayTravelOptionSchema.parse({ ...validOption, bookingUrl: null }).bookingUrl).toBeNull();
  });
});

describe("gateway error schema", () => {
  it("keeps the public error code set stable", () => {
    const codes = [
      "UNAUTHORIZED",
      "INVALID_REQUEST",
      "PROVIDER_TIMEOUT",
      "PROVIDER_UNAVAILABLE",
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
    } as const;

    expect(gatewayErrorBodySchema.parse(errorBody)).toEqual(errorBody);
    expect(() => gatewayErrorBodySchema.parse({ ...errorBody, code: "UNKNOWN_ERROR" })).toThrow();
    expect(() => gatewayErrorBodySchema.parse({ ...errorBody, message: " " })).toThrow();
    expect(() => gatewayErrorBodySchema.parse({ ...errorBody, retryAfter: 5 })).toThrow();
  });
});

describe("gatewaySearchResponseSchema", () => {
  it("accepts a strict response with a query timestamp", () => {
    const response = {
      options: [validOption],
      queriedAt: "2026-07-12T12:00:00Z",
    };
    expect(gatewaySearchResponseSchema.parse(response)).toEqual(response);
    expect(() => gatewaySearchResponseSchema.parse({ ...response, providerRanking: 1 })).toThrow();
  });
});
