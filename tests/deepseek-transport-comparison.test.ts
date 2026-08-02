import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { AgentModel } from "@/lib/agent/model";
import {
  compareDeepSeekTransports,
  type DeepSeekComparisonModelFactory,
} from "@/lib/agent/deepseek-transport-comparison";

const schema = z.object({ decision: z.enum(["approve", "correct"]) }).strict();

describe("DeepSeek transport comparison", () => {
  it("compares identical requests and emits only aggregate redacted metrics", async () => {
    const createModel: DeepSeekComparisonModelFactory = (transport, observe) => ({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      async generate(request) {
        observe({
          transport,
          agent: request.agent,
          schemaQualified: true,
          latencyMs: transport === "responses" ? 120 : 100,
          inputTokens: 10,
          outputTokens: 2,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          totalTokens: 12,
          retryCount: transport === "responses" ? 1 : 0,
          errorCode: null,
          providerHttpStatus: null,
          providerErrorCategory: "none",
        });
        return request.outputSchema.parse({ decision: "approve" });
      },
    } as AgentModel);
    const request = {
      agent: "supervisor" as const,
      system: "PRIVATE_SYSTEM_MARKER",
      input: { cityCode: "PRIVATE_INPUT_MARKER" },
      outputSchema: schema,
      traceId: "00000000-0000-4000-8000-000000000001",
    };

    const report = await compareDeepSeekTransports({
      cases: [{
        name: "supervisor",
        request,
        qualify: (value) => schema.parse(value).decision === "approve",
      }],
      iterations: 2,
      createModel,
    });

    expect(report).toEqual(expect.objectContaining({
      model: "deepseek-v4-flash",
      pairedCalls: 2,
      transports: expect.objectContaining({
        chat_completions: expect.objectContaining({
          calls: 2,
          schemaQualified: 2,
          downstreamQualified: 2,
          p95LatencyMs: 100,
          totalTokens: 24,
          retries: 0,
        }),
        responses: expect.objectContaining({
          calls: 2,
          schemaQualified: 2,
          downstreamQualified: 2,
          p95LatencyMs: 120,
          totalTokens: 24,
          retries: 2,
        }),
      }),
    }));
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("PRIVATE_SYSTEM_MARKER");
    expect(serialized).not.toContain("PRIVATE_INPUT_MARKER");
    expect(serialized).not.toContain(request.traceId);
    expect(serialized).not.toContain("approve");
  });

  it("rejects unbounded comparison iteration counts", async () => {
    const createModel: DeepSeekComparisonModelFactory = () => ({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      generate: async () => ({ decision: "approve" }),
    });

    await expect(compareDeepSeekTransports({
      cases: [{
        name: "supervisor",
        request: {
          agent: "supervisor",
          system: "system",
          input: {},
          outputSchema: schema,
          traceId: "00000000-0000-4000-8000-000000000001",
        },
        qualify: () => true,
      }],
      iterations: 101,
      createModel,
    })).rejects.toThrow("INVALID_COMPARISON_LIMIT");
  });
});
