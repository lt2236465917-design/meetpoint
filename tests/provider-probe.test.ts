import { describe, expect, it, vi } from "vitest";
import {
  probeFlyAI,
  resolveFlyAIProbeExecutable,
  resolveProbeTravelDate,
  summarizeFlyAIProbeResult,
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

  it("summarizes direct and connecting FlyAI coverage without exposing route facts", () => {
    const result = summarizeFlyAIProbeResult(123, [
      { price: 599, journeys: [{ segments: [{ transportNo: "G1" }] }] },
      { price: 699, journeys: [{ segments: [{ transportNo: "G2" }, { transportNo: "G3" }] }] },
      { price: 799, journeys: [{}] },
    ]);

    expect(result).toEqual({
      provider: "flyai",
      status: "ok",
      latencyMs: 123,
      resultCount: 3,
      fieldNames: ["journeys", "price"],
      directCount: 1,
      connectingCount: 1,
      unclassifiedCount: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(/599|699|799|G1|G2|G3/);
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

  it("allows a redacted operator probe to compare direct-first sorting", async () => {
    process.env.FLYAI_API_KEY = "secret-token";
    process.env.PROBE_FLYAI_SORT_TYPE = "8";
    const exec = vi.fn(async () => ({
      stdout: JSON.stringify({ data: { itemList: [] } }),
    }));

    await probeFlyAI({ exec });

    expect(exec).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["--sort-type", "8"]),
      expect.objectContaining({ shell: false }),
    );
    const args = exec.mock.calls[0]?.[1] as string[];
    expect(args).not.toContain("--journey-type");
    delete process.env.PROBE_FLYAI_SORT_TYPE;
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
