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
});
