import { describe, expect, it } from "vitest";
import {
  probeFlyAI,
  resolveFlyAIProbeExecutable,
  resolveProbeTravelDate,
  summarizeProbeResult,
} from "../scripts/probe-travel-providers.mjs";

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

  it("uses the gateway-local FlyAI CLI bundle by default", () => {
    const executable = resolveFlyAIProbeExecutable();
    expect(executable).toMatch(/services\/travel-provider-gateway\/node_modules\/@fly-ai\/flyai-cli\/dist\/flyai-bundle\.cjs$/);
  });

  it("uses tomorrow for the live probe date by default", () => {
    expect(resolveProbeTravelDate(new Date("2026-07-12T12:00:00.000Z"))).toBe("2026-07-13");
  });

  it("maps FlyAI execution failures to redacted stable statuses", async () => {
    process.env.FLYAI_API_KEY = "secret-token";
    const error = Object.assign(new Error("secret-token https://provider.example/raw"), { code: "ETIMEDOUT" });
    const exec = async () => {
      throw error;
    };

    const result = await probeFlyAI({ exec });

    expect(result).toEqual({
      provider: "flyai", status: "provider_timeout", latencyMs: expect.any(Number), resultCount: 0, fieldNames: [],
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(JSON.stringify(result)).not.toContain("provider.example");
    delete process.env.FLYAI_API_KEY;
  });

  it("does not treat offline FlyAI tool plans as live provider results", async () => {
    process.env.FLYAI_API_KEY = "secret-token";
    const exec = async () => ({
      stdout: JSON.stringify({ tool: "search_train", arguments: { origin: "北京", destination: "上海" } }),
    });

    const result = await probeFlyAI({ exec });

    expect(result).toEqual({
      provider: "flyai", status: "provider_unconfigured", latencyMs: expect.any(Number), resultCount: 0, fieldNames: [],
    });
    expect(JSON.stringify(result)).not.toContain("北京");
    expect(JSON.stringify(result)).not.toContain("上海");
    delete process.env.FLYAI_API_KEY;
  });
});
