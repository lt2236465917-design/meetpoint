import { describe, expect, it } from "vitest";
import { summarizeProbeResult } from "../scripts/probe-travel-providers.mjs";

describe("provider probe", () => {
  it("does not expose payload values", () => {
    const result = summarizeProbeResult("flyai", 123, [{
      price: 599,
      bookingUrl: "https://www.fliggy.com/secret-token",
      flightNo: "MU5101",
    }]);
    expect(result).toEqual({
      provider: "flyai", status: "ok", latencyMs: 123, resultCount: 1,
      fieldNames: ["bookingUrl", "flightNo", "price"],
    });
    expect(JSON.stringify(result)).not.toContain("599");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
