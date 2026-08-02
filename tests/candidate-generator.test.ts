import { describe, expect, it } from "vitest";
import { generateCandidateCities } from "@/lib/city/candidate-generator";

describe("generateCandidateCities", () => {
  it("includes departure cities, host additions, hubs, and excludes manual removals", () => {
    const candidates = generateCandidateCities({
      departureCityCodes: ["beijing", "shanghai", "guangzhou"],
      manualAddCityCodes: ["wuhan"],
      manualExcludeCityCodes: ["shanghai"],
      limit: 8,
    });

    const codes = candidates.map((city) => city.code);
    expect(codes).toContain("beijing");
    expect(codes).toContain("guangzhou");
    expect(codes).toContain("wuhan");
    expect(codes).not.toContain("shanghai");
    expect(codes.length).toBeLessThanOrEqual(8);
  });

  it("uses canonical coordinates from an Amap-only departure in midpoint ranking", () => {
    const candidates = generateCandidateCities({
      departureCityCodes: ["beijing", "amap-460200"],
      departureCoordinates: [
        { code: "beijing", lat: 39.9042, lng: 116.4074 },
        { code: "amap-460200", lat: 18.2528, lng: 109.5119 },
      ],
      limit: 4,
    });

    const withoutSouthernOrigin = generateCandidateCities({
      departureCityCodes: ["beijing", "amap-460200"],
      departureCoordinates: [
        { code: "beijing", lat: 39.9042, lng: 116.4074 },
        { code: "amap-460200", lat: 39.9042, lng: 116.4074 },
      ],
      limit: 4,
    });

    expect(candidates).toHaveLength(4);
    expect(candidates[0]?.code).toBe("wuhan");
    expect(withoutSouthernOrigin[0]?.code).not.toBe(candidates[0]?.code);
  });

  it("fails closed instead of substituting a default midpoint when coordinates are missing", () => {
    expect(generateCandidateCities({
      departureCityCodes: ["amap-230200", "amap-460200"],
    })).toEqual([]);
  });
});
